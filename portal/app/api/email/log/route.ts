import { NextRequest, NextResponse } from 'next/server'
import { requireAdminKey } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { logEmail, parseEmailLogEntry } from '@/lib/email-tracking'

// The Apps Script reports each customer email it sends here (invoice
// receipts, referral emails, waivers, ...), with the token it put in the
// email. Same shared admin key as /api/invoices/sync.

export async function POST(req: NextRequest) {
  const denied = requireAdminKey(req)
  if (denied) return denied

  const entry = parseEmailLogEntry(await req.json().catch(() => null))
  if (!entry) return NextResponse.json({ ok: false, error: 'token, email and kind are required' }, { status: 400 })

  await logEmail(createServiceClient(), entry)
  return NextResponse.json({ ok: true })
}
