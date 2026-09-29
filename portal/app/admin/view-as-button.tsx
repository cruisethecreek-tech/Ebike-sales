'use client'

import { startViewingAs } from '@/app/dashboard/view-as-actions'

/**
 * Open the customer's own portal, as they see it.
 *
 * A preview, not a login: it changes which customer the dashboard reads from
 * and nothing else, and a gold banner sits on every page until it is stopped.
 */
export function ViewAsButton({
  customerId,
  firstName,
  className,
}: {
  customerId: string
  firstName?: string
  className?: string
}) {
  return (
    <form action={startViewingAs.bind(null, customerId)} className="contents">
      <button
        type="submit"
        title="Open the portal as this customer sees it"
        className={
          className ||
          'p-2.5 rounded-lg bg-white border border-[#2D4A32] text-[#2D4A32] font-bold flex items-center justify-center gap-1.5 hover:bg-[#FAF8F2] text-center'
        }
      >
        👁 View as {firstName || 'customer'}
      </button>
    </form>
  )
}
