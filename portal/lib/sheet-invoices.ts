/**
 * sheet-invoices.ts
 *
 * Helper to fetch and parse full invoice records (with line items, addresses, etc.)
 * from the Cruise the Creek Invoices Google Sheet.
 */

export interface InvoiceLineItem {
  description: string
  qty: number
  price: number
  amount: number
}

export interface SheetInvoice {
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  customerName: string
  customerEmail: string
  customerPhone: string
  customerAddress: string
  lineItems: InvoiceLineItem[]
  subtotal: number
  discountPct: number
  discountAmt: number
  tax: number
  total: number
  deposit: number
  balanceDue: number
  paymentMode: string
  depositMethod: string
  depositRef: string
  paymentNotes: string
  paymentLink: string
  createdAt: string
  status: string
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

function parseCurrency(val: any): number {
  if (typeof val === 'number') return val
  if (!val) return 0
  const cleaned = String(val).replace(/[$,]/g, '').trim()
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

export async function fetchSheetInvoice(invoiceNumber: string): Promise<SheetInvoice | null> {
  if (!invoiceNumber) return null
  const normalizedTarget = invoiceNumber.trim().toUpperCase()

  try {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_TAB)}`
    const resp = await fetch(csvUrl, {
      next: { revalidate: 30 }, // Cache for 30s in Next.js
    })

    if (!resp.ok) {
      console.warn('Google Sheet invoice fetch failed:', resp.status, resp.statusText)
      return null
    }

    const csvText = await resp.text()
    const rows = parseCSV(csvText)

    const row = rows.find(
      (r) => String(r.invoiceNumber || '').trim().toUpperCase() === normalizedTarget
    )

    if (!row) return null

    // Parse line items
    let lineItems: InvoiceLineItem[] = []
    if (row.lineItems) {
      try {
        const raw = JSON.parse(row.lineItems)
        if (Array.isArray(raw)) {
          lineItems = raw.map((it: any) => {
            const qty = parseFloat(it.qty || it.quantity || 1) || 1
            const price = parseCurrency(it.price || it.unitPrice || 0)
            const amount = it.amount ? parseCurrency(it.amount) : qty * price
            return {
              description: it.description || it.name || it.item || 'Item',
              qty,
              price,
              amount,
            }
          })
        }
      } catch (err) {
        console.warn('Failed to parse line items JSON:', err)
      }
    }

    const subtotal = parseCurrency(row.subtotal)
    const discountPct = parseFloat(row.discountPct) || 0
    const discountAmt = parseCurrency(row.discountAmt)
    const tax = parseCurrency(row.tax)
    const total = parseCurrency(row.total)
    const deposit = parseCurrency(row.deposit)
    const balanceDue = parseCurrency(row.balanceDue)

    // Fallback if lineItems is empty but total exists
    if (lineItems.length === 0 && total > 0) {
      lineItems = [
        {
          description: 'Sales Order & Services',
          qty: 1,
          price: subtotal || total,
          amount: subtotal || total,
        },
      ]
    }

    return {
      invoiceNumber: row.invoiceNumber || invoiceNumber,
      invoiceDate: row.invoiceDate || '',
      dueDate: row.dueDate || '',
      customerName: row.customerName || '',
      customerEmail: row.customerEmail || '',
      customerPhone: row.customerPhone || '',
      customerAddress: row.customerAddress || '',
      lineItems,
      subtotal: subtotal || (total > tax ? total - tax : total),
      discountPct,
      discountAmt,
      tax,
      total,
      deposit,
      balanceDue,
      paymentMode: row.paymentMode || 'full',
      depositMethod: row.depositMethod || '',
      depositRef: row.depositRef || '',
      paymentNotes: row.paymentNotes || '',
      paymentLink: row.paymentLink || '',
      createdAt: row.createdAt || '',
      status: String(row.status || '').toLowerCase().trim(),
    }
  } catch (err) {
    console.error('Error in fetchSheetInvoice:', err)
    return null
  }
}
