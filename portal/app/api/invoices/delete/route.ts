import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdminKey, corsFor } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { removeInvoiceEverywhere } from '@/lib/invoice-removal'
import { APPS_SCRIPT_CMS_URL } from '@/lib/constants'

// The Sheet half waits on the Apps Script (up to 25 s, see invoice-removal).
// Without this the platform's default limit could cut the request off first,
// and the generator saw only "Failed to fetch" with no answer at all.
export const maxDuration = 60

export async function OPTIONS(req: Request) {
  return NextResponse.json({}, { headers: corsFor(req) })
}

/**
 * Delete an invoice from the portal and the Google Sheet, for the invoice
 * generator's "Delete invoice" button (test invoices and mistakes).
 *
 *   POST /api/invoices/delete  { invoiceNumber: "CTR-067" }
 *   → { ok, message, portalRemoved, sheetRemoved }
 */
export async function POST(req: NextRequest) {
  const denied = requireAdminKey(req)
  if (denied) return denied
  const corsHeaders = corsFor(req)

  const body = await req.json().catch(() => ({}))
  const result = await removeInvoiceEverywhere(createServiceClient(), APPS_SCRIPT_CMS_URL, String(body?.invoiceNumber || ''))
  if (result.portalRemoved) {
    revalidatePath('/admin/invoices')
    revalidatePath('/admin/customers')
    revalidatePath('/dashboard/invoices')
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 400, headers: corsHeaders })
}
