import { findAuthUserByEmail, isAlreadyRegistered } from '@/lib/find-auth-user'
import { canonicalInvoiceNumber, sameInvoiceNumber } from '@/lib/invoice-number'
import { bikesOnInvoice, bikeModelKey } from '@/lib/detect-bike'
import { purchaseSummary } from '@/lib/invite-personalization'
import { createClient } from '@supabase/supabase-js'
import { notifyReferrerOfPaidPurchase } from '@/lib/referral-email'

/**
 * Put one invoice into the portal: find or make the customer's login, keep
 * their customer record current, register the bikes on it, and store the
 * invoice.
 *
 * This lives apart from the route that used to hold it because two different
 * callers need it under two different kinds of authorisation, and only one of
 * them can hold the shared secret:
 *
 *   - invoice.html, a static page on the storefront origin with no portal
 *     session, calls POST /api/invoices/sync with the x-ctc-admin-key header.
 *   - The admin pages, which have a signed-in staff session and no business
 *     knowing that secret, call it through a server action.
 *
 * The reconcile page's Import button used to be a browser fetch to that route
 * with no key on it, so it answered 401 every time. The page that existed to
 * find missing invoices could not put a single one back.
 */
export type SyncResult = { status: number; payload: Record<string, any> }

const jsonResult = (payload: Record<string, any>, status = 200): SyncResult => ({ status, payload })

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function syncInvoice(body: any): Promise<SyncResult> {
  try {
    const supabase = getAdminClient()

    // CTR-71 and CTR-071 are the same invoice. /dashboard/invoices/[id] matches
    // invoice_number exactly, so storing whichever spelling was typed is what
    // produced a receipt link that 404s. Canonicalise on the way in, on both
    // the invoice row and the bike's receipt_number that links to it.
    const invoiceNumber = canonicalInvoiceNumber(body.invoiceNumber) || ''
    const receiptNumber = invoiceNumber || null
    const customerName = String(body.customerName || '').trim()
    const email = String(body.customerEmail || '').trim().toLowerCase()
    const phone = String(body.customerPhone || '').trim()
    const total = parseFloat(body.total) || 0

    // The money broken into its parts. Older senders do not include these, so
    // `undefined` means "not told" and must leave the stored value alone —
    // writing 0 would turn a silent omission into a confident wrong number,
    // which is the failure this breakdown exists to prevent.
    const num = (v: any): number | undefined => {
      if (v === undefined || v === null || v === '') return undefined
      const n = parseFloat(v)
      return Number.isFinite(n) ? n : undefined
    }
    const subtotal = num(body.subtotal)
    const discountAmount = num(body.discountAmt)
    const discountPercent = num(body.discountPct)
    const taxAmount = num(body.tax)
    const processingFee = num(body.processingFee)
    const amountPaid = num(body.amountPaid)
    const balanceDue = num(body.balanceDue)
    const paymentMethod = body.paymentMethod === undefined
      ? undefined : String(body.paymentMethod || '').trim().toLowerCase()
    const paymentReference = body.paymentRef === undefined
      ? undefined : String(body.paymentRef || '').trim()
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
      // A legitimate skip — a portal invoice belongs to a login and a login is
      // an email address — but it answered 200 with the reason in `message`,
      // and every caller checked `res.ok`. So five real sales were declined
      // with the word "success" on the screen. Name it in `error` too, which is
      // the field callers read, and keep the 200: this is a decision, not a
      // fault.
      return jsonResult({
          ok: false,
          skipped: 'no_email',
          invoiceNumber,
          message: 'No customer email provided — portal account skipped',
          error: `${invoiceNumber || 'This invoice'} has no customer email, so it cannot go in the portal. It is in the Sheet only.`,
        }, 200)
    }

    // Split name
    const parts = customerName.split(/\s+/)
    const firstName = parts[0] || 'Rider'
    const lastName = parts.slice(1).join(' ') || ''

    // 1. Check or invite user
    //
    // Paginated. listUsers() returns 50 by default and the shop has 61, so the
    // eleven oldest customers were invisible here — the route then tried to
    // create an account that already existed and threw "A user with this email
    // address has already been registered", which the browser showed as a bare
    // HTTP 500 on an invoice that had in fact saved.
    let user: any = await findAuthUserByEmail(supabase, email)
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
      if (makeErr) {
        // The lookup missed it, or another save created it a moment ago.
        // Either way the account exists, which is what we wanted.
        if (!isAlreadyRegistered(makeErr)) throw makeErr
        user = await findAuthUserByEmail(supabase, email)
        if (!user) throw makeErr
      } else {
        user = madeUser.user
        createdQuietly = true
      }
    }

    if (!user) {
      // Send official portal invite email
      const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
        redirectTo: redirectUrl,
        data: {
          first_name: firstName,
          last_name: lastName,
          // Read by the invite email template as {{ .Data.purchase }}.
          purchase: purchaseSummary(bikesOnInvoice(items)),
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
        if (createErr) {
          // Same story on the non-quiet path: an invite that fails because the
          // account exists is not a reason to fail the invoice.
          if (!isAlreadyRegistered(createErr)) throw createErr
          const existing = await findAuthUserByEmail(supabase, email)
          if (!existing) throw createErr
          user = existing
        } else {
          // This assignment used to run unconditionally, one line below the
          // recovery above. When the create had failed, `createdUser` is null,
          // so reading `.user` off it threw a TypeError — and the invoice the
          // shop had just written was lost to a bare HTTP 500 on the very path
          // that had just worked out who the customer was.
          user = createdUser?.user ?? null
        }
      } else {
        user = inviteData.user
        invited = true
      }
    }

    // Never read `.id` off nothing. Every branch above is meant to end with an
    // account, and if one ever does not, say which invoice and which customer
    // rather than reporting "Cannot read properties of null".
    if (!user?.id) {
      return jsonResult({ ok: false, invoiceNumber,
          error: `Could not find or create a portal account for ${email}. The invoice was not saved to the portal.` }, 500)
    }
    const userId = user.id

    // 2. Create or update customer record
    //
    // The referral code is made once, when the record is. This used to upsert
    // a freshly generated code on every sync, so each time any of a
    // customer's invoices was saved their code changed and the QR code they
    // had already shared stopped matching anybody.
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id, referred_by, first_name, last_name, phone, details_edited_at')
      .eq('id', userId)
      .maybeSingle()
    if (existingCustomer) {
      // Once staff have corrected this customer in the admin portal, that is
      // the record: an invoice save (often of an old invoice, carrying the
      // old spelling) only fills in what is blank.
      const patch = existingCustomer.details_edited_at
        ? {
            ...(!String(existingCustomer.first_name || '').trim() && firstName ? { first_name: firstName } : {}),
            ...(!String(existingCustomer.last_name || '').trim() && lastName ? { last_name: lastName } : {}),
            ...(!existingCustomer.phone && phone ? { phone } : {}),
          }
        : { first_name: firstName, last_name: lastName, phone: phone || null }
      if (Object.keys(patch).length) {
        await supabase.from('customers').update(patch).eq('id', userId)
      }
    } else {
      const refCode = firstName.toUpperCase().replace(/[^A-Z]/g, '') + '-' + Math.random().toString(36).substring(2, 5).toUpperCase()
      await supabase.from('customers').insert({
        id: userId,
        first_name: firstName,
        last_name: lastName,
        phone: phone || null,
        preferred_contact: 'email',
        referral_code: refCode,
      })
    }

    // 2b. Who referred them. The storefront's cart and the invoice generator
    // write "Referred by: CODE" into the notes; the code is another
    // customer's referral_code. Set once and never overwritten, and never to
    // the customer themselves.
    let referredBy: string | null = null
    const referralCode = referralCodeFromNotes(body.paymentNotes)
    if (referralCode && !existingCustomer?.referred_by) {
      const { data: referrer } = await supabase
        .from('customers')
        .select('id')
        .ilike('referral_code', referralCode)
        .maybeSingle()
      if (referrer && referrer.id !== userId) {
        const { error: refErr } = await supabase
          .from('customers')
          .update({ referred_by: referrer.id })
          .eq('id', userId)
          .is('referred_by', null)
        if (!refErr) referredBy = referrer.id
      }
    }

    // 3. Register any bikes from line items
    let bikesAdded = 0
    const bikeErrors: string[] = []
    const { data: existingBikeRows } = await supabase.from('bikes').select('*').eq('customer_id', userId)

    // Rows this invoice could already have produced. Each one can account for
    // at most one bike, so it is removed from the pool once claimed — otherwise
    // an invoice selling two different Velotrics would see the one row on file
    // as covering both of them.
    const pool = (existingBikeRows || []).map((b: any) => ({
      brand: String(b.brand || ''),
      key: bikeModelKey(b.model),
      receipt: String(b.receipt_number || '').trim(),
      claimed: false,
    }))

    for (const bike of bikesOnInvoice(items)) {
      const wantKey = bikeModelKey(bike.model)
      const sameBrand = (r: typeof pool[number]) =>
        !r.claimed && r.brand.toLowerCase() === bike.brand.toLowerCase()

      let already = 0
      for (let pass = 0; pass < 2; pass++) {
        for (const row of pool) {
          if (already >= bike.count) break
          if (!sameBrand(row)) continue
          // First pass: the model matches, ignoring any note in brackets.
          // Second pass: the model was typed differently by hand, but the row
          // carries this invoice's number, which ties it to this sale anyway —
          // Earl Boylen's Mokwheel is on file as "Basalt 2.0 camo" where the
          // invoice line reads "Mokwheel Basalt ST 2.0 Ebike".
          const hit = pass === 0
            ? row.key === wantKey
            : !!receiptNumber && sameInvoiceNumber(row.receipt, receiptNumber)
          if (!hit) continue
          row.claimed = true
          already++
        }
      }

      for (let n = already; n < bike.count; n++) {
        const { error: bikeErr } = await supabase.from('bikes').insert({
          customer_id: userId,
          brand: bike.brand,
          model: bike.model,
          purchase_date: invoiceDate,
          receipt_number: receiptNumber,
        })

        if (bikeErr) {
          // Silence here is how the Aventon and Mokwheel bikes disappeared: the
          // enum rejected the brand, the counter simply did not go up, and the
          // response still said the sync had worked. Report it instead.
          bikeErrors.push(`${bike.brand} ${bike.model}: ${bikeErr.message}`)
          break
        }
        bikesAdded++
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
        ...(subtotal === undefined ? {} : { subtotal }),
        ...(discountAmount === undefined ? {} : { discount_amount: discountAmount }),
        ...(discountPercent === undefined ? {} : { discount_percent: discountPercent }),
        ...(taxAmount === undefined ? {} : { tax_amount: taxAmount }),
        ...(processingFee === undefined ? {} : { processing_fee: processingFee }),
        ...(amountPaid === undefined ? {} : { amount_paid: amountPaid }),
        ...(balanceDue === undefined ? {} : { balance_due: balanceDue }),
        ...(paymentMethod === undefined ? {} : { payment_method: paymentMethod || null }),
        ...(paymentReference === undefined ? {} : { payment_reference: paymentReference || null }),
      }, { onConflict: 'invoice_number' })

      // The upsert used to be fire-and-forget. A failure here means the
      // portal silently disagrees with the Sheet about what was invoiced,
      // so say so in the response rather than reporting a clean sync.
      if (invErr) {
        return jsonResult({ ok: false, userId, invoiceNumber, invited, bikesAdded,
            ...(bikeErrors.length ? { bikeErrors } : {}),
            error: 'Customer synced but the invoice did not save: ' + invErr.message }, 500)
      }
    }

    // 5. A referred customer's first paid purchase: tell whoever sent them.
    // Does nothing for anyone else, and only ever once per customer.
    const referralEmail = status === 'paid'
      ? await notifyReferrerOfPaidPurchase(supabase, userId)
      : undefined

    return jsonResult({
        ok: true,
        userId,
        customerName,
        email,
        invoiceNumber,
        invited,
        createdQuietly,
        emailSent: invited,
        bikesAdded,
        // A bike that could not be recorded is not a clean sync. Saying so in
        // the same breath as ok:true is deliberate — the invoice itself did
        // save, and the shop needs to know the garage will be short.
        ...(bikeErrors.length ? { bikeErrors, warning: `${bikeErrors.length} bike(s) could not be registered.` } : {}),
        itemsSaved: lineItems.length,
        supplierUrlSaved: supplierUrl === undefined ? null : supplierUrl !== '',
        ...(referredBy ? { referredBy } : {}),
        ...(referralEmail && referralEmail !== 'none' ? { referralEmail } : {}),
      }, 200)
  } catch (err: any) {
    console.error('Invoice portal sync failed:', err)
    return jsonResult({ ok: false, error: err.message }, 500)
  }
}

/**
 * The referral code in an invoice's notes, if there is one.
 *
 * "Referred by: ANNA-I1T" is what the cart and the invoice generator write.
 * "Referral / Promo Code: ANNA-I1T" is what the generator used to write, so
 * older invoices read the same way. A bare promo like 20OFF will not match
 * anybody's referral_code and is ignored by the lookup.
 */
export function referralCodeFromNotes(notes: unknown): string | null {
  const m = String(notes || '').match(/(?:referred\s+by|referral(?:\s*\/\s*promo)?\s*code)\s*:\s*([A-Za-z0-9-]{3,24})/i)
  return m ? m[1].toUpperCase() : null
}
