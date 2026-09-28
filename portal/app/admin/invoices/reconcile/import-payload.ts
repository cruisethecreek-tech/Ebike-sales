import type { SheetInvoice } from '@/lib/sheet-invoices'

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

/** Import one invoice. Resolves with what to tell the person. */
export async function runImport(
  invoice: SheetInvoice,
): Promise<{ ok: true; bikeErrors?: string[] } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/invoices/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(importPayload(invoice)),
    })
    const json = await res.json().catch(() => ({}))
    // The endpoint answers 200 with ok:false when it declines, so the status
    // code alone is not the answer. This is the check whose absence let five
    // skipped invoices report as successes.
    if (!res.ok || json.ok === false) {
      return { ok: false, error: json.error || json.message || `HTTP ${res.status}` }
    }
    return { ok: true, ...(json.bikeErrors?.length ? { bikeErrors: json.bikeErrors } : {}) }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Import failed' }
  }
}
