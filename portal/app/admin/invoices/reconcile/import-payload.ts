import type { SheetInvoice } from '@/lib/sheet-invoices'
import { importSheetInvoice } from './actions'

export type ImportResult =
  | { ok: true; bikeErrors?: string[] }
  | { ok: false; error: string }

/**
 * The body /api/invoices/sync expects for a back-fill.
 *
 * Shared by the single-row Import button and Import all, so the two cannot
 * drift into importing the same invoice differently — a bulk import that
 * quietly dropped the discount or the payment method would be exactly the kind
 * of silent disagreement this page exists to find.
 *
 * quiet: true is not optional here. Back-filling an invoice from August must
 * not email the customer a "set your password" link about a bike they bought
 * two months ago.
 */
export function importPayload(invoice: SheetInvoice) {
  return {
    quiet: true,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    customerName: invoice.customerName,
    customerEmail: invoice.customerEmail,
    customerPhone: invoice.customerPhone,
    items: invoice.lineItems.map((i) => ({
      description: i.description,
      qty: i.qty,
      price: i.price,
    })),
    subtotal: invoice.subtotal,
    discountAmt: invoice.discountAmt,
    discountPct: invoice.discountPct,
    tax: invoice.tax,
    processingFee: invoice.processingFee ?? 0,
    total: invoice.total,
    amountPaid: invoice.deposit,
    balanceDue: invoice.balanceDue,
    paymentMethod: invoice.depositMethod,
    paymentRef: invoice.depositRef,
    paymentMode: invoice.paymentMode,
    status: invoice.balanceDue <= 0 ? 'paid' : 'pending',
  }
}

/**
 * Import one invoice through the admin server action.
 *
 * Not a fetch to /api/invoices/sync: that route wants the shared admin key
 * that invoice.html keeps in localStorage, which no admin page has, so every
 * press of this button returned 401 — silently, because the failure text was
 * the generic "Unauthorized".
 */
export async function runImport(invoice: SheetInvoice): Promise<ImportResult> {
  try {
    return await importSheetInvoice(importPayload(invoice))
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Import failed' }
  }
}
