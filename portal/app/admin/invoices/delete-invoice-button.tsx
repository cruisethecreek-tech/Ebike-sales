'use client'

import { useState } from 'react'
import { adminDeleteInvoice } from './actions'

/**
 * Delete control for an invoice row.
 *
 * Deliberately two clicks. Deleting an invoice is not undoable from the UI,
 * the rows sit next to a "Status" button that is, and a stray click on a
 * touch screen shouldn't remove a customer's billing record.
 */
export function DeleteInvoiceButton({
  invoiceId,
  invoiceNumber,
}: {
  invoiceId: string
  invoiceNumber: string
}) {
  const [armed, setArmed] = useState(false)

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        title={`Remove ${invoiceNumber} from the portal`}
        className="px-2 py-1 rounded border border-[#B3261E] text-[#B3261E] text-xs font-semibold hover:bg-[#FDECEA]"
      >
        Delete
      </button>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <form action={adminDeleteInvoice} className="inline">
        <input type="hidden" name="invoice_id" value={invoiceId} />
        <button
          type="submit"
          className="px-2 py-1 rounded bg-[#B3261E] text-white text-xs font-bold hover:bg-[#8C1D18]"
        >
          Confirm delete
        </button>
      </form>
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="px-2 py-1 rounded border border-[#C9A96E] text-[#2D4A32] text-xs font-semibold hover:bg-white"
      >
        Cancel
      </button>
    </span>
  )
}
