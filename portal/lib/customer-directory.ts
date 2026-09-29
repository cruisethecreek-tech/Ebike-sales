/**
 * The customer list the invoice generator's picker shows.
 *
 * It is built from two places: the portal's customers, and every name on the
 * Google Sheet's Invoices tab (which has walk-ins the portal never saw). The
 * portal is the one that knows about merges and archives, so it decides:
 *
 *   - an archived customer (including the loser of a merge) is left out;
 *   - a Sheet row that is that archived customer (same email and same name,
 *     or no email and the same name) is left out too, or the Sheet would put
 *     them straight back — which is how a merged duplicate kept showing up.
 *
 * Matching an archived record on email alone is not enough: staff addresses
 * stand in for customers with no email, so one address can sit on many rows
 * that are different people.
 */

export type PortalCustomer = {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  referral_code: string | null
  archived_at: string | null
}

export type DirectoryEntry = {
  /** Portal customer id; blank for someone only on the Sheet. */
  id: string
  name: string
  firstName: string
  lastName: string
  email: string
  phone: string
  address: string
  referralCode: string
}

export type SheetRow = Record<string, string>

const norm = (s: string | null | undefined) => (s || '').trim().replace(/\s+/g, ' ').toLowerCase()

export function buildCustomerDirectory(
  customers: PortalCustomer[],
  emailOf: Map<string, string>,
  sheetRows: SheetRow[],
): DirectoryEntry[] {
  const map = new Map<string, DirectoryEntry>()
  const retiredPairs = new Set<string>()
  const retiredNames = new Set<string>()
  const liveNames = new Set<string>()

  for (const c of customers) {
    const email = emailOf.get(c.id) || ''
    const name = `${c.first_name || ''} ${c.last_name || ''}`.trim()
    if (c.archived_at) {
      if (name) retiredNames.add(norm(name))
      if (email && name) retiredPairs.add(`${norm(email)}|${norm(name)}`)
      continue
    }
    if (name) liveNames.add(norm(name))
    const key = (email || name).toLowerCase()
    if (!key) continue
    map.set(key, {
      id: c.id,
      name: name || email,
      firstName: c.first_name || '',
      lastName: c.last_name || '',
      email,
      phone: c.phone || '',
      address: '',
      referralCode: c.referral_code || '',
    })
  }

  for (const row of sheetRows) {
    const email = (row.customerEmail || '').trim().toLowerCase()
    const name = (row.customerName || '').trim()
    const phone = (row.customerPhone || '').trim()
    const address = (row.customerAddress || '').trim()
    const key = (email || name).toLowerCase()
    if (!key) continue

    const existing = map.get(key)
    if (existing) {
      if (!existing.address && address) existing.address = address
      if (!existing.phone && phone) existing.phone = phone
      if (!existing.name && name) existing.name = name
      continue
    }

    if (email && retiredPairs.has(`${email}|${norm(name)}`)) continue
    if (!email && retiredNames.has(norm(name)) && !liveNames.has(norm(name))) continue

    const parts = name.split(/\s+/)
    map.set(key, {
      id: '',
      name: name || email,
      firstName: parts[0] || '',
      lastName: parts.slice(1).join(' ') || '',
      email,
      phone,
      address,
      referralCode: '',
    })
  }

  return Array.from(map.values())
    .filter((c) => c.name || c.email)
    .sort((a, b) => a.name.localeCompare(b.name))
}
