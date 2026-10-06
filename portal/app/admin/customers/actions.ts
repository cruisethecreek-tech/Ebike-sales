'use server'

import { logEmail, newEmailToken } from '@/lib/email-tracking'
import { createClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/require-admin'
import { revalidatePath } from 'next/cache'
import { canonicalInvoiceNumber } from '@/lib/invoice-number'
import { findAuthUserByEmail } from '@/lib/find-auth-user'
import { RIDE_PHOTOS_BUCKET } from '@/lib/ride-photos'
import { cleanCustomerDetails, type CustomerDetailsInput } from '@/lib/customer-details'
import { loadPurchaseSummary } from '@/lib/invite-personalization'

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
  const existing = await findAuthUserByEmail(supabase, email)

  if (existing) {
    // The sign-in email greets them by name and mentions what they bought
    // ({{ .Data.first_name }} and {{ .Data.purchase }} in the template), so
    // put the current portal values on the account first. Supabase merges
    // these keys into the existing metadata.
    // email_token is the open-tracking image in the template
    // ({{ .Data.email_token }}); see lib/email-tracking.ts.
    const purchase = await loadPurchaseSummary(supabase, existing.id)
    const token = newEmailToken()
    const { error: metaError } = await supabase.auth.admin.updateUserById(existing.id, {
      user_metadata: { first_name: firstName.trim(), purchase, email_token: token },
    })
    if (metaError) console.warn(`invite: could not personalise ${email}: ${metaError.message}`)

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

    await logEmail(supabase, {
      token,
      email,
      kind: 'sign_in_link',
      status: otpError ? 'failed' : 'sent',
      error: otpError?.message ?? null,
    })
    if (otpError) {
      return { ok: false, message: `Could not email ${email}: ${otpError.message}` }
    }

    revalidatePath('/admin/customers')
    return { ok: true, message: `Sign-in link sent to ${email}. They already had an account.` }
  }

  // Create auth user and send invite email
  const token = newEmailToken()
  const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://portal.cruisethecreek.com'}/auth/callback`,
    data: {
      first_name: firstName,
      last_name: lastName || '',
      email_token: token,
    },
  })
  await logEmail(supabase, {
    token,
    email,
    kind: 'invite',
    status: authError ? 'failed' : 'sent',
    error: authError?.message ?? null,
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

/**
 * The same invite, from places that only know who the customer is, like the
 * Find Customer panel at the bottom of every admin page. That panel has no
 * email addresses (they live on the login, not in customers), so look the
 * address up here instead of loading every login on every admin page.
 */
export async function inviteCustomerById(
  prev: InviteResult | null,
  formData: FormData,
): Promise<InviteResult> {
  await requireAdminUser()

  const id = String(formData.get('customer_id') ?? '')
  if (!id) return { ok: false, message: 'Missing customer.' }

  const admin = createAdminClient()
  const [{ data: account }, { data: customer }] = await Promise.all([
    admin.auth.admin.getUserById(id),
    admin.from('customers').select('first_name, last_name, phone').eq('id', id).maybeSingle(),
  ])
  const email = account?.user?.email
  if (!email) return { ok: false, message: 'No email on file for this customer. Add one with Edit details first.' }

  const form = new FormData()
  form.set('email', email)
  form.set('first_name', customer?.first_name || String(account?.user?.user_metadata?.first_name || '') || 'there')
  form.set('last_name', customer?.last_name || '')
  form.set('phone', customer?.phone || '')
  return inviteCustomer(prev, form)
}

export interface CustomerDetailsResult {
  ok: boolean
  message: string
  /** Generator invoices still filed under the old email, when it changed. */
  invoiceNumbers?: string[]
}

/**
 * Change a customer's name, email, phone and preferred contact from the admin
 * card. Until now the only way was to re-save one of their invoices in the
 * generator, and a customer with no generator invoice (the Wix orders) could
 * not be corrected at all.
 *
 * The email is their login, so it changes on the auth user, and only to an
 * address no other login has.
 */
export async function adminUpdateCustomerDetails(
  customerId: string,
  input: CustomerDetailsInput,
): Promise<CustomerDetailsResult> {
  await requireAdminUser()
  const clean = cleanCustomerDetails(input)
  if (!clean.ok) return { ok: false, message: clean.message }
  const d = clean.value

  const admin = createAdminClient()
  const { data: current } = await admin
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .maybeSingle()
  if (!current) return { ok: false, message: 'That customer no longer exists.' }

  const { data: authData, error: authErr } = await admin.auth.admin.getUserById(customerId)
  if (authErr || !authData?.user) return { ok: false, message: 'Could not read their login. Nothing was changed.' }
  const oldEmail = (authData.user.email || '').toLowerCase()
  const emailChanged = d.email !== oldEmail

  if (emailChanged) {
    const taken = await findAuthUserByEmail(admin, d.email)
    if (taken && taken.id !== customerId) {
      return {
        ok: false,
        message: `${d.email} already belongs to another customer. Merge the two records instead. Nothing was changed.`,
      }
    }
  }

  const { error: custErr } = await admin
    .from('customers')
    .update({
      first_name: d.firstName,
      last_name: d.lastName,
      phone: d.phone,
      preferred_contact: d.preferredContact,
      details_edited_at: new Date().toISOString(),
    })
    .eq('id', customerId)
  if (custErr) return { ok: false, message: 'Nothing was changed: ' + custErr.message }

  const { error: updErr } = await admin.auth.admin.updateUserById(customerId, {
    ...(emailChanged ? { email: d.email, email_confirm: true } : {}),
    user_metadata: { ...(authData.user.user_metadata || {}), first_name: d.firstName, last_name: d.lastName },
  })

  revalidatePath('/admin/customers')
  revalidatePath('/dashboard')

  if (updErr && emailChanged) {
    return {
      ok: false,
      message: `Name and phone saved, but the email could not be changed to ${d.email}: ${updErr.message}.`,
    }
  }
  if (!emailChanged) return { ok: true, message: 'Saved.' }

  // Generator invoices find their customer by email. Any still carrying the
  // old address would, on their next save, be filed under a new customer
  // with that address, so staff are told which ones to update there.
  const { data: invs } = await admin.from('invoices').select('invoice_number').eq('customer_id', customerId)
  const invoiceNumbers = (invs || [])
    .map((i) => i.invoice_number)
    .filter((n): n is string => !!n && !/^WIX-/i.test(n))
    .sort()
  return {
    ok: true,
    message: `Saved. They now sign in with ${d.email}.`,
    invoiceNumbers,
  }
}

export async function adminUpdateBike(formData: FormData): Promise<void> {
  await requireAdminUser()

  const bikeId = (formData.get('bike_id') as string || '').trim()
  const rawSerial = formData.get('serial_number') as string
  const rawReceipt = formData.get('receipt_number') as string

  const serial_number = rawSerial && rawSerial.trim() ? rawSerial.trim().toUpperCase() : null
  const receipt_number = canonicalInvoiceNumber(rawReceipt)
  // Only a web link is kept; anything else (a stray note, a typo) clears it
  // rather than failing the whole save of serial and receipt.
  const rawShop = ((formData.get('shop_invoice_url') as string) || '').trim()
  const shop_invoice_url = /^https?:\/\/\S+$/i.test(rawShop) && rawShop.length <= 1000 ? rawShop : null
  const rawDelivered = ((formData.get('delivered_on') as string) || '').trim()
  const delivered_on = /^\d{4}-\d{2}-\d{2}$/.test(rawDelivered) ? rawDelivered : null

  if (!bikeId) return

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('bikes')
    .update({ serial_number, receipt_number, shop_invoice_url, delivered_on })
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

/**
 * Remove one bike from a customer, for test entries and mistakes.
 *
 * Its service tickets, ride photos and GPS tracker stay and just stop
 * pointing at it. Tickets are unlinked here first: their foreign key to the
 * bike is (bike_id, customer_id), and Postgres's "on delete set null" on a
 * two-column key nulls both columns, which the not-null customer_id refuses,
 * so any bike with a ticket could never be deleted.
 */
export async function adminDeleteBike(bikeId: string): Promise<{ ok: boolean; message: string }> {
  await requireAdminUser()
  const id = (bikeId || '').trim()
  if (!id) return { ok: false, message: 'No bike was specified.' }

  const supabase = createAdminClient()
  const { error: ticketErr } = await supabase
    .from('service_tickets')
    .update({ bike_id: null })
    .eq('bike_id', id)
  if (ticketErr) return { ok: false, message: 'Nothing was removed: ' + ticketErr.message }

  const { data, error } = await supabase.from('bikes').delete().eq('id', id).select('id')
  if (error) return { ok: false, message: 'Nothing was removed: ' + error.message }
  if (!data || data.length === 0) return { ok: false, message: 'That bike was already removed.' }

  revalidatePath('/admin/customers')
  revalidatePath('/dashboard/bikes')
  return { ok: true, message: 'Bike removed.' }
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

  const removed = await removeCustomerRecords(admin, customerId)
  if (!removed.ok) return { ok: false, message: removed.message }

  revalidatePath('/admin/customers')
  return {
    ok: true,
    message: `${name} was permanently deleted.`,
    removed: removed.removed,
  }
}

/**
 * The deletion itself, once every check has passed. Shared by the single
 * delete and the bulk one so the two can never disagree about what goes.
 */
async function removeCustomerRecords(
  admin: ReturnType<typeof createAdminClient>,
  customerId: string,
): Promise<{ ok: true; removed: { bikes: number; invoices: number } } | { ok: false; message: string }> {
  // Children first: invoices and bikes both point at the customer row.
  const { data: bikes } = await admin.from('bikes').select('id').eq('customer_id', customerId)
  const { data: invoices } = await admin.from('invoices').select('id').eq('customer_id', customerId)

  const { error: bikeErr } = await admin.from('bikes').delete().eq('customer_id', customerId)
  if (bikeErr) return { ok: false as const, message: 'Could not delete their bikes: ' + bikeErr.message }

  const { error: invErr } = await admin.from('invoices').delete().eq('customer_id', customerId)
  if (invErr) return { ok: false as const, message: 'Could not delete their invoices: ' + invErr.message }

  // Referral credits and anyone they referred point here too. Null out the
  // referrer rather than deleting the people they brought in.
  await admin.from('referral_credits').delete().eq('customer_id', customerId)
  await admin.from('customers').update({ referred_by: null }).eq('referred_by', customerId)

  // Their ride photos: the rows go with the customer (cascade), the files
  // would not. Deleting someone means deleting their pictures too.
  const { data: photos } = await admin.from('community_photos').select('storage_path').eq('customer_id', customerId)
  const paths = (photos || []).map((p) => p.storage_path).filter(Boolean) as string[]
  if (paths.length) await admin.storage.from(RIDE_PHOTOS_BUCKET).remove(paths)

  const { error: custErr } = await admin.from('customers').delete().eq('id', customerId)
  if (custErr) return { ok: false as const, message: 'Could not delete the customer record: ' + custErr.message }

  // Last, because without the customer row there is nothing left pointing at
  // it, and a login with no record behind it is the worse thing to leave.
  const { error: authErr } = await admin.auth.admin.deleteUser(customerId)
  if (authErr) {
    return {
      ok: false as const,
      message:
        'Their records were deleted but the login could not be removed: ' +
        authErr.message +
        '. Delete it in Supabase → Authentication.',
    }
  }

  return { ok: true, removed: { bikes: bikes?.length || 0, invoices: invoices?.length || 0 } }
}


// ── Bulk actions and merging ─────────────────────────────────────────────

export interface BulkResult {
  ok: boolean
  message: string
  /** Names that were skipped or failed, each with the reason. */
  problems: string[]
}

function displayName(c: { first_name?: string | null; last_name?: string | null }) {
  return [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || 'Unnamed customer'
}

/**
 * Archive every checked customer. Admins and your own account are skipped
 * and named, rather than failing the whole batch.
 */
export async function archiveCustomers(customerIds: string[]): Promise<BulkResult> {
  const adminId = await requireAdminUser()
  const admin = createAdminClient()
  const ids = [...new Set(customerIds)].filter(Boolean)
  if (!ids.length) return { ok: false, message: 'Nobody is checked.', problems: [] }

  const { data: rows, error } = await admin
    .from('customers')
    .select('id, first_name, last_name, is_admin')
    .in('id', ids)
  if (error) return { ok: false, message: 'Could not read those customers: ' + error.message, problems: [] }

  const problems: string[] = []
  const archivable = (rows || []).filter((c) => {
    if (c.id === adminId) problems.push(`${displayName(c)}: that is your own account.`)
    else if (c.is_admin) problems.push(`${displayName(c)}: admin accounts are not archived from here.`)
    else return true
    return false
  })

  if (archivable.length) {
    const { error: upErr } = await admin
      .from('customers')
      .update({ archived_at: new Date().toISOString() })
      .in('id', archivable.map((c) => c.id))
    if (upErr) return { ok: false, message: 'Could not archive: ' + upErr.message, problems }
  }

  revalidatePath('/admin/customers')
  return {
    ok: archivable.length > 0,
    message: `${archivable.length} archived. Nothing of theirs was deleted.`,
    problems,
  }
}

/** Put every checked archived customer back in the directory. */
export async function restoreCustomers(customerIds: string[]): Promise<BulkResult> {
  await requireAdminUser()
  const admin = createAdminClient()
  const ids = [...new Set(customerIds)].filter(Boolean)
  if (!ids.length) return { ok: false, message: 'Nobody is checked.', problems: [] }

  const { data, error } = await admin
    .from('customers')
    .update({ archived_at: null })
    .in('id', ids)
    .select('id')
  if (error) return { ok: false, message: 'Could not restore: ' + error.message, problems: [] }

  revalidatePath('/admin/customers')
  return { ok: true, message: `${data?.length || 0} restored to the directory.`, problems: [] }
}

/**
 * Permanently delete every checked customer. Same rules as deleting one —
 * archived first, never an admin, never you — and the confirmation is the
 * count typed out ("delete 3"), because typing six names is not a safeguard
 * anybody would keep using.
 */
export async function deleteCustomersForever(
  customerIds: string[],
  confirm: string,
): Promise<BulkResult> {
  const adminId = await requireAdminUser()
  const admin = createAdminClient()
  const ids = [...new Set(customerIds)].filter(Boolean)
  if (!ids.length) return { ok: false, message: 'Nobody is checked.', problems: [] }

  const expected = `delete ${ids.length}`
  if (String(confirm || '').trim().toLowerCase() !== expected) {
    return { ok: false, message: `Type “${expected}” to confirm. Nothing was deleted.`, problems: [] }
  }

  const { data: rows, error } = await admin
    .from('customers')
    .select('id, first_name, last_name, is_admin, archived_at')
    .in('id', ids)
  if (error) return { ok: false, message: 'Could not read those customers: ' + error.message, problems: [] }

  const problems: string[] = []
  let deleted = 0
  for (const c of rows || []) {
    const name = displayName(c)
    if (c.id === adminId) { problems.push(`${name}: that is your own account.`); continue }
    if (c.is_admin) { problems.push(`${name}: admin account, not deleted.`); continue }
    if (!c.archived_at) { problems.push(`${name}: not archived, so not deleted.`); continue }

    const r = await removeCustomerRecords(admin, c.id)
    if (r.ok) deleted++
    else problems.push(`${name}: ${r.message}`)
  }

  revalidatePath('/admin/customers')
  return { ok: deleted > 0, message: `${deleted} permanently deleted.`, problems }
}

export interface MergeChoices {
  firstName?: string
  lastName?: string
  phone?: string
  /** The login email the kept account should end up with. */
  email?: string
}

/**
 * Merge a duplicate customer into the account being kept.
 *
 * Bikes, invoices, service tickets, rides, photos, referral credits and
 * referrals all move to `keepId`, and the other record is archived — not
 * deleted. Where the two disagree, `choices` says which name, phone and login
 * email survive; anything not chosen keeps the kept record's value, with its
 * blanks filled from the other.
 *
 * The data moves in one database function (migration 00013) so that it is
 * one transaction: a merge that fails partway changes nothing. The email is
 * a login, not a column, so it is swapped in auth afterwards: the archived
 * duplicate is parked on an address nobody receives mail at, which frees its
 * real one for the kept account.
 */
export async function mergeCustomers(
  keepId: string,
  mergeId: string,
  choices: MergeChoices = {},
): Promise<RemovalResult & { invoiceNumbers?: string[] }> {
  await requireAdminUser()
  if (!keepId || !mergeId || keepId === mergeId) {
    return { ok: false, message: 'Pick two different customers to merge.' }
  }

  const admin = createAdminClient()
  const [{ data: keep }, { data: other }, { data: moving }, { data: staying }, keepAuth, otherAuth] = await Promise.all([
    admin.from('customers').select('first_name, last_name').eq('id', keepId).single(),
    admin.from('customers').select('first_name, last_name').eq('id', mergeId).single(),
    admin.from('invoices').select('invoice_number').eq('customer_id', mergeId),
    admin.from('invoices').select('invoice_number').eq('customer_id', keepId),
    admin.auth.admin.getUserById(keepId),
    admin.auth.admin.getUserById(mergeId),
  ])
  if (!keep || !other) return { ok: false, message: 'One of those customers no longer exists.' }

  const keepEmail = keepAuth.data?.user?.email?.toLowerCase() || null
  const otherEmail = otherAuth.data?.user?.email?.toLowerCase() || null
  const wantEmail = choices.email?.trim().toLowerCase() || keepEmail
  // Only the two addresses on screen are offered, so anything else is a
  // stale form rather than a choice.
  if (wantEmail && wantEmail !== keepEmail && wantEmail !== otherEmail) {
    return { ok: false, message: 'That email is not on either record. Nothing was merged.' }
  }

  const { data, error } = await admin.rpc('merge_customers', {
    p_keep: keepId,
    p_merge: mergeId,
    p_first_name: choices.firstName?.trim() || null,
    p_last_name: choices.lastName?.trim() || null,
    p_phone: choices.phone?.trim() || null,
  })
  if (error) return { ok: false, message: 'Nothing was merged: ' + error.message }

  let emailNote = ''
  if (wantEmail && wantEmail !== keepEmail) {
    const parked = `merged-${mergeId}@noreply.cruisethecreek.com`
    const { error: parkErr } = await admin.auth.admin.updateUserById(mergeId, {
      email: parked,
      email_confirm: true,
    })
    const { error: swapErr } = parkErr
      ? { error: parkErr }
      : await admin.auth.admin.updateUserById(keepId, { email: wantEmail, email_confirm: true })
    emailNote = swapErr
      ? ` Their records merged, but the login email could not be changed to ${wantEmail}: ${swapErr.message}.`
      : ` They now sign in with ${wantEmail}.`
  }

  const moved = data as Record<string, number>
  const parts = [
    moved.bikes && `${moved.bikes} ${moved.bikes === 1 ? 'bike' : 'bikes'}`,
    moved.invoices && `${moved.invoices} ${moved.invoices === 1 ? 'invoice' : 'invoices'}`,
    moved.tickets && `${moved.tickets} service ${moved.tickets === 1 ? 'ticket' : 'tickets'}`,
    moved.rides && `${moved.rides} ride ${moved.rides === 1 ? 'log' : 'logs'}`,
    moved.photos && `${moved.photos} ${moved.photos === 1 ? 'photo' : 'photos'}`,
    moved.credits && `${moved.credits} referral ${moved.credits === 1 ? 'credit' : 'credits'}`,
    moved.referred && `${moved.referred} ${moved.referred === 1 ? 'referral' : 'referrals'}`,
  ].filter(Boolean)

  revalidatePath('/admin/customers')
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/bikes')

  // Invoices synced from the Sheet find their customer by email, so any
  // invoice filed under an address that is no longer this login's needs its
  // email changed in the generator, or the next save of it goes astray.
  // WIX- orders are not in the Sheet and never re-sync.
  const finalEmail = emailNote.startsWith(' They now') ? wantEmail : keepEmail
  const numbers = (rows: { invoice_number: string | null }[] | null) =>
    (rows || []).map((i) => i.invoice_number).filter((n): n is string => !!n && !/^WIX-/i.test(n))
  const toFix = [
    ...(finalEmail !== otherEmail ? numbers(moving) : []),
    ...(finalEmail !== keepEmail ? numbers(staying) : []),
  ].sort()
  return {
    ok: true,
    message:
      `Merged into ${displayName(keep)}: ${parts.length ? parts.join(', ') : 'nothing to move'}. ` +
      `The other record is in the archive.` +
      emailNote,
    invoiceNumbers: toFix,
  }
}
