import { createClient } from '@/lib/supabase/server'

/**
 * How many of the signed-in customer's tickets have a shop reply they have
 * not seen yet. Drives the badge on Support. Errors count as zero so a
 * badge can never break a page.
 */
export async function unreadTicketReplies(): Promise<number> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 0
    const { count, error } = await supabase
      .from('service_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', user.id)
      .eq('customer_unread', true)
    return error ? 0 : count || 0
  } catch {
    return 0
  }
}
