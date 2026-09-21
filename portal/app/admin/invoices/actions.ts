'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAdminUser } from '@/lib/require-admin'
import { revalidatePath } from 'next/cache'

export async function updateInvoiceStatus(formData: FormData): Promise<void> {
  await requireAdminUser()

  const invoiceId = formData.get('invoice_id') as string
  const status = formData.get('status') as string

  if (!invoiceId || !status) return

  const supabase = await createClient()

  const updateData: any = { status }

  if (status === 'paid') {
    updateData.paid_at = new Date().toISOString()
  } else {
    updateData.paid_at = null
  }

  await supabase.from('invoices').update(updateData).eq('id', invoiceId)

  revalidatePath('/admin/invoices')
  revalidatePath(`/admin/invoices/${invoiceId}`)
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
