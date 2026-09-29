import { NextRequest, NextResponse } from 'next/server'
import { requireAdminKey, corsFor } from '@/lib/api-auth'
import { createClient } from '@supabase/supabase-js'
import { listAuthAccounts } from '@/lib/auth-accounts'
import { buildCustomerDirectory } from '@/lib/customer-directory'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function OPTIONS(req: Request) {
  return NextResponse.json({}, { headers: corsFor(req) })
}

const SHEET_ID = '1R3pDFG_sO81bKS6dEAa-k5F-OdD5OAbe4hQ-Oc0_T-E'
const SHEET_TAB = 'Invoices'

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter((l) => l.trim())
  if (lines.length < 2) return []

  function parseLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(current)
        current = ''
      } else {
        current += ch
      }
    }
    result.push(current)
    return result
  }

  const headers = parseLine(lines[0])
  return lines.slice(1).map((line) => {
    const values = parseLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => {
      row[h] = values[i] || ''
    })
    return row
  })
}

export async function GET(req: NextRequest) {
  // These routes run with the service-role key and return/write customer
  // records. Reject anything without the shared admin key.
  const denied = requireAdminKey(req)
  if (denied) return denied
  const corsHeaders = corsFor(req)

  try {
    const supabase = getAdminClient()

    // 1. Fetch Supabase customers + auth users
    const { data: customers } = await supabase
      .from('customers')
      .select('id, first_name, last_name, phone, referral_code, archived_at')

    // listAuthAccounts paginates. A bare listUsers() returns 50, the shop has
    // 61, and the eleven it omits are the oldest customers — who would have
    // come back from this endpoint with no email address at all, silently.
    const { accounts, error: accountsErr } = await listAuthAccounts()
    if (accountsErr) console.warn('Auth account lookup degraded:', accountsErr)

    const emailMap = new Map<string, string>()
    accounts.forEach((acct, id) => {
      if (acct.email) emailMap.set(id, acct.email)
    })

    // 2. The Sheet's Invoices tab carries addresses and every invoice
    // customer, including walk-ins the portal never saw.
    let sheetRows: Record<string, string>[] = []
    try {
      const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_TAB)}`
      const resp = await fetch(csvUrl, { next: { revalidate: 60 } })
      if (resp.ok) sheetRows = parseCSV(await resp.text())
    } catch (sheetErr) {
      console.warn('Google Sheet fetch fallback in api/customers:', sheetErr)
    }

    // Archived and merged-away customers are left out here, and so are their
    // Sheet rows, so the generator shows what the portal shows.
    const list = buildCustomerDirectory(customers || [], emailMap, sheetRows)

    return NextResponse.json(
      { ok: true, count: list.length, customers: list },
      { status: 200, headers: corsHeaders }
    )
  } catch (err: any) {
    console.error('Error fetching customers directory:', err)
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500, headers: corsHeaders }
    )
  }
}
