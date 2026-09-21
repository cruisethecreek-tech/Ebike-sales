/**
 * What was sold on an invoice, in one table cell.
 *
 * Invoices synced before the items column existed have none, so rather than
 * a blank cell we fall back to any bike registered against that invoice
 * number — that is the same line item, recovered from the record it created.
 * Only a handful of old invoices have one, so the rest say plainly that the
 * detail lives in the generator instead of leaving an empty space that reads
 * like a bug.
 */
export interface InvoiceItem {
  description?: string | null
  qty?: number | null
  price?: number | null
}

export function summarise(items: InvoiceItem[] | null | undefined) {
  const list = (Array.isArray(items) ? items : [])
    .filter((i) => i && String(i.description || '').trim())
  return { first: list[0] || null, rest: Math.max(0, list.length - 1), count: list.length }
}

export function InvoiceItems({
  items,
  fallbackBikes,
}: {
  items: InvoiceItem[] | null | undefined
  fallbackBikes?: Array<{ brand: string; model: string }>
}) {
  const { first, rest } = summarise(items)

  if (first) {
    const qty = Number(first.qty) || 1
    return (
      <div className="min-w-0">
        <div className="text-[#1A2E1C] font-medium truncate" title={String(first.description)}>
          {qty > 1 && <span className="text-[#4A4A4A] font-normal">{qty}× </span>}
          {first.description}
        </div>
        {rest > 0 && (
          <div className="text-[11px] text-[#4A4A4A]">
            +{rest} more item{rest === 1 ? '' : 's'}
          </div>
        )}
      </div>
    )
  }

  const bike = (fallbackBikes || [])[0]
  if (bike) {
    return (
      <div className="min-w-0">
        <div className="text-[#1A2E1C] font-medium truncate">
          {bike.brand} {bike.model}
        </div>
        {/* Say where this came from. It is inferred from the bike registered
            against this invoice number, not read off the invoice itself. */}
        <div className="text-[11px] text-[#4A4A4A]">from registered bike</div>
      </div>
    )
  }

  return (
    <span className="text-[11px] text-[#4A4A4A]" title="Synced before line items were stored — reopen and save it in the generator to fill this in">
      not recorded
    </span>
  )
}
