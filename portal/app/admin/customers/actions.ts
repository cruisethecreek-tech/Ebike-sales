'use server'

import { createClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/require-admin'
import { revalidatePath } from 'next/cache'
import { canonicalInvoiceNumber } from '@/lib/invoice-number'
import { findAuthUserByEmail } from '@/lib/find-auth-user'

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

  // Check if user already exists.
  //
  // Paginated, and case-insensitively. The previous check read only the first
  // 50 accounts and compared addresses exactly, so for the eleven oldest
  // customers — and anyone whose address was stored in a different case — it
  // reported "no account" and sent them down the invite-a-new-customer path,
  // which Supabase refuses because the account is right there.
  const exists = !!(await findAuthUserByEmail(supabase, email))

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


// ── Archiving and deleting ───────────────────────────────────────────────

export interface RemovalResult {
  ok: boolean
  message: string
}

/**
 * Who this customer is, and what deleting them would destroy.
 *
 * Shown before the confirmation, not after, because the counts are the whole
 * decision: "remove Jay buttram" and "remove Jay buttram, his two bikes and
 * $3,773 of invoice history" are different sentences, and the directory row
 * only ever showed the first one.
 */
export async function getRemovalImpact(customerId: string): Promise<{
  name: string
  email: string | null
  isAdmin: boolean
  isYou: boolean
  archived: boolean
  bikes: number
  invoices: number
  invoiceTotal: number
  invoiceNumbers: string[]
}> {
  const adminId = await requireAdminUser()
  const admin = createAdminClient()

  const { data: customer, error } = await admin
    .from('customers')
    .select('id, first_name, last_name, is_admin, archived_at')
    .eq('id', customerId)
    .single()
  if (error || !customer) throw new Error('That customer no longer exists.')

  const [{ data: bikes }, { data: invoices }, account] = await Promise.all([
    admin.from('bikes').select('id').eq('customer_id', customerId),
    admin.from('invoices').select('invoice_number, total_amount').eq('customer_id', customerId),
    admin.auth.admin.getUserById(customerId).catch(() => null),
  ])

  return {
    name: [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim() || 'this customer',
    email: account?.data?.user?.email ?? null,
    isAdmin: Boolean(customer.is_admin),
    isYou: customerId === adminId,
    archived: Boolean(customer.archived_at),
    bikes: bikes?.length || 0,
    invoices: invoices?.length || 0,
    invoiceTotal: (invoices || []).reduce((sum, i: any) => sum + (Number(i.total_amount) || 0), 0),
    invoiceNumbers: (invoices || []).map((i: any) => i.invoice_number).filter(Boolean).sort(),
  }
}

/** Hide a customer from the directory. Nothing of theirs is touched. */
export async function archiveCustomer(customerId: string): Promise<RemovalResult> {
  const adminId = await requireAdminUser()
  if (customerId === adminId) {
    return { ok: false, message: 'You cannot archive your own account.' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('customers')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', customerId)

  if (error) return { ok: false, message: 'Could not archive: ' + error.message }

  revalidatePath('/admin/customers')
  return { ok: true, message: 'Archived. They are hidden from the directory; nothing was deleted.' }
}

/** Put an archived customer back in the directory. */
export async function restoreCustomer(customerId: string): Promise<RemovalResult> {
  await requireAdminUser()

  const admin = createAdminClient()
  const { error } = await admin
    .from('customers')
    .update({ archived_at: null })
    .eq('id', customerId)

  if (error) return { ok: false, message: 'Could not restore: ' + error.message }

  revalidatePath('/admin/customers')
  return { ok: true, message: 'Restored to the directory.' }
}

/**
 * Delete a customer and everything of theirs in the portal. Cannot be undone.
 *
 * Four things have to be true before anything is removed, and each one is a
 * different mistake being guarded against:
 *
 *   - they must already be archived, so nobody arrives here from a list row;
 *   - `confirm` must match their name exactly, so it cannot be a stray click;
 *   - they must not be an admin, so the shop cannot lock itself out;
 *   - they must not be you, for the same reason.
 *
 * What it does NOT touch: the Google Sheet. The Sheet is the system of record
 * for invoicing and the portal holds a mirror of it, so deleting here removes
 * the customer's copy and leaves the shop's books intact. If the Sheet row
 * should go too, that is a separate, deliberate edit there — and this returns
 * the invoice numbers so it can be done.
 */
export async function deleteCustomerForever(
  customerId: string,
  confirm: string,
): Promise<RemovalResult & { removed?: { bikes: number; invoices: number } }> {
  const adminId = await requireAdminUser()
  const admin = createAdminClient()

  const { data: customer, error: readErr } = await admin
    .from('customers')
    .select('id, first_name, last_name, is_admin, archived_at')
    .eq('id', customerId)
    .single()
  if (readErr || !customer) return { ok: false, message: 'That customer no longer exists.' }

  if (customerId === adminId) {
    return { ok: false, message: 'You cannot delete your own account.' }
  }
  if (customer.is_admin) {
    return {
      ok: false,
      message: 'This is an admin account. Remove their admin rights first, then delete.',
    }
  }
  if (!customer.archived_at) {
    return { ok: false, message: 'Archive them first. Permanent deletion is only offered from the archive.' }
  }

  const name = [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim()
  const typed = String(confirm || '').trim().toLowerCase()
  if (!typed || typed !== name.toLowerCase()) {
    return { ok: false, message: `Type “${name}” exactly to confirm. Nothing was deleted.` }
  }

  // Children first: invoices and bikes both point at the customer row.
  const { data: bikes } = await admin.from('bikes').select('id').eq('customer_id', customerId)
  const { data: invoices } = await admin.from('invoices').select('id').eq('customer_id', customerId)

  const { error: bikeErr } = await admin.from('bikes').delete().eq('customer_id', customerId)
  if (bikeErr) return { ok: false, message: 'Could not delete their bikes: ' + bikeErr.message }

  const { error: invErr } = await admin.from('invoices').delete().eq('customer_id', customerId)
  if (invErr) return { ok: false, message: 'Could not delete their invoices: ' + invErr.message }

  // Referral credits and anyone they referred point here too. Null out the
  // referrer rather than deleting the people they brought in.
  await admin.from('referral_credits').delete().eq('customer_id', customerId)
  await admin.from('customers').update({ referred_by: null }).eq('referred_by', customerId)

  const { error: custErr } = await admin.from('customers').delete().eq('id', customerId)
  if (custErr) return { ok: false, message: 'Could not delete the customer record: ' + custErr.message }

  // Last, because without the customer row there is nothing left pointing at
  // it, and a login with no record behind it is the worse thing to leave.
  const { error: authErr } = await admin.auth.admin.deleteUser(customerId)
  if (authErr) {
    return {
      ok: false,
      message:
        'Their records were deleted but the login could not be removed: ' +
        authErr.message +
        '. Delete it in Supabase → Authentication.',
    }
  }

  revalidatePath('/admin/customers')
  return {
    ok: true,
    message: `${name} was permanently deleted.`,
    removed: { bikes: bikes?.length || 0, invoices: invoices?.length || 0 },
  }
}
