'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminUser } from '@/lib/require-admin'
import { createServiceClient } from '@/lib/supabase/service'
import { after } from 'next/server'
import { sendTicketReplyEmail } from '@/lib/ticket-email'

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
