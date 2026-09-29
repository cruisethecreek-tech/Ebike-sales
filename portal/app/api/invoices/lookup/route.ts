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

  const { data, error } = await createServiceClient()
    .from('invoices')
    .select('id, invoice_number, customer_id, customers(archived_at)')
    .in('invoice_number', numbers)
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: corsHeaders })
  }

  const invoices: Record<string, { id: string; customerId: string; customerArchived: boolean }> = {}
  for (const row of data || []) {
    const cust = row.customers as { archived_at: string | null } | { archived_at: string | null }[] | null
    const archivedAt = Array.isArray(cust) ? cust[0]?.archived_at : cust?.archived_at
    invoices[row.invoice_number as string] = {
      id: row.id,
      customerId: row.customer_id,
      customerArchived: Boolean(archivedAt),
    }
  }
  return NextResponse.json({ ok: true, invoices }, { headers: corsHeaders })
}
