'use client'

import { useActionState } from 'react'
import { updateInvoiceStatus, type StatusResult } from './actions'

const LABELS: Record<string, string> = {
  pending: '⏳ Pending',
  paid: '✅ Paid',
  overdue: '⚠️ Overdue',
  cancelled: '❌ Cancelled',
}

/**
 * Status controls that report whether the change actually took.
 *
 * Marking an invoice paid here used to update Supabase only, while the Google
 * Sheet — the thing the shop bills from — still showed a balance owing. The
 * badge changed; nothing real did. Now the action writes both, and a Sheet
 * failure is shown as a failure rather than a green tick, because a portal
 * that disagrees with the Sheet is worse than one that admits it.
 */
export function StatusButtons({
  invoiceId,
  current,
}: {
  invoiceId: string
  current: string
}) {
  const [result, submit, pending] = useActionState<StatusResult | null, FormData>(
    updateInvoiceStatus,
    null
  )

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {Object.keys(LABELS).map((status) => (
          <form key={status} action={submit}>
            <input type="hidden" name="invoice_id" value={invoiceId} />
            <input type="hidden" name="status" value={status} />
            <button
              type="submit"
              disabled={current === status || pending}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
              style={{
                backgroundColor: current === status ? '#2D4A32' : '#F5F0E8',
                color: current === status ? '#fff' : '#2D4A32',
              }}
            >
              {LABELS[status]}
            </button>
          </form>
        ))}
      </div>

      {pending && (
        <p className="mt-3 text-xs text-[#4A4A4A]">Updating the portal and the Sheet…</p>
      )}

      {result && !pending && (
        <p
          role="alert"
          className={
            'mt-3 text-xs font-semibold ' + (result.ok ? 'text-[#2D4A32]' : 'text-[#B3261E]')
          }
        >
          {result.ok ? '✅ ' : '❌ '}
          {result.message}
        </p>
      )}

      <p className="mt-3 text-[11px] text-[#8A8A8A]">
        Writes the Google Sheet too. No email is sent to the customer.
      </p>
    </div>
  )
}
