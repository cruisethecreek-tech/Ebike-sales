import { NextRequest, NextResponse } from 'next/server'
import { requireAdminKey, corsFor } from '@/lib/api-auth'
import { syncInvoice } from '@/lib/sync-invoice'

// CORS headers to allow calls from invoice.html / Google Apps Script
export async function OPTIONS(req: Request) {
  return NextResponse.json({}, { headers: corsFor(req) })
}

export async function POST(req: NextRequest) {
  // This route runs with the service-role key and writes customer records.
  // Reject anything without the shared admin key. Staff pages inside the
  // portal do not come through here — they have a session instead, and call
  // syncInvoice directly from a server action.
  const denied = requireAdminKey(req)
  if (denied) return denied
  const corsHeaders = corsFor(req)

  const body = await req.json().catch(() => ({}))
  const { status, payload } = await syncInvoice(body)
  return NextResponse.json(payload, { status, headers: corsHeaders })
}
