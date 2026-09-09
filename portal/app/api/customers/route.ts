import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
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
  try {
    const supabase = getAdminClient()

    // 1. Fetch Supabase customers + auth users
    const { data: customers } = await supabase.from('customers').select('*')
    const { data: usersData } = await supabase.auth.admin.listUsers()

    const emailMap = new Map<string, string>()
    usersData?.users?.forEach((u) => {
      if (u.email) emailMap.set(u.id, u.email)
    })

    const customerMap = new Map<
      string,
      {
        id: string
        name: string
        firstName: string
        lastName: string
        email: string
        phone: string
        address: string
      }
    >()

    // Seed from Supabase
    customers?.forEach((c) => {
      const email = emailMap.get(c.id) || ''
      const name = `${c.first_name || ''} ${c.last_name || ''}`.trim()
      const key = (email || name).toLowerCase()
      if (key) {
        customerMap.set(key, {
          id: c.id,
          name: name || email,
          firstName: c.first_name || '',
          lastName: c.last_name || '',
          email: email,
          phone: c.phone || '',
          address: '',
        })
      }
    })

    // 2. Supplement / enrich with Google Sheet Invoices tab (carries addresses and all invoice customers)
    try {
      const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_TAB)}`
      const resp = await fetch(csvUrl, { next: { revalidate: 60 } })
      if (resp.ok) {
        const csvText = await resp.text()
        const rows = parseCSV(csvText)
        rows.forEach((row) => {
          const email = (row.customerEmail || '').trim().toLowerCase()
          const name = (row.customerName || '').trim()
          const phone = (row.customerPhone || '').trim()
          const address = (row.customerAddress || '').trim()

          const key = (email || name).toLowerCase()
          if (!key) return

          if (customerMap.has(key)) {
            const existing = customerMap.get(key)!
            if (!existing.address && address) existing.address = address
            if (!existing.phone && phone) existing.phone = phone
            if (!existing.name && name) existing.name = name
          } else {
            const parts = name.split(/\s+/)
            customerMap.set(key, {
              id: '',
              name: name || email,
              firstName: parts[0] || '',
              lastName: parts.slice(1).join(' ') || '',
              email: email,
              phone: phone,
              address: address,
            })
          }
        })
      }
    } catch (sheetErr) {
      console.warn('Google Sheet fetch fallback in api/customers:', sheetErr)
    }

    // Convert map to sorted array
    const list = Array.from(customerMap.values())
      .filter((c) => c.name || c.email)
      .sort((a, b) => a.name.localeCompare(b.name))

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
