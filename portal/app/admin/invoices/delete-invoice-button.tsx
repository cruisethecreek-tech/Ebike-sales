'use client'

import { useState, useActionState } from 'react'
import { adminDeleteInvoice, type DeleteInvoiceResult } from './actions'

/**
 * Delete control for an invoice row.
 *
 * Deliberately two clicks. Deleting an invoice is not undoable from the UI,
 * the rows sit next to a "Status" button that is, and a stray click on a
 * touch screen shouldn't remove a customer's billing record.
 *
 * The confirm step reports its outcome. It used to post to an action that
 * returned void, so a delete the database quietly refused looked exactly like
 * one that worked: the button vanished, the page revalidated, and the row was
 * still there. That is what "the confirm delete button doesn't work" looked
 * like from the outside — not a dead button, an invisible refusal.
 */
export function DeleteInvoiceButton({
  invoiceId,
  invoiceNumber,
}: {
  invoiceId: string
  invoiceNumber: string
}) {
  const [armed, setArmed] = useState(false)
  const [result, submit, pending] = useActionState<DeleteInvoiceResult | null, FormData>(
    adminDeleteInvoice,
    null
  )

  if (!armed) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setArmed(true)}
          title={`Remove ${invoiceNumber} from the portal`}
          className="px-2 py-1 rounded border border-[#B3261E] text-[#B3261E] text-xs font-semibold hover:bg-[#FDECEA]"
        >
          Delete
        </button>
        {/* A failure has to outlive the armed state, or disarming the button
            would hide the only evidence that nothing happened. */}
        {result && !result.ok && (
          <span role="alert" className="text-[11px] font-semibold text-[#B3261E]">
            {result.message}
          </span>
        )}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <form action={submit} className="inline">
        <input type="hidden" name="invoice_id" value={invoiceId} />
        <button
          type="submit"
          disabled={pending}
          className="px-2 py-1 rounded bg-[#B3261E] text-white text-xs font-bold hover:bg-[#8C1D18] disabled:opacity-60"
        >
          {pending ? 'Deleting…' : 'Confirm delete'}
        </button>
      </form>
      <button
        type="button"
        onClick={() => setArmed(false)}
        disabled={pending}
        className="px-2 py-1 rounded border border-[#C9A96E] text-[#2D4A32] text-xs font-semibold hover:bg-white disabled:opacity-60"
      >
        Cancel
      </button>
      {result && !result.ok && (
        <span role="alert" className="text-[11px] font-semibold text-[#B3261E]">
          {result.message}
        </span>
      )}
    </span>
  )
}
