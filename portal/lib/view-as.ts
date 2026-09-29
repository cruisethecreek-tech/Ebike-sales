import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

/**
 * Looking at the portal as one of the customers sees it.
 *
 * The shop had no way to answer "what does this actually look like to them?"
 * without knowing someone's password. Everything staff-facing shows the data —
 * the invoice totals, the bikes, the badges — and none of it shows the page.
 *
 * This is a preview, not a login. It swaps which customer the dashboard reads
 * from and nothing else: the session stays the admin's, every query still runs
 * under the admin's own RLS policies (which already allow reading any
 * customer), and nothing is written as the customer. Real impersonation —
 * minting a session for someone else — would mean an admin could take actions
 * in a customer's name with no way afterwards to tell who did what.
 *
 * The cookie only names a customer. Whether that name is honoured is decided
 * here, on every read, by checking the signed-in user is still an admin — so a
 * cookie copied to another browser does nothing at all.
 */
export const VIEW_AS_COOKIE = 'ctc_view_as'

export type ViewerContext = {
  /** Whose data the page should show. */
  userId: string | null
  /** Who is actually signed in. */
  realUserId: string | null
  /** The address that belongs to `userId`. */
  email: string | null
  /** Set only while previewing; null in normal use. */
  viewingAs: { id: string; name: string } | null
}

export async function getViewerContext(): Promise<ViewerContext> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const realUserId = user?.id ?? null

  const store = await cookies()
  const wanted = store.get(VIEW_AS_COOKIE)?.value?.trim()
  const asMyself = (): ViewerContext => ({
    userId: realUserId,
    realUserId,
    email: user?.email ?? null,
    viewingAs: null,
  })

  if (!realUserId || !wanted || wanted === realUserId) return asMyself()

  // Re-checked on every request, not trusted from when the cookie was set. An
  // admin who is no longer an admin stops previewing immediately.
  const { data: me } = await supabase
    .from('customers')
    .select('is_admin')
    .eq('id', realUserId)
    .single()
  if (!me?.is_admin) return asMyself()

  // The email lives in auth.users, not here, and the banner does not need it.
  const { data: target } = await supabase
    .from('customers')
    .select('id, first_name, last_name')
    .eq('id', wanted)
    .single()
  if (!target) return asMyself()

  const name = [target.first_name, target.last_name].filter(Boolean).join(' ').trim()

  // Their address, so referral and intake links preview with the details the
  // customer would actually see prefilled, not the admin's.
  let email: string | null = null
  try {
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const { data } = await admin.auth.admin.getUserById(target.id)
    email = data?.user?.email ?? null
  } catch {
    // A missing address is cosmetic here; it must not break the preview.
  }

  return {
    userId: target.id,
    realUserId,
    email,
    viewingAs: { id: target.id, name: name || 'this customer' },
  }
}
