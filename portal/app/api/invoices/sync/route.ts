import { NextRequest, NextResponse } from 'next/server'
import { requireAdminKey, corsFor } from '@/lib/api-auth'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// CORS headers to allow calls from invoice.html / Google Apps Script
export async function OPTIONS(req: Request) {
  return NextResponse.json({}, { headers: corsFor(req) })
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

  // These must be values of the bike_brand enum and nothing else. The previous
  // list returned 'Aventon', 'Lectric' and 'Custom / Other', none of which
  // exist in that type, so any bike matching them failed to insert instead of
  // being recorded — which is why `other` appears on none of the 34 bikes on
  // file. Mokwheel, the largest range in the shop, was missing entirely.
  let brand = 'other'
  if (lower.includes('heybike')) brand = 'Heybike'
  else if (lower.includes('velotric')) brand = 'Velotric'
  else if (lower.includes('jasion')) brand = 'Jasion'
  else if (lower.includes('mooncool')) brand = 'Mooncool'
  else if (lower.includes('mokwheel')) brand = 'Mokwheel'

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

  // 'other' verbatim — it is the enum value. The maker's name stays in the
  // model, so an Aventon trade-in reads "other / Aventon Level 2" rather than
  // being lost to a failed insert.
  return {
    brand,
    model: model.replace(/^[-–—:\s]+/, '').trim(),
  }
}

export async function POST(req: NextRequest) {
  // These routes run with the service-role key and return/write customer
  // records. Reject anything without the shared admin key.
  const denied = requireAdminKey(req)
  if (denied) return denied
  const corsHeaders = corsFor(req)

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

    // Opt-in silence. Default stays false so a real sale still invites the
    // customer the moment their invoice is created — that is the point of the
    // portal. Set when back-filling historical invoices during an audit,
    // where mailing someone a "set your password" link months after the fact
    // is an unexplained email from a shop they may barely remember.
    const quiet = body.quiet === true || body.quiet === 'true'
    const status = (paymentMode === 'paidInFullCash' || body.status === 'paid') ? 'paid' : 'pending'

    // Deliberately reads undefined and '' differently. An older cached copy
    // of invoice.html sends no supplierUrl at all; that must not be recorded
    // as "confirmed none", or the invoice list would tell staff to redo
    // warranty paperwork that is already done.
    const supplierUrl =
      body.supplierUrl === undefined || body.supplierUrl === null
        ? undefined
        : String(body.supplierUrl).trim()

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

    let createdQuietly = false

    if (!user && quiet) {
      // Create the account WITHOUT inviteUserByEmail, which is the only call
      // on this path that sends mail. The customer exists, their invoice shows
      // up, and nothing lands in their inbox. They can be invited later, on
      // purpose, by syncing the invoice again without quiet.
      //
      // email_confirm: true so the address is not left pending; the random
      // password is never used or returned — they will set their own via the
      // invite or a reset when that day comes.
      const randomPwd = Math.random().toString(36).slice(2) + 'Aa1!Quiet'
      const { data: madeUser, error: makeErr } = await supabase.auth.admin.createUser({
        email,
        password: randomPwd,
        email_confirm: true,
        user_metadata: { first_name: firstName, last_name: lastName },
      })
      if (makeErr) throw makeErr
      user = madeUser.user
      createdQuietly = true
    }

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
    //
    // Keep the line items. They were already being read above to work out
    // which bikes to register, then thrown away — so the admin invoice list
    // could show a customer and an amount but nothing about what was sold,
    // and the only way to find out was to reopen the invoice in the
    // generator. Store exactly what came in, normalised to
    // {description, qty, price} so the UI can rely on the shape.
    const lineItems = Array.isArray(items)
      ? items
          .map((it: any) => ({
            description: String(it?.description ?? '').trim(),
            qty: Number(it?.qty) || 1,
            price: Number(it?.price) || 0,
          }))
          .filter((it: { description: string }) => it.description)
      : []

    if (invoiceNumber) {
      const { error: invErr } = await supabase.from('invoices').upsert({
        customer_id: userId,
        invoice_number: invoiceNumber,
        total_amount: total,
        status: status,
        issued_at: new Date(invoiceDate).toISOString(),
        paid_at: status === 'paid' ? new Date(invoiceDate).toISOString() : null,
        pdf_url: paymentLink || null,
        // Only overwrite with something. A re-sync that arrives without
        // items should not wipe the items an earlier sync stored.
        ...(lineItems.length ? { items: lineItems } : {}),
        ...(supplierUrl === undefined ? {} : { supplier_url: supplierUrl }),
      }, { onConflict: 'invoice_number' })

      // The upsert used to be fire-and-forget. A failure here means the
      // portal silently disagrees with the Sheet about what was invoiced,
      // so say so in the response rather than reporting a clean sync.
      if (invErr) {
        return NextResponse.json(
          { ok: false, userId, invoiceNumber, invited, bikesAdded,
            error: 'Customer synced but the invoice did not save: ' + invErr.message },
          { status: 500, headers: corsHeaders }
        )
      }
    }

    return NextResponse.json(
      {
        ok: true,
        userId,
        customerName,
        email,
        invoiceNumber,
        invited,
        createdQuietly,
        emailSent: invited,
        bikesAdded,
        itemsSaved: lineItems.length,
        supplierUrlSaved: supplierUrl === undefined ? null : supplierUrl !== '',
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
