'use client'

import { useActionState } from 'react'
import { updateInvoiceStatus, resyncStatusToSheet, type StatusResult } from './actions'

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
  // Its own state, so a re-sync result never overwrites a status-change
  // result or vice versa — during an audit it matters which one spoke.
  const [resync, resubmit, resyncing] = useActionState<StatusResult | null, FormData>(
    resyncStatusToSheet,
    null
  )
  const busy = pending || resyncing

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {Object.keys(LABELS).map((status) => (
          <form key={status} action={submit}>
            <input type="hidden" name="invoice_id" value={invoiceId} />
            <input type="hidden" name="status" value={status} />
            <button
              type="submit"
              disabled={current === status || busy}
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

      {/* The current status is disabled above, so without this an invoice the
          portal calls paid while the Sheet calls it pending could only be
          fixed by toggling away and back — briefly writing a wrong status to
          the thing that bills. */}
      <form action={resubmit} className="mt-3">
        <input type="hidden" name="invoice_id" value={invoiceId} />
        <button
          type="submit"
          disabled={busy}
          title={`Send the status the portal already holds ("${current}") to the Google Sheet, without changing anything here`}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#C9A96E] text-[#2D4A32] hover:bg-[#F5F0E8] disabled:opacity-40"
        >
          {resyncing ? 'Pushing to Sheet…' : '↻ Re-sync to Sheet'}
        </button>
      </form>

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

      {resync && !resyncing && (
        <p
          role="alert"
          className={
            'mt-2 text-xs font-semibold ' + (resync.ok ? 'text-[#2D4A32]' : 'text-[#B3261E]')
          }
        >
          {resync.ok ? '✅ ' : '❌ '}
          {resync.message}
        </p>
      )}

      <p className="mt-3 text-[11px] text-[#8A8A8A]">
        Both buttons write the Google Sheet. No email is sent to the customer.
      </p>
    </div>
  )
}
