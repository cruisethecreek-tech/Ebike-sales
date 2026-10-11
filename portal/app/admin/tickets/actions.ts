'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminUser } from '@/lib/require-admin'
import { createServiceClient } from '@/lib/supabase/service'
import { after } from 'next/server'
import { sendRepairStageEmail, sendTicketReplyEmail } from '@/lib/ticket-email'
import { isRepairStage, repairStageInfo, statusForStage, type RepairStage } from '@/lib/repair-stages'

const STATUSES = ['open', 'in progress', 'resolved'] as const
export type TicketStatus = (typeof STATUSES)[number]

/**
 * Move a service ticket along. Staff only; customers can read their tickets
 * but have no policy that lets them change one once it is not open.
 *
 * resolved_at is set with "resolved" and cleared otherwise: the table's
 * check constraint refuses any other pairing.
 */
export async function setTicketStatus(ticketId: string, status: string): Promise<{ ok: boolean; message: string }> {
  await requireAdminUser()
  if (!ticketId) return { ok: false, message: 'No ticket was specified.' }
  if (!(STATUSES as readonly string[]).includes(status)) return { ok: false, message: 'That is not a ticket status.' }

  const { data, error } = await createServiceClient()
    .from('service_tickets')
    .update({
      status,
      resolved_at: status === 'resolved' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
      // A resolved ticket is off the to-do list.
      ...(status === 'resolved' ? { needs_reply: false } : {}),
    })
    .eq('id', ticketId)
    .select('id')
  if (error) return { ok: false, message: 'Not saved: ' + error.message }
  if (!data || data.length === 0) return { ok: false, message: 'That ticket no longer exists.' }

  revalidatePath('/admin', 'layout')
  revalidatePath('/support')
  return { ok: true, message: 'Saved.' }
}

/**
 * Answer a customer's ticket. Saves the reply, takes the ticket off the
 * shop's "needs a reply" list, marks it unread for the customer, moves an
 * open ticket to "in progress", and emails the customer the reply.
 */
export async function replyToTicket(ticketId: string, body: string): Promise<{ ok: boolean; message: string }> {
  const adminId = await requireAdminUser()
  const text = (body || '').trim()
  if (!ticketId) return { ok: false, message: 'No ticket was specified.' }
  if (!text) return { ok: false, message: 'Write a reply first.' }
  if (text.length > 4000) return { ok: false, message: 'That reply is too long (4000 characters at most).' }

  const db = createServiceClient()
  const { data: ticket, error: readErr } = await db
    .from('service_tickets')
    .select('id, customer_id, ticket_type, status, customers(first_name, last_name, phone)')
    .eq('id', ticketId)
    .maybeSingle()
  if (readErr) return { ok: false, message: 'Not sent: ' + readErr.message }
  if (!ticket) return { ok: false, message: 'That ticket no longer exists.' }

  const { error: insertErr } = await db
    .from('ticket_messages')
    .insert({ ticket_id: ticketId, from_staff: true, author_id: adminId, body: text })
  if (insertErr) return { ok: false, message: 'Not sent: ' + insertErr.message }

  await db
    .from('service_tickets')
    .update({
      needs_reply: false,
      customer_unread: true,
      updated_at: new Date().toISOString(),
      ...(ticket.status === 'open' ? { status: 'in progress' } : {}),
    })
    .eq('id', ticketId)

  const customer = (Array.isArray(ticket.customers) ? ticket.customers[0] : ticket.customers) as
    | { first_name: string | null; last_name: string | null; phone: string | null }
    | null
  after(async () => {
    const { data: account } = await db.auth.admin.getUserById(ticket.customer_id)
    const sent = await sendTicketReplyEmail({
      ticketId,
      ticketType: ticket.ticket_type,
      from: 'staff',
      message: text,
      firstName: customer?.first_name || '',
      lastName: customer?.last_name || '',
      email: account?.user?.email || '',
      phone: customer?.phone || '',
    })
    if (!sent.ok) console.warn(`ticket ${ticketId}: reply email not sent: ${sent.error}`)
  })

  revalidatePath('/admin', 'layout')
  revalidatePath('/support')
  return { ok: true, message: 'Reply sent.' }
}

/** Take a ticket off the "needs a reply" list without writing one, e.g. after a phone call. */
export async function markTicketHandled(ticketId: string): Promise<{ ok: boolean; message: string }> {
  await requireAdminUser()
  if (!ticketId) return { ok: false, message: 'No ticket was specified.' }
  const { error } = await createServiceClient()
    .from('service_tickets')
    .update({ needs_reply: false, updated_at: new Date().toISOString() })
    .eq('id', ticketId)
  if (error) return { ok: false, message: 'Not saved: ' + error.message }
  revalidatePath('/admin', 'layout')
  return { ok: true, message: 'Marked as handled.' }
}

/** Delete a ticket and its replies for good. Staff only. */
export async function deleteTicket(ticketId: string): Promise<{ ok: boolean; message: string }> {
  await requireAdminUser()
  if (!ticketId) return { ok: false, message: 'No ticket was specified.' }
  const { error } = await createServiceClient().from('service_tickets').delete().eq('id', ticketId)
  if (error) return { ok: false, message: 'Not deleted: ' + error.message }
  revalidatePath('/admin', 'layout')
  revalidatePath('/support')
  return { ok: true, message: 'Deleted.' }
}

type Db = ReturnType<typeof createServiceClient>

/**
 * Record a stage change and email the customer about it. Shared by
 * checkInRepair and setRepairStage; the caller has already checked the
 * user is staff.
 */
async function recordStage(db: Db, adminId: string, ticketId: string, stage: RepairStage, note: string) {
  const now = new Date().toISOString()
  const status = statusForStage(stage)
  const { data: ticket, error } = await db
    .from('service_tickets')
    .update({
      repair_stage: stage,
      repair_stage_at: now,
      status,
      resolved_at: status === 'resolved' ? now : null,
      updated_at: now,
      ...(status === 'resolved' ? { needs_reply: false } : {}),
    })
    .eq('id', ticketId)
    .select('id, customer_id, customers(first_name), bikes!service_tickets_bike_id_fkey(brand, model)')
    .maybeSingle()
  if (error) return { ok: false, message: 'Not saved: ' + error.message }
  if (!ticket) return { ok: false, message: 'That ticket no longer exists.' }

  const { error: eventErr } = await db
    .from('repair_stage_events')
    .insert({ ticket_id: ticketId, stage, note: note || null, author_id: adminId })
  if (eventErr) return { ok: false, message: 'Stage saved, but its history was not: ' + eventErr.message }

  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)
  const customer = one(ticket.customers as { first_name: string | null } | { first_name: string | null }[] | null)
  const bike = one(ticket.bikes as { brand: string | null; model: string | null } | { brand: string | null; model: string | null }[] | null)
  const info = repairStageInfo(stage)!
  after(async () => {
    const { data: account } = await db.auth.admin.getUserById(ticket.customer_id)
    const sent = await sendRepairStageEmail({
      ticketId,
      stage,
      stageLabel: info.label,
      blurb: info.blurb,
      note,
      bike: bike ? `${bike.brand || ''} ${bike.model || ''}`.trim() : '',
      firstName: customer?.first_name || '',
      email: account?.user?.email || '',
    })
    if (!sent.ok) console.warn(`ticket ${ticketId}: repair stage email not sent: ${sent.error}`)
  })

  revalidatePath('/admin', 'layout')
  revalidatePath('/support')
  revalidatePath('/dashboard')
  return { ok: true, message: `Moved to ${info.label}. The customer has been emailed.` }
}

function cleanNote(note: unknown): string | null {
  const text = String(note ?? '').trim()
  return text.length > 500 ? null : text
}

/**
 * Move a ticket's bike to a repair stage. Works on any ticket, so a
 * customer's own "my brakes squeak" ticket can become a tracked repair.
 * "Picked up" resolves the ticket; any other stage keeps it in progress.
 */
export async function setRepairStage(
  ticketId: string,
  stage: string,
  note?: string,
): Promise<{ ok: boolean; message: string }> {
  const adminId = await requireAdminUser()
  if (!ticketId) return { ok: false, message: 'No ticket was specified.' }
  if (!isRepairStage(stage)) return { ok: false, message: 'That is not a repair stage.' }
  const text = cleanNote(note)
  if (text === null) return { ok: false, message: 'Keep the note under 500 characters.' }
  return recordStage(createServiceClient(), adminId, ticketId, stage, text)
}

export type CheckInResult = { ok: boolean; message: string } | null

/**
 * Check a customer's bike in for repair from their card in Admin >
 * Customers: opens a "repair" ticket at the Checked in stage and emails the
 * customer a link to follow along.
 */
export async function checkInRepair(_prev: CheckInResult, formData: FormData): Promise<CheckInResult> {
  const adminId = await requireAdminUser()
  const customerId = String(formData.get('customer_id') || '')
  const bikeId = String(formData.get('bike_id') || '') || null
  const description = String(formData.get('description') || '').trim()
  const note = cleanNote(formData.get('note'))
  if (!customerId) return { ok: false, message: 'No customer was specified.' }
  if (!description) return { ok: false, message: "Say what's wrong with the bike." }
  if (description.length > 2000) return { ok: false, message: 'Keep the description under 2000 characters.' }
  if (note === null) return { ok: false, message: 'Keep the note under 500 characters.' }

  const db = createServiceClient()
  const { data: ticket, error } = await db
    .from('service_tickets')
    .insert({
      customer_id: customerId,
      bike_id: bikeId,
      ticket_type: 'repair',
      status: 'in progress',
      description,
      needs_reply: false,
    })
    .select('id')
    .single()
  if (error) return { ok: false, message: 'Not checked in: ' + error.message }

  return recordStage(db, adminId, ticket.id, 'checked_in', note)
}
