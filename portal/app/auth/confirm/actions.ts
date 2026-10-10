'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

/**
 * Use a sign-in link staff texted (Copy Sign-In Link on the admin card).
 * Runs only when the customer taps "Sign in", never on the page load, so a
 * text app opening the link for a preview cannot use it up.
 */
export async function confirmSignIn(formData: FormData) {
  const tokenHash = String(formData.get('token_hash') || '')
  // /auth shows no error text, so failures come back to this page to explain.
  if (!tokenHash) redirect('/auth/confirm?failed=1')

  const supabase = await createClient()
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
  if (error || !data.user) {
    redirect('/auth/confirm?failed=1')
  }

  // Same safety net as /auth/callback: make sure a customer row exists.
  const { data: existing } = await supabase.from('customers').select('id').eq('id', data.user.id).maybeSingle()
  if (!existing) {
    const meta = data.user.user_metadata
    await supabase.from('customers').insert({
      id: data.user.id,
      first_name: meta?.first_name || 'Customer',
      last_name: meta?.last_name || '',
    })
  }

  redirect('/dashboard')
}
