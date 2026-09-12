import { createClient } from '@/lib/supabase/server'

/**
 * Assert that the caller is a signed-in admin, for use at the top of every
 * admin server action.
 *
 * The /admin layout already redirects non-admins, but a layout only guards
 * rendering. Server actions are POST endpoints reachable by anyone who can
 * reach the app — the redirect never runs for them. Several of these actions
 * use the service-role key, which bypasses every RLS policy, so without this
 * check any signed-in customer could invite users, edit another customer's
 * bikes, or delete records.
 *
 * Throws rather than returning a flag so a missed `await` can't silently
 * become an authorised call.
 */
export async function requireAdminUser(): Promise<string> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in.')

  const { data: customer, error } = await supabase
    .from('customers')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (error || !customer?.is_admin) throw new Error('Admin access required.')

  return user.id
}
