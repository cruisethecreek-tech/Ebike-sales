'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { sendTicketEmail, sendTicketReplyEmail } from '@/lib/ticket-email'
import { createServiceClient } from '@/lib/supabase/service'

export async function createTicket(prevState: any, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const ticket_type = formData.get('ticket_type') as string
  const bike_id = formData.get('bike_id') as string
  const description = formData.get('description') as string

  if (!ticket_type || !description) {
    return { error: 'Ticket type and description are required' }
  }

  const payload: any = {
    customer_id: user.id,
    ticket_type,
    description,
    status: 'open'
  }

  if (bike_id && bike_id.trim() !== '') {
    payload.bike_id = bike_id
  }

  const { data: ticket, error } = await supabase.from('service_tickets').insert(payload).select('id').single()

  if (error) {
    console.error('Error creating ticket:', error)
    return { error: 'Failed to create ticket. Please try again.' }
  }

  // Email the shop and the customer once the page has answered, so a slow
  // mailer never holds up "Ticket created".
  const { data: customer } = await supabase
    .from('customers')
    .select('first_name, last_name, phone')
    .eq('id', user.id)
    .maybeSingle()
  const { data: bike } = payload.bike_id
    ? await supabase.from('bikes').select('brand, model').eq('id', payload.bike_id).maybeSingle()
    : { data: null }
  after(async () => {
    const sent = await sendTicketEmail({
      ticketId: ticket.id,
      ticketType: ticket_type,
      description,
      bike: bike ? `${bike.brand || ''} ${bike.model || ''}`.trim() : '',
      firstName: customer?.first_name || '',
      lastName: customer?.last_name || '',
      email: user.email || '',
      phone: customer?.phone || '',
    })
    if (!sent.ok) console.warn(`ticket ${ticket.id}: email not sent: ${sent.error}`)
  })

  revalidatePath('/support')
  revalidatePath('/admin/tickets')
  return { success: true }
}

/**
 * The customer answers the shop on one of their own tickets. Puts the ticket
 * back on the shop's "needs a reply" list (reopening it if it was resolved)
 * and alerts the shop.
 */
export async function replyToMyTicket(ticketId: string, body: string): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Please sign in again.' }
  const text = (body || '').trim()
  if (!text) return { ok: false, message: 'Write a message first.' }
  if (text.length > 4000) return { ok: false, message: 'That message is too long (4000 characters at most).' }

  // Read through the customer's own client: RLS only returns their tickets,
  // so this doubles as the ownership check before the service client writes.
  const { data: ticket } = await supabase
    .from('service_tickets')
    .select('id, ticket_type, status')
    .eq('id', ticketId)
    .eq('customer_id', user.id)
    .maybeSingle()
  if (!ticket) return { ok: false, message: 'That ticket was not found.' }

  const db = createServiceClient()
  const { error } = await db
    .from('ticket_messages')
    .insert({ ticket_id: ticket.id, from_staff: false, author_id: user.id, body: text })
  if (error) return { ok: false, message: 'Not sent. Please try again.' }

  await db
    .from('service_tickets')
    .update({
      needs_reply: true,
      customer_unread: false,
      updated_at: new Date().toISOString(),
      ...(ticket.status === 'resolved' ? { status: 'open', resolved_at: null } : {}),
    })
    .eq('id', ticket.id)

  const { data: customer } = await supabase
    .from('customers')
    .select('first_name, last_name, phone')
    .eq('id', user.id)
    .maybeSingle()
  after(async () => {
    const sent = await sendTicketReplyEmail({
      ticketId: ticket.id,
      ticketType: ticket.ticket_type,
      from: 'customer',
      message: text,
      firstName: customer?.first_name || '',
      lastName: customer?.last_name || '',
      email: user.email || '',
      phone: customer?.phone || '',
    })
    if (!sent.ok) console.warn(`ticket ${ticket.id}: reply alert not sent: ${sent.error}`)
  })

  revalidatePath('/support')
  revalidatePath('/admin', 'layout')
  return { ok: true, message: 'Sent. Pat and Dru have been notified.' }
}

/** The customer has seen the shop's replies: clear their "new reply" badge. */
export async function markMyRepliesRead(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await createServiceClient()
    .from('service_tickets')
    .update({ customer_unread: false })
    .eq('customer_id', user.id)
    .eq('customer_unread', true)
  // No revalidate: the page keeps its "New reply" marks for this visit, and
  // the badge clears on the next page load.
}
