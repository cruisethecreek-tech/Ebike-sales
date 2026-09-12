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
 * This removes the Supabase row only. The Google Sheet is the system of
 * record for invoicing — invoice.html and the CMS Apps Script read and write
 * it, and nothing here touches it. To retire an invoice completely, delete
 * the Sheet row too, or it will be re-synced the next time that invoice is
 * edited and saved.
 */
export async function adminDeleteInvoice(formData: FormData): Promise<void> {
  await requireAdminUser()

  const invoiceId = (formData.get('invoice_id') as string || '').trim()
  if (!invoiceId) return

  const supabase = await createClient()
  await supabase.from('invoices').delete().eq('id', invoiceId)

  revalidatePath('/admin/invoices')
  revalidatePath('/dashboard/invoices')
}
