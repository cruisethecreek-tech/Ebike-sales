'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

/*
 * Password sign-in was removed on 2026-09-24.
 *
 * It could not work for a single account. 55 of the 60 auth users were made by
 * scripts/import-invoices.ts, which sets a random password and discards it
 * ("they'll use magic link to sign in"); the other 5 were invited and the
 * callback sends them straight to /dashboard without ever asking for one. So
 * the Password tab offered every customer a form that was guaranteed to fail.
 *
 * Sign-in is now the email link, or a passkey (Face ID / Touch ID / fingerprint)
 * once one is registered from the dashboard.
 *
 * To bring passwords back you need all of: a set-password step after the invite
 * link, a change-password screen, a forgot-password flow, and Supabase's leaked
 * password protection turned on (it is currently off). Re-adding
 * signInWithPassword on its own would only rebuild the same dead end.
 */

export async function sendMagicLink(prevState: any, formData: FormData) {
  const email = formData.get('email') as string

  if (!email) {
    return { error: 'Email address is required' }
  }

  try {
    const supabase = await createClient()

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // After clicking the link, redirect here to exchange the token
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://portal.cruisethecreek.com'}/auth/callback`,
        shouldCreateUser: false,
      },
    })

    if (error) {
      if (error.message.includes('not allowed') || error.message.includes('Signups not allowed')) {
        return { error: 'No account found for this email. Ask your CTC rep to send you an invite.' }
      }
      return { error: error.message }
    }

    return { success: 'Check your email! We sent you a sign-in link. Click it and you\'ll be logged in automatically.' }
  } catch (e: any) {
    return { error: e?.message || 'Something went wrong. Please try again.' }
  }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  
  revalidatePath('/', 'layout')
  redirect('/')
}
