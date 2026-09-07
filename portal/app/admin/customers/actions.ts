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

export async function adminUpdateBike(formData: FormData): Promise<void> {
  const bikeId = (formData.get('bike_id') as string || '').trim()
  const rawSerial = formData.get('serial_number') as string
  const rawReceipt = formData.get('receipt_number') as string

  const serial_number = rawSerial && rawSerial.trim() ? rawSerial.trim().toUpperCase() : null
  const receipt_number = rawReceipt && rawReceipt.trim() ? rawReceipt.trim().toUpperCase() : null

  if (!bikeId) return

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('bikes')
    .update({ serial_number, receipt_number })
    .eq('id', bikeId)

  if (error) {
    console.error('Error updating bike:', error)
  }

  revalidatePath('/admin/customers')
  revalidatePath('/dashboard/bikes')
}

export async function adminAddBike(formData: FormData): Promise<void> {
  const customerId = (formData.get('customer_id') as string || '').trim()
  const brand = (formData.get('brand') as string || 'Velotric').trim()
  const model = (formData.get('model') as string || '').trim()
  const rawSerial = formData.get('serial_number') as string
  const rawReceipt = formData.get('receipt_number') as string
  const purchaseDate = (formData.get('purchase_date') as string || '').trim() || null

  const serial_number = rawSerial && rawSerial.trim() ? rawSerial.trim().toUpperCase() : null
  const receipt_number = rawReceipt && rawReceipt.trim() ? rawReceipt.trim().toUpperCase() : null

  if (!customerId || !model) return

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('bikes')
    .insert({
      customer_id: customerId,
      brand,
      model,
      serial_number,
      receipt_number,
      purchase_date: purchaseDate,
    })

  if (error) {
    console.error('Error adding bike:', error)
  }

  revalidatePath('/admin/customers')
  revalidatePath('/dashboard/bikes')
}

export async function adminDeleteBike(formData: FormData): Promise<void> {
  const bikeId = (formData.get('bike_id') as string || '').trim()
  if (!bikeId) return

  const supabase = createAdminClient()
  await supabase.from('bikes').delete().eq('id', bikeId)

  revalidatePath('/admin/customers')
  revalidatePath('/dashboard/bikes')
}

