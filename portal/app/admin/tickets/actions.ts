'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminUser } from '@/lib/require-admin'
import { createServiceClient } from '@/lib/supabase/service'

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
    })
    .eq('id', ticketId)
    .select('id')
  if (error) return { ok: false, message: 'Not saved: ' + error.message }
  if (!data || data.length === 0) return { ok: false, message: 'That ticket no longer exists.' }

  revalidatePath('/admin/tickets')
  revalidatePath('/support')
  return { ok: true, message: 'Saved.' }
}
