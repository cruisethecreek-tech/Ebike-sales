import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Find a login by email address, looking past the first page.
 *
 * `supabase.auth.admin.listUsers()` returns 50 users by default. The shop has
 * 61. So eleven customers — the eleven oldest, because the list comes back
 * newest first — were invisible to every caller that used it unpaginated.
 *
 * What that looked like: saving an old invoice found no user for a customer
 * who plainly exists, went on to create one, and Supabase answered "A user
 * with this email address has already been registered". The route threw, the
 * browser showed HTTP 500, and the invoice appeared to fail. Don Eagle is
 * rank 52 of 61; every invoice the shop touched from CTR-018 upward worked,
 * and the older ones did not.
 *
 * It got worse as the shop grew. At 50 customers nothing was wrong; at 51 one
 * person broke, and the boundary moves with every new account.
 */
export async function findAuthUserByEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<{ id: string; email?: string } | null> {
  const wanted = String(email || '').trim().toLowerCase()
  if (!wanted) return null

  // 1000 is the cap Supabase allows per page, so one request covers any list
  // this shop is likely to have. The loop is what makes that a detail rather
  // than a new limit to trip over later.
  const PER_PAGE = 1000
  const MAX_PAGES = 50

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PER_PAGE })
    if (error) throw error

    const users = data?.users || []
    const hit = users.find((u: any) => String(u.email || '').toLowerCase() === wanted)
    if (hit) return hit as { id: string; email?: string }

    // A short page is the last page.
    if (users.length < PER_PAGE) return null
  }

  // Reaching here means more than 50,000 accounts, which is not this shop.
  // Say so rather than reporting "not found" and creating a duplicate.
  throw new Error(`Could not search past ${MAX_PAGES * PER_PAGE} accounts for ${wanted}.`)
}

/**
 * True when Supabase is refusing a create/invite because the account exists.
 *
 * Belt and braces alongside the paginated lookup: two saves of the same new
 * customer can race, and the second would otherwise fail on an account the
 * first had just made. The message is matched loosely because it is prose
 * from the API, not a code.
 */
export function isAlreadyRegistered(err: any): boolean {
  const msg = String(err?.message || err || '').toLowerCase()
  return (
    msg.includes('already been registered') ||
    msg.includes('already registered') ||
    msg.includes('user already exists') ||
    err?.code === 'email_exists'
  )
}
