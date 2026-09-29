import type { SupabaseClient } from '@supabase/supabase-js'
import { APPS_SCRIPT_CMS_URL } from '@/lib/constants'
import { isPlaceholderEmail } from '@/lib/placeholder-email'

/** "2 referrals = $100", as the referrals page tells customers. */
export const REFERRALS_PER_CREDIT = 2

type ReferralEmail =
  | { type: 'referralPaid'; to: string; firstName: string; friendFirstName: string; paidCount: number; perCredit: number }
  | { type: 'creditIssued'; to: string; firstName: string; amount: number }

/**
 * Send one of the two referral emails through the shop's Apps Script mailer,
 * the same one that sends invoices.
 *
 * The wording lives in apps-script.gs (handleReferralEmail); the portal only
 * says which email and to whom. Apps Script checks the key against its
 * PORTAL_ADMIN_KEY script property, which already matches ADMIN_API_KEY here.
 *
 * Never throws: a referral email that fails must not fail the invoice save or
 * the credit that triggered it.
 */
export async function sendReferralEmail(email: ReferralEmail): Promise<{ ok: boolean; error?: string }> {
  const key = (process.env.ADMIN_API_KEY || '').trim()
  if (!key) return { ok: false, error: 'ADMIN_API_KEY is not set' }
  try {
    // text/plain, like the storefront's POSTs: Apps Script parses postData
    // itself. The POST is answered with a redirect to the result, which
    // fetch follows as a GET.
    const res = await fetch(APPS_SCRIPT_CMS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'referralEmail', key, ...email }),
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
    })
    const text = await res.text()
    const a = text.indexOf('{')
    const b = text.lastIndexOf('}')
    if (a === -1) return { ok: false, error: `the mailer did not return JSON (HTTP ${res.status})` }
    const data = JSON.parse(text.slice(a, b + 1))
    return data.ok ? { ok: true } : { ok: false, error: String(data.error || 'the mailer refused') }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function emailFor(admin: SupabaseClient, customerId: string): Promise<string | null> {
  const { data } = await admin.auth.admin.getUserById(customerId)
  const email = data?.user?.email || ''
  // A shop placeholder address would email the shop, not the customer.
  return email && !isPlaceholderEmail(email) ? email : null
}

/**
 * Tell the referrer that a friend they sent in has paid for something.
 *
 * Once per friend: the first time the friend has a paid invoice. Safe to call
 * on every invoice save; it does nothing unless this customer was referred,
 * has a paid invoice, and their referrer has not been told yet.
 *
 * `admin` must be a service-role client (it reads the referrer's login email).
 * Returns what happened, for the caller's response and logs.
 */
export async function notifyReferrerOfPaidPurchase(admin: SupabaseClient, customerId: string): Promise<string> {
  try {
    const { data: friend } = await admin
      .from('customers')
      .select('id, first_name, referred_by, referral_notified_at')
      .eq('id', customerId)
      .maybeSingle()
    if (!friend?.referred_by || friend.referral_notified_at) return 'none'

    const { count: paid } = await admin
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customerId)
      .eq('status', 'paid')
    if (!paid) return 'not paid yet'

    // Claim before sending, so two saves landing together send one email.
    const { data: claimed } = await admin
      .from('customers')
      .update({ referral_notified_at: new Date().toISOString() })
      .eq('id', customerId)
      .is('referral_notified_at', null)
      .select('id')
    if (!claimed?.length) return 'already told'

    const referrerId = friend.referred_by as string
    const [{ data: referrer }, to, { count: paidCount }] = await Promise.all([
      admin.from('customers').select('first_name').eq('id', referrerId).maybeSingle(),
      emailFor(admin, referrerId),
      admin
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('referred_by', referrerId)
        .not('referral_notified_at', 'is', null),
    ])
    if (!to) return 'referrer has no email on file'

    const sent = await sendReferralEmail({
      type: 'referralPaid',
      to,
      firstName: referrer?.first_name || '',
      friendFirstName: friend.first_name || '',
      paidCount: paidCount || 1,
      perCredit: REFERRALS_PER_CREDIT,
    })
    if (!sent.ok) {
      // Let the next save try again rather than never telling them.
      await admin.from('customers').update({ referral_notified_at: null }).eq('id', customerId)
      return `email failed: ${sent.error}`
    }
    return 'sent'
  } catch (err) {
    return `email failed: ${err instanceof Error ? err.message : String(err)}`
  }
}

/** Tell a customer their referral credit has been issued. */
export async function notifyCreditIssued(admin: SupabaseClient, customerId: string, amount: number): Promise<string> {
  try {
    const [{ data: c }, to] = await Promise.all([
      admin.from('customers').select('first_name').eq('id', customerId).maybeSingle(),
      emailFor(admin, customerId),
    ])
    if (!to) return 'no email on file'
    const sent = await sendReferralEmail({ type: 'creditIssued', to, firstName: c?.first_name || '', amount })
    return sent.ok ? 'sent' : `email failed: ${sent.error}`
  } catch (err) {
    return `email failed: ${err instanceof Error ? err.message : String(err)}`
  }
}
