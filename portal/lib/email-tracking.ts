import type { SupabaseClient } from '@supabase/supabase-js'

// Sent / opened / clicked history for customer emails (migration 00023).
// The Apps Script has its own copy of the token and link rules in
// apps-script.gs (sendCustomerEmail_); keep the two in step.

export const PORTAL_URL = 'https://portal.cruisethecreek.com'

/** What each kind of email is called on the admin customer card. */
export const EMAIL_KIND_LABELS: Record<string, string> = {
  invite: 'Portal invite',
  sign_in_link: 'Portal sign-in link',
  invoice: 'Invoice receipt',
  referral_paid: 'Referral thank-you',
  referral_credit: 'Referral credit',
  repair_waiver: 'Repair waiver',
  apparel_order: 'Apparel order',
  bridge_agreement: 'Bridge the Gap agreement',
  service_ticket: 'Service ticket received',
  ticket_reply: 'Reply to service ticket',
}

export function newEmailToken(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

export function isEmailToken(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{32}$/.test(value)
}

/**
 * Where a tracked link may send someone: the shop's own sites and Stripe
 * checkout. Anything else is refused, so /api/email/click cannot be used to
 * dress up a link to some other site as a Cruise the Creek one.
 */
export function trackableUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string' || raw.length > 2000) return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null
  const host = url.hostname.toLowerCase()
  const ok =
    host === 'cruisethecreek.com' ||
    host.endsWith('.cruisethecreek.com') ||
    host === 'stripe.com' ||
    host.endsWith('.stripe.com')
  return ok ? url : null
}

export function openPixelUrl(token: string): string {
  return `${PORTAL_URL}/api/email/open?t=${token}`
}

export function trackedLink(token: string, url: string): string {
  return trackableUrl(url) ? `${PORTAL_URL}/api/email/click?t=${token}&u=${encodeURIComponent(url)}` : url
}

export type EmailLogEntry = {
  token: string
  email: string
  kind: string
  subject?: string | null
  ref?: string | null
  status: 'sent' | 'failed'
  error?: string | null
}

/** Clean up one log entry from an outside caller, or null if it is unusable. */
export function parseEmailLogEntry(body: unknown): EmailLogEntry | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
  const email = text(b.email, 320)?.toLowerCase()
  const kind = text(b.kind, 40)
  if (!isEmailToken(b.token) || !email || !email.includes('@') || !kind || !/^[a-z_]+$/.test(kind)) return null
  return {
    token: b.token,
    email,
    kind,
    subject: text(b.subject, 300),
    ref: text(b.ref, 100),
    status: b.status === 'failed' ? 'failed' : 'sent',
    error: text(b.error, 500),
  }
}

/** Record one email. Never throws: a missing log line must not undo a send. */
export async function logEmail(admin: SupabaseClient, entry: EmailLogEntry): Promise<void> {
  try {
    const { error } = await admin
      .from('customer_email_log')
      .upsert({ ...entry, email: entry.email.trim().toLowerCase() }, { onConflict: 'token', ignoreDuplicates: true })
    if (error) console.warn(`email log: ${error.message}`)
  } catch (err) {
    console.warn(`email log: ${err}`)
  }
}
