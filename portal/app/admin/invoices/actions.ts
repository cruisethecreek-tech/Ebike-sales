'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAdminUser } from '@/lib/require-admin'
import { revalidatePath } from 'next/cache'
import { APPS_SCRIPT_CMS_URL } from '@/lib/constants'

export type StatusResult = { ok: boolean; message?: string; sheetSynced?: boolean }

/**
 * Push a status change to the Google Sheet.
 *
 * The Sheet is the system of record for invoicing — invoice.html and
 * balance.html bill from it, and the portal holds a mirror. Marking an
 * invoice paid only in Supabase therefore changed nothing real; it repainted
 * a badge while the Sheet still showed a balance owing.
 *
 * setInvoiceStatus writes status, zeroes balanceDue when paid, and appends a
 * dated note to paymentNotes. It sends NO email: nothing on this path touches
 * MailApp or GmailApp, and no Stripe call is made. That matters because this
 * is used to audit historical invoices, and a customer receiving a fresh bill
 * for something they settled months ago would be worse than the bug.
 *
 * Called from the server, so no CORS and no JSONP — just read the JSON back.
 */
async function syncStatusToSheet(
  invoiceNumber: string,
  status: string
): Promise<{ ok: boolean; error?: string }> {
  if (!invoiceNumber) return { ok: false, error: 'this invoice has no number, so the Sheet row cannot be found' }

  const url =
    `${APPS_SCRIPT_CMS_URL}?action=setInvoiceStatus` +
    `&invoiceNumber=${encodeURIComponent(invoiceNumber)}` +
    `&status=${encodeURIComponent(status)}` +
    `&method=${encodeURIComponent('portal')}`

  try {
    // Apps Script answers a redirect; follow it and read the body. A timeout
    // rather than an open-ended wait: a hung script must not hang the action.
    const res = await fetch(url, {
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    const text = await res.text()

    // setInvoiceStatus replies as JSONP when a callback is given and plain
    // JSON when not, so find the object either way.
    const a = text.indexOf('{')
    const b = text.lastIndexOf('}')
    if (a === -1) return { ok: false, error: 'the Sheet did not return JSON' }

    const data = JSON.parse(text.slice(a, b + 1))
    if (data.status === 'ok' || data.ok === true) return { ok: true }
    return { ok: false, error: String(data.message || data.error || 'the Sheet refused the change') }
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) }
  }
}

export async function updateInvoiceStatus(
  _prev: StatusResult | null,
  formData: FormData
): Promise<StatusResult> {
  await requireAdminUser()

  const invoiceId = String(formData.get('invoice_id') || '').trim()
  const status = String(formData.get('status') || '').trim()

  if (!invoiceId || !status) return { ok: false, message: 'Nothing to update.' }

  const supabase = await createClient()

  const updateData: any = { status }
  updateData.paid_at = status === 'paid' ? new Date().toISOString() : null

  const { data: rows, error } = await supabase
    .from('invoices')
    .update(updateData)
    .eq('id', invoiceId)
    .select('invoice_number')

  if (error) return { ok: false, message: error.message }
  if (!rows || rows.length === 0) {
    return { ok: false, message: 'Nothing changed — the database refused the update for this account.' }
  }

  const invoiceNumber = String(rows[0].invoice_number || '')
  const sheet = await syncStatusToSheet(invoiceNumber, status)

  revalidatePath('/admin/invoices')
  revalidatePath(`/admin/invoices/${invoiceId}`)
  revalidatePath('/dashboard/invoices')

  if (!sheet.ok) {
    // Deliberately still ok:false. The portal and the Sheet now disagree, and
    // the Sheet is the one that bills — saying "saved" here is exactly the
    // cosmetic success this change exists to eliminate.
    return {
      ok: false,
      sheetSynced: false,
      message:
        `Portal updated to "${status}", but the Google Sheet was NOT updated ` +
        `(${sheet.error}). The Sheet is what bills, so ${invoiceNumber || 'this invoice'} ` +
        `is not really ${status} yet — change it in the invoice generator, or retry.`,
    }
  }

  return { ok: true, sheetSynced: true, message: `${invoiceNumber} set to ${status} in both the portal and the Sheet.` }
}

/**
 * Delete an invoice from the portal.
 *
 * Returns a result instead of void, because the previous version could not
 * fail visibly. RLS on public.invoices had select, insert and update policies
 * for admins but no delete policy, and Postgres does not error when no policy
 * matches — it deletes nothing and reports success. The action discarded the
 * response, revalidated the path, and the row rendered again exactly where it
 * had been. Two clicks, a red "Confirm delete", and no effect of any kind.
 *
 * So: ask for the deleted rows back. Zero rows with no error is the signature
 * of an RLS refusal, and it is reported as one rather than swallowed.
 *
 * This removes the Supabase row only. The Google Sheet is the system of
 * record for invoicing — invoice.html and the CMS Apps Script read and write
 * it, and nothing here touches it. To retire an invoice completely, delete
 * the Sheet row too, or it will be re-synced the next time that invoice is
 * edited and saved.
 */
export type DeleteInvoiceResult = { ok: boolean; message?: string }

export async function adminDeleteInvoice(
  _prev: DeleteInvoiceResult | null,
  formData: FormData
): Promise<DeleteInvoiceResult> {
  await requireAdminUser()

  const invoiceId = ((formData.get('invoice_id') as string) || '').trim()
  if (!invoiceId) return { ok: false, message: 'No invoice was specified.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('invoices')
    .delete()
    .eq('id', invoiceId)
    .select('id')

  if (error) {
    return { ok: false, message: error.message }
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      message:
        'Nothing was deleted. The invoice is either already gone or the database ' +
        'refused the delete for this account.',
    }
  }

  revalidatePath('/admin/invoices')
  revalidatePath('/dashboard/invoices')
  return { ok: true }
}
