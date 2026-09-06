'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function signIn(prevState: any, formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Email and password are required' }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { error: error.message }
  }

  // On first sign-in, create the customer profile if it doesn't exist yet.
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

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

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

export async function signUp(prevState: any, formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const firstName = formData.get('firstName') as string
  const lastName = formData.get('lastName') as string

  if (!email || !password || !firstName || !lastName) {
    return { error: 'All fields are required' }
  }

  const supabase = await createClient()

  const { error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName,
      },
    },
  })

  if (signUpError) {
    return { error: signUpError.message }
  }

  return { success: 'Check your email to confirm your account, then sign in!' }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  
  revalidatePath('/', 'layout')
  redirect('/')
}
