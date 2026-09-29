import { createClient } from '@/lib/supabase/server'

/**
 * Whether the signed-in person is staff, for showing admin shortcuts on the
 * customer pages. Read from their own login, not from whoever they are
 * previewing with View as, so the way back stays while previewing.
 *
 * Display only. Admin pages and actions still check with requireAdminUser.
 */
export async function signedInIsAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase.from('customers').select('is_admin').eq('id', user.id).maybeSingle()
  return !!data?.is_admin
}
