/**
 * Whether this invoice has its Shop.com order / warranty tracking link.
 *
 * Three states, not two. The link lives in the Google Sheet and only reaches
 * the portal on sync, so an invoice that has not synced since this column
 * existed genuinely might have one already. Showing those as "missing" would
 * send staff to redo warranty paperwork that is already done — the opposite
 * of what this badge is for. Unknown says unknown.
 */
export type ShopLinkState = 'present' | 'none' | 'unknown'

export function shopLinkState(supplierUrl: string | null | undefined): ShopLinkState {
  if (supplierUrl === null || supplierUrl === undefined) return 'unknown'
  return String(supplierUrl).trim() ? 'present' : 'none'
}

export function ShopLinkBadge({ supplierUrl }: { supplierUrl?: string | null }) {
  const state = shopLinkState(supplierUrl)

  if (state === 'present') {
    const href = String(supplierUrl).trim()
    // A real link, so the badge both answers the question and saves a trip
    // through the generator to open the order.
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={`Shop invoice on file — open ${href}`}
        aria-label="Shop invoice on file. Opens the order in a new tab."
        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#E7F0E8] text-[#2D4A32] hover:bg-[#2D4A32] hover:text-white transition-colors"
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
             strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
          <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
        </svg>
      </a>
    )
  }

  if (state === 'none') {
    return (
      <span
        title="No shop invoice on file — add one in the generator"
        aria-label="No shop invoice on file"
        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#FDECEA] text-[#B3261E]"
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
             strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
          <path d="M12 6v8M12 17.5v.5" />
        </svg>
      </span>
    )
  }

  return (
    <span
      title="Not known — this invoice has not synced since the portal started tracking shop invoices. Open it in the generator to find out."
      aria-label="Shop invoice status unknown"
      className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#F0F0F0] text-[#8A8A8A] text-[11px] font-bold"
    >
      ?
    </span>
  )
}
