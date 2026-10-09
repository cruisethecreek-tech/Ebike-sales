import { APPS_SCRIPT_CMS_URL } from '@/lib/constants'
import { isPlaceholderEmail } from '@/lib/placeholder-email'

export type TicketEmail = {
  ticketId: string
  ticketType: string
  description: string
  bike: string
  firstName: string
  lastName: string
  /** The customer's login email; blank or a shop placeholder means no confirmation is sent. */
  email: string
  phone: string
}

/**
 * Tell the shop a customer opened a service ticket, and send the customer a
 * "we got it" copy, through the shop's Apps Script mailer (handleServiceTicket
 * in apps-script.gs), the same one that sends invoices and referral emails.
 *
 * Before this, a ticket only landed in the service_tickets table: nothing
 * emailed anyone and no admin page listed it, so a customer who asked for
 * help heard nothing back.
 *
 * Never throws: the ticket is already saved, and a mail failure must not
 * turn that into an error for the customer.
 */
export async function sendTicketEmail(ticket: TicketEmail): Promise<{ ok: boolean; error?: string }> {
  const key = (process.env.ADMIN_API_KEY || '').trim()
  if (!key) return { ok: false, error: 'ADMIN_API_KEY is not set' }
  const customerEmail = ticket.email && !isPlaceholderEmail(ticket.email) ? ticket.email : ''
  try {
    const res = await fetch(APPS_SCRIPT_CMS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'serviceTicket', key, ...ticket, email: customerEmail }),
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
