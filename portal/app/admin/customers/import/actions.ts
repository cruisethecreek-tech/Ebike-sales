'use server'

import { createClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/require-admin'
import { findAuthUserByEmail, isAlreadyRegistered } from '@/lib/find-auth-user'
import { detectBike, bikeModelKey } from '@/lib/detect-bike'
import { revalidatePath } from 'next/cache'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export interface ImportRow {
  email: string
  firstName?: string
  lastName?: string
  phone?: string
  bike?: string
  purchaseDate?: string
  orderNumber?: string
}

export type RowOutcome = {
  email: string
  status: 'created' | 'matched' | 'skipped' | 'failed'
  detail: string
  bikeAdded?: string
}

/** Whatever the export called a date, as YYYY-MM-DD, or null if it is not one. */
function normaliseDate(raw?: string): string | null {
  const s = String(raw || '').trim()
  if (!s) return null

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)

  // US order: Wix writes 3/14/2025 and 03/14/2025 12:30 PM.
  const us = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
  if (us) {
    const [, m, d, y] = us
    const year = y.length === 2 ? `20${y}` : y
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  const parsed = new Date(s)
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)

  // Unrecognised beats wrong: a purchase date is warranty maths.
  return null
}

/**
 * Bring a list of past customers into the portal.
 *
 * Three things this must not do, each of which is easier to do than not:
 *
 * 1. Email anybody. These are people who bought from the old Wix shop, some of
 *    them a long time ago. An unexplained "set your password" link from a shop
 *    they half remember is worse than not being in the portal at all — so
 *    accounts are made with createUser, which sends nothing. Inviting them is
 *    a separate, deliberate decision afterwards, and the directory's
 *    NOT INVITED badge is what tracks it. Supabase also caps auth email at 30
 *    an hour, so a silent import is the only one that can finish.
 *
 * 2. Create a second copy of somebody. The shop already has three Patrick
 *    Simms accounts from typing an address slightly differently each time.
 *    Every row is matched against the existing logins by email first, and a
 *    record the shop has since corrected is never overwritten by an older
 *    Wix value.
 *
 * 3. Report a clean run it did not have. Every row comes back with what
 *    happened to it, including the ones that did nothing.
 */
export async function importCustomers(rows: ImportRow[]): Promise<{
  outcomes: RowOutcome[]
  created: number
  matched: number
  skipped: number
  failed: number
  bikesAdded: number
}> {
  await requireAdminUser()
  const supabase = admin()

  const outcomes: RowOutcome[] = []
  let bikesAdded = 0

  // Within one file the same person often appears on several order lines.
  // Remember who has been handled so the second line matches rather than
  // racing the first one's create.
  const seen = new Map<string, string>()

  for (const raw of rows) {
    const email = String(raw.email || '').trim().toLowerCase()
    if (!email || !email.includes('@')) {
      outcomes.push({
        email: raw.email || '(blank)',
        status: 'skipped',
        detail: 'No usable email address — a portal account needs one.',
      })
      continue
    }

    const first = String(raw.firstName || '').trim() || 'Rider'
    const last = String(raw.lastName || '').trim()

    try {
      let userId = seen.get(email) || null
      let status: RowOutcome['status'] = 'matched'
      let detail = 'Already in the portal.'

      if (!userId) {
        const existing = await findAuthUserByEmail(supabase, email)
        if (existing) {
          userId = existing.id
        } else {
          // Sends nothing. See (1) above.
          const { data: made, error: makeErr } = await supabase.auth.admin.createUser({
            email,
            password: Math.random().toString(36).slice(2) + 'Aa1!Import',
            email_confirm: true,
            user_metadata: { first_name: first, last_name: last },
          })
          if (makeErr) {
            if (!isAlreadyRegistered(makeErr)) throw makeErr
            const again = await findAuthUserByEmail(supabase, email)
            if (!again) throw makeErr
            userId = again.id
          } else {
            userId = made.user!.id
            status = 'created'
            detail = 'Account created. No email was sent.'
          }
        }
        seen.set(email, userId!)
      }

      // Fill in only what is missing. A phone number typed into the Sheet last
      // week beats whatever Wix had in 2024, so an import must never overwrite
      // a record the shop has since corrected.
      const { data: current } = await supabase
        .from('customers')
        .select('id, first_name, last_name, phone')
        .eq('id', userId!)
        .maybeSingle()

      if (!current) {
        const refCode =
          first.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8) +
          '-' +
          Math.random().toString(36).substring(2, 5).toUpperCase()
        const { error: custErr } = await supabase.from('customers').insert({
          id: userId!,
          first_name: first,
          last_name: last,
          phone: raw.phone?.trim() || null,
          preferred_contact: 'email',
          referral_code: refCode,
        })
        if (custErr) throw custErr
      } else {
        const patch: Record<string, any> = {}
        if (!current.phone && raw.phone?.trim()) patch.phone = raw.phone.trim()
        if ((!current.last_name || !current.last_name.trim()) && last) patch.last_name = last
        if (Object.keys(patch).length) {
          await supabase.from('customers').update(patch).eq('id', userId!)
        }
      }

      // The bike they bought, if the row names one.
      let bikeAdded: string | undefined
      const bike = raw.bike ? detectBike(raw.bike) : null
      if (bike) {
        const { data: theirs } = await supabase
          .from('bikes')
          .select('brand, model')
          .eq('customer_id', userId!)
        const wanted = bikeModelKey(bike.model)
        const already = (theirs || []).some(
          (b: any) =>
            String(b.brand).toLowerCase() === bike.brand.toLowerCase() &&
            bikeModelKey(b.model) === wanted,
        )
        if (!already) {
          const { error: bikeErr } = await supabase.from('bikes').insert({
            customer_id: userId!,
            brand: bike.brand,
            model: bike.model,
            purchase_date: normaliseDate(raw.purchaseDate),
            // Prefixed so a Wix order number can never be mistaken for a row in
            // the Sheet's CTR- series, or collide with one.
            receipt_number: raw.orderNumber?.trim()
              ? `WIX-${raw.orderNumber.trim().replace(/^WIX-/i, '')}`
              : null,
          })
          if (bikeErr) {
            detail += ` Bike not registered: ${bikeErr.message}.`
          } else {
            bikesAdded++
            bikeAdded = `${bike.brand} ${bike.model}`
          }
        }
      }

      outcomes.push({ email, status, detail, bikeAdded })
    } catch (err: any) {
      outcomes.push({
        email,
        status: 'failed',
        detail: err?.message || 'Import failed for this row.',
      })
    }
  }

  revalidatePath('/admin/customers')

  return {
    outcomes,
    created: outcomes.filter((o) => o.status === 'created').length,
    matched: outcomes.filter((o) => o.status === 'matched').length,
    skipped: outcomes.filter((o) => o.status === 'skipped').length,
    failed: outcomes.filter((o) => o.status === 'failed').length,
    bikesAdded,
  }
}
