'use server'

import { createClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/require-admin'
import { revalidatePath } from 'next/cache'
import { canonicalInvoiceNumber } from '@/lib/invoice-number'

// Admin-only: uses service role key to send invite emails
function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface InviteResult {
  ok: boolean
  message: string
}

/**
 * Send someone their way into the portal.
 *
 * The existing-user branch used to call admin.generateLink, which GENERATES a
 * link and sends nothing — it is the call used elsewhere in this codebase
 * precisely because it does not email anybody. It then revalidated and
 * returned, so the page refreshed and the invite looked sent. 53 of 61
 * accounts have never received any email, and this was the one tool for
 * fixing that.
 *
 * signInWithOtp actually delivers. shouldCreateUser is false so a typo in the
 * address fails loudly instead of quietly creating a second empty account.
 */
export async function inviteCustomer(
  _prev: InviteResult | null,
  formData: FormData,
): Promise<InviteResult> {
  await requireAdminUser()

  const email = formData.get('email') as string
  const firstName = formData.get('first_name') as string
  const lastName = formData.get('last_name') as string
  const phone = formData.get('phone') as string

  if (!email || !firstName) {
    return { ok: false, message: 'An email address and a first name are both required.' }
  }

  const supabase = createAdminClient()

  // Check if user already exists
  const { data: existingUsers } = await supabase.auth.admin.listUsers()
  const exists = existingUsers?.users?.some(u => u.email === email)

  if (exists) {
    // Already has an account — send a sign-in link that actually leaves the
    // building. This runs on the anon client because signInWithOtp is not an
    // admin call; the service-role client cannot send it.
    const { createClient: createAnonClient } = await import('@supabase/supabase-js')
    const anon = createAnonClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const { error: otpError } = await anon.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://portal.cruisethecreek.com'}/auth/callback`,
      },
    })

    if (otpError) {
      return { ok: false, message: `Could not email ${email}: ${otpError.message}` }
    }

    revalidatePath('/admin/customers')
    return { ok: true, message: `Sign-in link sent to ${email}. They already had an account.` }
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
    // Reported, not swallowed. A failed invite that looks successful is how a
    // whole customer list ends up believing it has been contacted.
    return { ok: false, message: `Could not invite ${email}: ${authError.message}` }
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
  return { ok: true, message: `Invite emailed to ${email}.` }
}

export async function adminUpdateBike(formData: FormData): Promise<void> {
  await requireAdminUser()

  const bikeId = (formData.get('bike_id') as string || '').trim()
  const rawSerial = formData.get('serial_number') as string
  const rawReceipt = formData.get('receipt_number') as string

  const serial_number = rawSerial && rawSerial.trim() ? rawSerial.trim().toUpperCase() : null
  const receipt_number = canonicalInvoiceNumber(rawReceipt)

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
  await requireAdminUser()

  const customerId = (formData.get('customer_id') as string || '').trim()
  // Never default the brand. This used to fall back to 'Velotric', which
  // combined with Velotric being the first <option> meant a missing or
  // unlisted brand was recorded as a Velotric rather than rejected — that is
  // how a Mokwheel Basalt ended up on file as a Velotric.
  const brand = (formData.get('brand') as string || '').trim()
  const model = (formData.get('model') as string || '').trim()
  const rawSerial = formData.get('serial_number') as string
  const rawReceipt = formData.get('receipt_number') as string
  const purchaseDate = (formData.get('purchase_date') as string || '').trim() || null

  const serial_number = rawSerial && rawSerial.trim() ? rawSerial.trim().toUpperCase() : null
  const receipt_number = canonicalInvoiceNumber(rawReceipt)

  if (!customerId || !model || !brand) return

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
  await requireAdminUser()

  const bikeId = (formData.get('bike_id') as string || '').trim()
  if (!bikeId) return

  const supabase = createAdminClient()
  await supabase.from('bikes').delete().eq('id', bikeId)

  revalidatePath('/admin/customers')
  revalidatePath('/dashboard/bikes')
}

