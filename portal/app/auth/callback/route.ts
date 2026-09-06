import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /auth/callback
 *
 * Supabase redirects here after a user clicks a magic link.
 * The URL contains a `code` query param that we exchange for a session.
 * After that, the user is fully authenticated and we send them to /dashboard.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Ensure a customer profile exists (for imported users signing in
      // via magic link for the first time — their profile was already
      // created by the import script, but this is a safety net).
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: existing } = await supabase
          .from('customers')
          .select('id')
          .eq('id', user.id)
          .single()

        if (!existing) {
          const meta = user.user_metadata
          await supabase.from('customers').insert({
            id: user.id,
            first_name: meta?.first_name || 'Customer',
            last_name: meta?.last_name || '',
          })
        }
      }

      return NextResponse.redirect(`${origin}/dashboard`)
    }
  }

  // If something went wrong, redirect back to auth with an error
  return NextResponse.redirect(`${origin}/auth?error=Could+not+verify+sign-in+link`)
}
