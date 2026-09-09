'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateInvoiceStatus(formData: FormData): Promise<void> {
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
