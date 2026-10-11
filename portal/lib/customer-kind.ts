/**
 * What kind of customer someone is, from what the shop has sold them.
 *
 *   bike     a bike is on their account
 *   service  no bike on file, but the shop has worked on theirs
 *            (repair, tune-up, brake bleed, build, install, delivery…)
 *   gear     no bike and no service: helmets, bags, mirrors, gift cards
 *   none     nothing invoiced yet
 *
 * Invoice lines are free text typed into the generator, so service work is
 * recognised by its wording. Anything that is not service counts as gear.
 */
export type CustomerKind = 'bike' | 'service' | 'gear' | 'none'

const SERVICE_WORDS =
  /\b(repair|tune[\s-]?ups?|bleed|install(ation)?|build|assembl(y|e)|replace(ment)?s?|service|labou?r|adjust(ment)?|diagnos(tic|is)|overhaul|fix|flat|true|truing|inspection|deliver(y)?|pick[\s-]?up|tune)\b/i

export function isServiceLine(description: string | null | undefined): boolean {
  return SERVICE_WORDS.test(String(description || ''))
}

type InvoiceLike = { items?: unknown }

function lineDescriptions(invoices: InvoiceLike[]): string[] {
  const out: string[] = []
  for (const inv of invoices || []) {
    let items = inv?.items
    if (typeof items === 'string') {
      try { items = JSON.parse(items) } catch { items = [] }
    }
    if (!Array.isArray(items)) continue
    for (const it of items) {
      const d = String((it as { description?: unknown })?.description || '').trim()
      if (d) out.push(d)
    }
  }
  return out
}

export function customerKind(bikeCount: number, invoices: InvoiceLike[]): CustomerKind {
  if (bikeCount > 0) return 'bike'
  const lines = lineDescriptions(invoices)
  if (lines.length === 0) return 'none'
  // Service wins over gear: someone who bought a mirror with a tune-up owns a bike.
  return lines.some(isServiceLine) ? 'service' : 'gear'
}

/** The service lines, newest invoice first, for a "your bike care" list. */
export function serviceHistory(
  invoices: (InvoiceLike & { issued_at?: string | null; invoice_number?: string | null })[],
): { description: string; date: string | null; invoice: string | null }[] {
  const out: { description: string; date: string | null; invoice: string | null }[] = []
  for (const inv of invoices || []) {
    for (const d of lineDescriptions([inv])) {
      if (isServiceLine(d)) out.push({ description: d, date: inv.issued_at ?? null, invoice: inv.invoice_number ?? null })
    }
  }
  return out
}

export const CUSTOMER_KIND_LABEL: Record<CustomerKind, string> = {
  bike: '🚲 Bike owner',
  service: '🔧 Service',
  gear: '🛍️ Gear',
  none: 'No purchases',
}
