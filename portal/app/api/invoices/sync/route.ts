import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// CORS headers to allow calls from invoice.html / Google Apps Script
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

function detectBike(itemDesc: string): { brand: string; model: string } | null {
  const d = String(itemDesc || '').trim()
  const lower = d.toLowerCase()

  // Exclude non-bike parts & services
  if (
    lower.includes('tune-up') ||
    lower.includes('service') ||
    lower.includes('installation') ||
    lower.includes('assembly') ||
    lower.includes('delivery') ||
    lower.includes('lock') ||
    lower.includes('helmet') ||
    lower.includes('mirror') ||
    lower.includes('basket') ||
    lower.includes('bag') ||
    lower.includes('battery') ||
    lower.includes('throttle') ||
    lower.includes('tire') ||
    lower.includes('tube') ||
    lower.includes('pedal') ||
    lower.includes('shipping') ||
    lower.includes('freight')
  ) {
    return null
  }

  let brand = 'other'
  if (lower.includes('heybike')) brand = 'Heybike'
  else if (lower.includes('velotric')) brand = 'Velotric'
  else if (lower.includes('jasion')) brand = 'Jasion'
  else if (lower.includes('mooncool')) brand = 'Mooncool'
  else if (lower.includes('aventon')) brand = 'Aventon'
  else if (lower.includes('lectric')) brand = 'Lectric'

  // If marked as trike or bike
  const isBikeOrTrike =
    brand !== 'other' ||
    lower.includes('trike') ||
    lower.includes('bike') ||
    lower.includes('cruiser') ||
    lower.includes('step-thru')

  if (!isBikeOrTrike) return null

  let model = d
  if (brand !== 'other') {
    model = d.replace(new RegExp(brand, 'i'), '').trim()
  }
  if (!model) model = d

  return {
    brand: brand === 'other' ? 'Custom / Other' : brand,
    model: model.replace(/^[-–—:\s]+/, '').trim(),
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const supabase = getAdminClient()

    const invoiceNumber = String(body.invoiceNumber || '').trim()
    const customerName = String(body.customerName || '').trim()
    const email = String(body.customerEmail || '').trim().toLowerCase()
    const phone = String(body.customerPhone || '').trim()
    const total = parseFloat(body.total) || 0
    const paymentMode = String(body.paymentMode || 'full')
    const paymentLink = String(body.paymentLink || '')
    const invoiceDate = String(body.invoiceDate || new Date().toISOString().split('T')[0])
    const status = (paymentMode === 'paidInFullCash' || body.status === 'paid') ? 'paid' : 'pending'

    let items = body.items || []
    if (typeof items === 'string') {
      try { items = JSON.parse(items) } catch (_) { items = [] }
    }

    if (!email) {
      return NextResponse.json(
        { ok: false, message: 'No customer email provided — portal account skipped' },
        { status: 200, headers: corsHeaders }
      )
    }

    // Split name
    const parts = customerName.split(/\s+/)
    const firstName = parts[0] || 'Rider'
    const lastName = parts.slice(1).join(' ') || ''

    // 1. Check or invite user
    const { data: usersData } = await supabase.auth.admin.listUsers()
    let user = usersData?.users?.find((u) => u.email?.toLowerCase() === email)
    let invited = false

    const portalUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://portal.cruisethecreek.com'
    const redirectUrl = `${portalUrl}/auth/callback`

    if (!user) {
      // Send official portal invite email
      const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
        redirectTo: redirectUrl,
        data: {
          first_name: firstName,
          last_name: lastName,
        },
      })

      if (inviteErr) {
        console.warn('Invite email error:', inviteErr)
        // Fallback user creation
        const randomPwd = Math.random().toString(36).slice(2) + 'Aa1!Secure'
        const { data: createdUser, error: createErr } = await supabase.auth.admin.createUser({
          email,
          password: randomPwd,
          email_confirm: true,
          user_metadata: { first_name: firstName, last_name: lastName },
        })
        if (createErr) throw createErr
        user = createdUser.user
      } else {
        user = inviteData.user
        invited = true
      }
    }

    const userId = user.id

    // 2. Create or update customer record
    const refCode = firstName.toUpperCase().replace(/[^A-Z]/g, '') + '-' + Math.random().toString(36).substring(2, 5).toUpperCase()
    await supabase.from('customers').upsert({
      id: userId,
      first_name: firstName,
      last_name: lastName,
      phone: phone || null,
      preferred_contact: 'email',
      referral_code: refCode,
    }, { onConflict: 'id' })

    // 3. Register any bikes from line items
    let bikesAdded = 0
    const { data: existingBikes } = await supabase.from('bikes').select('*').eq('customer_id', userId)

    for (const it of items) {
      const desc = it.description || ''
      const bikeInfo = detectBike(desc)
      if (bikeInfo) {
        const alreadyExists = existingBikes?.some(
          (b) => b.brand.toLowerCase() === bikeInfo.brand.toLowerCase() && b.model.toLowerCase() === bikeInfo.model.toLowerCase()
        )
        if (!alreadyExists) {
          const { error: bikeErr } = await supabase.from('bikes').insert({
            customer_id: userId,
            brand: bikeInfo.brand,
            model: bikeInfo.model,
            purchase_date: invoiceDate,
            receipt_number: invoiceNumber || null,
          })
          if (!bikeErr) bikesAdded++
        }
      }
    }

    // 4. Create or update invoice
    if (invoiceNumber) {
      await supabase.from('invoices').upsert({
        customer_id: userId,
        invoice_number: invoiceNumber,
        total_amount: total,
        status: status,
        issued_at: new Date(invoiceDate).toISOString(),
        paid_at: status === 'paid' ? new Date(invoiceDate).toISOString() : null,
        pdf_url: paymentLink || null,
      }, { onConflict: 'invoice_number' })
    }

    return NextResponse.json(
      {
        ok: true,
        userId,
        customerName,
        email,
        invoiceNumber,
        invited,
        bikesAdded,
      },
      { status: 200, headers: corsHeaders }
    )
  } catch (err: any) {
    console.error('Invoice portal sync failed:', err)
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500, headers: corsHeaders }
    )
  }
}
