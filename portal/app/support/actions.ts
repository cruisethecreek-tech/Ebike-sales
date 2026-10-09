'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { sendTicketEmail } from '@/lib/ticket-email'

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
