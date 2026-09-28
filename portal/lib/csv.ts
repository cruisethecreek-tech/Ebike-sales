/**
 * Reading a CSV that came out of somebody else's system.
 *
 * Splitting on commas is wrong the moment an address shows up — "329 kennon
 * st, Bridgeport, OH" is one field with two commas in it — and Wix exports
 * addresses, order notes and item lists, all of which are quoted and several
 * of which contain newlines. A parser that gets that wrong does not fail
 * loudly; it shifts every later column by one and imports a phone number as an
 * email address.
 */

/** Parse CSV text into rows of raw strings. Handles "quoted, fields", escaped "" quotes, and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  // Strip a UTF-8 BOM: Excel puts one at the front and it would otherwise
  // become part of the first header's name, so nothing matches it.
  const src = String(text || '').replace(/^﻿/, '')

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\r') {
      // Swallow; the \n that follows ends the row.
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }

  // A file that does not end in a newline still has a last row.
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  // Drop rows that are entirely empty — trailing blank lines are common.
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

/** Parse into objects keyed by the header row. */
export function parseCsvRows(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const table = parseCsv(text)
  if (table.length === 0) return { headers: [], rows: [] }

  const headers = table[0].map((h) => h.trim())
  const rows = table.slice(1).map((cells) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => {
      obj[h] = (cells[i] ?? '').trim()
    })
    return obj
  })
  return { headers, rows }
}

/**
 * Guess which column is which.
 *
 * A guess, offered as a starting point for the dropdowns — never applied
 * silently. Wix has called the same column "Email", "Email Address" and
 * "Contact Email" across its different exports, and the shop should not have
 * to know which one they got.
 */
const HINTS: Record<string, string[]> = {
  email: ['email', 'e-mail', 'email address', 'contact email', 'buyer email', 'customer email'],
  firstName: ['first name', 'firstname', 'given name', 'first'],
  lastName: ['last name', 'lastname', 'surname', 'family name', 'last'],
  fullName: ['name', 'full name', 'customer', 'customer name', 'contact name', 'buyer name', 'recipient'],
  phone: ['phone', 'phone number', 'mobile', 'telephone', 'contact phone', 'buyer phone'],
  bike: ['item', 'product', 'product name', 'item name', 'bike', 'model', 'line items', 'items'],
  purchaseDate: ['date', 'order date', 'purchase date', 'created', 'date created', 'placed on'],
  orderNumber: ['order', 'order number', 'order id', 'order #', 'number', 'invoice', 'invoice number'],
  total: ['total', 'order total', 'amount', 'grand total', 'total price', 'paid'],
}

export function guessMapping(headers: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  const used = new Set<string>()

  // Two passes over every field, not one pass per field, because a loose match
  // on an early field would eat a column a later field matches exactly. In a
  // Wix Stores export "Item Name" contains "name", so the customer's-name
  // field claimed the product column and the bike was never seen — the import
  // then filed everyone under the name of the bike they bought.
  for (const exact of [true, false]) {
    for (const [field, hints] of Object.entries(HINTS)) {
      if (out[field]) continue
      const hit = headers.find((h) => {
        if (used.has(h)) return false
        const l = h.trim().toLowerCase()
        return exact ? hints.includes(l) : hints.some((x) => l.includes(x))
      })
      if (hit) {
        out[field] = hit
        used.add(hit)
      }
    }
  }
  return out
}
