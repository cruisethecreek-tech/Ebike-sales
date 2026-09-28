'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SheetInvoice } from '@/lib/sheet-invoices'

/**
 * Import one Sheet invoice into the portal, quietly.
 *
 * Quiet matters: the account is created with admin.createUser rather than an
 * invite, so back-filling historical invoices does not email a customer about
 * a bike they bought two months ago.
 */
export function ImportMissing({ invoice }: { invoice: SheetInvoice }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle')
  const [message, setMessage] = useState('')
  const router = useRouter()

  async function run() {
    setState('busy')
    setMessage('')
    try {
      const res = await fetch('/api/invoices/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        }),
      })

      const json = await res.json().catch(() => ({}))
      // The endpoint answers 200 with ok:false when it skips, so the status
      // code alone is not the answer.
      if (!res.ok || json.ok === false) {
        setState('failed')
        setMessage(json.message || `Import failed (HTTP ${res.status})`)
        return
      }
      setState('done')
      router.refresh()
    } catch (err: any) {
      setState('failed')
      setMessage(err?.message || 'Import failed')
    }
  }

  if (state === 'done') {
    return <span className="text-[11px] font-bold text-[#2D4A32]">✓ Imported</span>
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        onClick={run}
        disabled={state === 'busy'}
        className="px-2.5 py-1 rounded bg-[#2D4A32] text-white text-[11px] font-bold hover:bg-[#1A2E1C] disabled:opacity-60"
      >
        {state === 'busy' ? 'Importing…' : 'Import'}
      </button>
      {state === 'failed' && (
        <span className="text-[10px] text-[#9B2C2C] max-w-[220px] text-right">{message}</span>
      )}
    </span>
  )
}
