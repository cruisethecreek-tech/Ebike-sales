import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Delete an invoice everywhere it lives: the portal's copy and the Google
 * Sheet row the invoice generator reads. Deleting only the portal copy left
 * the invoice in the generator, where the next save of it synced it straight
 * back — so a test invoice could never really be got rid of.
 *
 * The Sheet part goes through the Apps Script web app with the shared admin
 * key. If it fails (the script is not redeployed yet, or Google is down) the
 * portal copy is still removed and the message says what is left.
 *
 * Callers pass APPS_SCRIPT_CMS_URL (lib/constants) in; this file imports
 * nothing of the app's, so its test runs under plain node.
 */
export type InvoiceRemoval = {
  ok: boolean
  message: string
  portalRemoved: number
  sheetRemoved: number | null
}

export async function removeInvoiceFromSheet(
  scriptUrl: string,
  invoiceNumber: string,
): Promise<{ ok: true; removed: number } | { ok: false; error: string }> {
  const key = (process.env.ADMIN_API_KEY || '').trim()
  if (!key) return { ok: false, error: 'ADMIN_API_KEY is not set' }
  try {
    // Same transport as the referral emails: text/plain so Apps Script parses
    // the body itself, and the redirect to the result is followed as a GET.
    const res = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'deleteInvoice', key, invoiceNumber }),
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
    })
    const text = await res.text()
    const a = text.indexOf('{')
    const b = text.lastIndexOf('}')
    if (a === -1) return { ok: false, error: `the Sheet did not answer (HTTP ${res.status})` }
    const data = JSON.parse(text.slice(a, b + 1))
    if (!data.ok) return { ok: false, error: String(data.error || 'the Sheet refused') }
    return { ok: true, removed: Number(data.removed) || 0 }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** `admin` must be a service-role client; callers check who is asking first. */
export async function removeInvoiceEverywhere(
  admin: SupabaseClient,
  scriptUrl: string,
  invoiceNumber: string,
): Promise<InvoiceRemoval> {
  const num = invoiceNumber.trim().toUpperCase()
  if (!/^[A-Z0-9][A-Z0-9-]{1,29}$/.test(num)) {
    return { ok: false, message: 'That is not an invoice number.', portalRemoved: 0, sheetRemoved: null }
  }

  const { data, error } = await admin.from('invoices').delete().eq('invoice_number', num).select('id')
  if (error) {
    return { ok: false, message: `Nothing was deleted: ${error.message}`, portalRemoved: 0, sheetRemoved: null }
  }
  const portalRemoved = data?.length || 0

  // WIX- orders were imported from a CSV and have no Sheet row.
  if (/^WIX-/.test(num)) {
    return {
      ok: portalRemoved > 0,
      message: portalRemoved ? `${num} deleted.` : `${num} was not found.`,
      portalRemoved,
      sheetRemoved: null,
    }
  }

  const sheet = await removeInvoiceFromSheet(scriptUrl, num)
  if (!sheet.ok) {
    return {
      ok: portalRemoved > 0,
      message:
        (portalRemoved ? `${num} was removed from the portal, but ` : `${num} was not in the portal, and `) +
        `its Google Sheet row could not be removed (${sheet.error}). Delete that row by hand, ` +
        `or the invoice generator will keep listing it.`,
      portalRemoved,
      sheetRemoved: null,
    }
  }
  if (!portalRemoved && !sheet.removed) {
    return { ok: false, message: `${num} was not found in the portal or the Sheet, so it is already deleted.`, portalRemoved, sheetRemoved: 0 }
  }
  return { ok: true, message: `${num} deleted.`, portalRemoved, sheetRemoved: sheet.removed }
}
