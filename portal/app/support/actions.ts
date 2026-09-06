'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

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

  const { error } = await supabase.from('service_tickets').insert(payload)

  if (error) {
    console.error('Error creating ticket:', error)
    return { error: 'Failed to create ticket. Please try again.' }
  }

  revalidatePath('/support')
  return { success: true }
}
