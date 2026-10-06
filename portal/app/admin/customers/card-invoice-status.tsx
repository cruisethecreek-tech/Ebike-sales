'use client'

import { useActionState, useState } from 'react'
import { updateInvoiceStatus, type StatusResult } from '../invoices/actions'

const OPTIONS: Record<string, string> = {
  pending: '⏳ Pending',
  paid: '✅ Paid',
  overdue: '⚠️ Overdue',
  cancelled: '❌ Cancelled',
}

/**
 * Change an invoice's status from the customer card, without going to the
 * Invoices tab. Same action as the invoice page's buttons: writes the portal
 * and the Google Sheet, and on Paid tells a referrer their friend has bought.
 *
 * Saving the status it already has is allowed on purpose: on Paid that retries
 * a referral email that failed the first time.
 */
export function CardInvoiceStatus({ invoiceId, current }: { invoiceId: string; current: string }) {
  const [choice, setChoice] = useState(current)
  const [result, submit, pending] = useActionState<StatusResult | null, FormData>(updateInvoiceStatus, null)

  return (
    <form action={submit} className="flex flex-wrap items-center gap-1.5 w-full">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <select
        name="status"
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        disabled={pending}
        aria-label="Invoice status"
        className="border border-[#C9A96E] rounded-lg px-2 py-1.5 bg-white text-xs font-semibold text-[#2D4A32]"
      >
        {Object.entries(OPTIONS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="px-3 py-1.5 rounded-lg bg-[#2D4A32] text-white text-xs font-bold hover:bg-[#1A2E1C] disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Save status'}
      </button>
      {result && !pending && (
        <span
          role="alert"
          className={`basis-full text-[11px] font-semibold ${result.ok ? 'text-[#2D4A32]' : 'text-[#B3261E]'}`}
        >
          {result.ok ? '✅ ' : '❌ '}
          {result.message}
        </span>
      )}
    </form>
  )
}
