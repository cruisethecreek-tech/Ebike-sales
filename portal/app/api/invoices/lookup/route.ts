import { NextRequest, NextResponse } from 'next/server'
import { requireAdminKey, corsFor } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'

export async function OPTIONS(req: Request) {
  return NextResponse.json({}, { headers: corsFor(req) })
}

/**
 * Which of these invoice numbers the portal has, and where to open them.
 *
 * The generator lists invoices from the Google Sheet, which is the system of
 * record, so an invoice deleted in the portal is still listed there. This lets
 * it say so per row, and link the rest to the admin page.
 *
 *   GET /api/invoices/lookup?numbers=CTR-001,CTR-067
 *   → { ok, invoices: { "CTR-001": { id, customerId, customerArchived } } }
 *
 * A number missing from `invoices` is not in the portal.
 *
 * With `&detail=1` each entry also carries the invoice itself (customer,
 * line items, totals), so the generator can still open an invoice when the
 * Apps Script call fails, instead of showing an empty "Sales Order".
 */
export async function GET(req: NextRequest) {
  const denied = requireAdminKey(req)
  if (denied) return denied
  const corsHeaders = corsFor(req)

  const numbers = Array.from(
    new Set(
      (req.nextUrl.searchParams.get('numbers') || '')
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean),
    ),
  ).slice(0, 100)
  if (!numbers.length) {
    return NextResponse.json({ ok: true, invoices: {} }, { headers: corsHeaders })
  }

  const detail = req.nextUrl.searchParams.get('detail') === '1'
  const { data, error } = await createServiceClient()
    .from('invoices')
    .select(
      detail
        ? 'id, invoice_number, customer_id, issued_at, created_at, status, items, subtotal, discount_amount, discount_percent, tax_amount, processing_fee, total_amount, amount_paid, balance_due, customers(archived_at, first_name, last_name, email, phone)'
        : 'id, invoice_number, customer_id, customers(archived_at)',
    )
    .in('invoice_number', numbers)
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: corsHeaders })
  }

  type Cust = { archived_at: string | null; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null }
  const invoices: Record<string, Record<string, unknown>> = {}
  for (const row of (data || []) as unknown as Array<Record<string, unknown>>) {
    const joined = row.customers as Cust | Cust[] | null
    const cust = Array.isArray(joined) ? joined[0] : joined
    const entry: Record<string, unknown> = {
      id: row.id,
      customerId: row.customer_id,
      customerArchived: Boolean(cust?.archived_at),
    }
    if (detail) {
      entry.invoice = {
        invoiceNumber: row.invoice_number,
        invoiceDate: row.issued_at || row.created_at || '',
        customerName: `${cust?.first_name || ''} ${cust?.last_name || ''}`.trim(),
        customerEmail: cust?.email || '',
        customerPhone: cust?.phone || '',
        lineItems: Array.isArray(row.items) ? row.items : [],
        subtotal: Number(row.subtotal) || 0,
        discountPct: Number(row.discount_percent) || 0,
        discountAmt: Number(row.discount_amount) || 0,
        tax: Number(row.tax_amount) || 0,
        processingFee: Number(row.processing_fee) || 0,
        total: Number(row.total_amount) || 0,
        status: row.status || '',
      }
    }
    invoices[row.invoice_number as string] = entry
  }
  return NextResponse.json({ ok: true, invoices }, { headers: corsHeaders })
}
