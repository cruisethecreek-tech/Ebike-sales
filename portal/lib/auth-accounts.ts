import { createClient } from '@supabase/supabase-js'

/**
 * Sign-up state for one portal login, read from `auth.users`.
 *
 * `public.customers` cannot answer "did this person actually register?".
 * Inviting a customer writes BOTH an auth user and a customers row in the
 * same action, so a profile exists from the moment the invite is sent —
 * someone who never opened the email looks identical to a daily user.
 * The only record of whether they ever arrived lives in `auth.users`,
 * which is not exposed through PostgREST and needs the service-role key.
 */
export interface AuthAccount {
  email: string | null
  invitedAt: string | null
  confirmedAt: string | null
  lastSignInAt: string | null
  /** True once they have signed in at least once — i.e. really registered. */
  registered: boolean
}

export interface AuthAccountsResult {
  accounts: Map<string, AuthAccount>
  /** Set when the lookup failed; callers should degrade, not blow up. */
  error: string | null
}

const PER_PAGE = 1000   // Supabase caps listUsers at 1000 per page.
const MAX_PAGES = 50    // Belt and braces against a non-terminating loop.

/**
 * Every portal login, keyed by user id (= `customers.id`).
 *
 * Service-role only, so call this from a server component or server action
 * that has already established the caller is an admin. Never pass the raw
 * result to the browser — hand on only the fields a view needs.
 */
export async function listAuthAccounts(): Promise<AuthAccountsResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    return { accounts: new Map(), error: 'Supabase service-role credentials are not configured.' }
  }

  const supabase = createClient(url, key)
  const accounts = new Map<string, AuthAccount>()

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PER_PAGE })

    if (error) {
      // Partial results are still worth showing; report the failure alongside.
      return { accounts, error: error.message }
    }

    const users = data?.users || []
    for (const u of users) {
      const lastSignInAt = u.last_sign_in_at || null
      accounts.set(u.id, {
        email: u.email || null,
        invitedAt: u.invited_at || null,
        confirmedAt: u.confirmed_at || u.email_confirmed_at || null,
        lastSignInAt,
        registered: !!lastSignInAt,
      })
    }

    if (users.length < PER_PAGE) break
  }

  return { accounts, error: null }
}
