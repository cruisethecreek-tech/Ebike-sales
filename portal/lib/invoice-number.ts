/**
 * One spelling for an invoice number.
 *
 * The shop writes them zero-padded to three digits — CTR-003, CTR-071 — but
 * bikes.receipt_number is a free-text field typed by hand, and
 * /dashboard/invoices/[id] matches it with `eq('invoice_number', id)`, exactly.
 * So "CTR-71" typed instead of "CTR-071" produces a link that 404s, and
 * nothing anywhere says why: the bike looks registered, the invoice exists,
 * and the two just never meet.
 *
 * Normalising on the way in is what actually fixes it. Matching loosely on the
 * way out would paper over rows that are still wrong, and would still fail
 * everywhere else that joins on this value — the invoices list already groups
 * bikes by receipt_number to show what was bought.
 */

/** CTR-71 -> CTR-071. Anything not in that shape is returned trimmed and upper-cased. */
export function canonicalInvoiceNumber(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim().toUpperCase()
  if (!s) return null

  // Accept CTR-71, CTR 71, CTR71 and 71 — all the ways it gets typed in a hurry.
  const m = s.match(/^([A-Z]{2,5})?[\s-]*(\d{1,6})$/)
  if (!m) return s

  const prefix = m[1] || 'CTR'
  const digits = m[2].replace(/^0+(?=\d)/, '')
  return `${prefix}-${digits.padStart(3, '0')}`
}

/** True when two invoice numbers refer to the same invoice. */
export function sameInvoiceNumber(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const ca = canonicalInvoiceNumber(a)
  const cb = canonicalInvoiceNumber(b)
  return ca !== null && ca === cb
}
