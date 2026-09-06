'use server'

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

// Admin-only: uses service role key to send invite emails
function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function inviteCustomer(formData: FormData): Promise<void> {
  const email = formData.get('email') as string
  const firstName = formData.get('first_name') as string
  const lastName = formData.get('last_name') as string
  const phone = formData.get('phone') as string

  if (!email || !firstName) return

  const supabase = createAdminClient()

  // Check if user already exists
  const { data: existingUsers } = await supabase.auth.admin.listUsers()
  const exists = existingUsers?.users?.some(u => u.email === email)

  if (exists) {
    // User already has an account — just send them a magic link
    await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://portal.cruisethecreek.com'}/auth/callback`,
      },
    })
    revalidatePath('/admin/customers')
    return
  }

  // Create auth user and send invite email
  const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://portal.cruisethecreek.com'}/auth/callback`,
    data: {
      first_name: firstName,
      last_name: lastName || '',
    },
  })

  if (authError) {
    console.error('Error inviting user:', authError)
    return
  }

  if (authData?.user) {
    // Generate a referral code
    const code = firstName.toUpperCase().replace(/[^A-Z]/g, '') + '-' + Math.random().toString(36).substring(2, 5).toUpperCase()

    // Create customer profile
    await supabase.from('customers').upsert({
      id: authData.user.id,
      first_name: firstName,
      last_name: lastName || '',
      phone: phone || null,
      preferred_contact: 'email',
      referral_code: code,
    }, { onConflict: 'id' })
  }

  revalidatePath('/admin/customers')
}
