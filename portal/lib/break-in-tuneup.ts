/**
 * The free 30-day break-in tune-up, and how long is left to claim it.
 *
 * A new e-bike settles in its first few weeks: spokes seat, cables stretch,
 * disc brakes bed in. The shop gives that first tune-up free — but only a
 * customer who knows about it books it, and nothing told them.
 *
 * The window runs from the purchase date, not from delivery, because the
 * purchase date is the only one the shop records. A bike that shipped can take
 * a week or more to arrive, so the window is 40 days rather than 30: the extra
 * ten are the shipping the customer should not lose.
 *
 * When it runs out the offer disappears without a word. A countdown that turns
 * into "EXPIRED" is not information, it is a reproach for something the
 * customer may never have been told about in the first place.
 */
export const BREAK_IN_WINDOW_DAYS = 40

export interface BreakInOffer {
  /** Whole days left to book. Always 1 or more; the offer is gone at zero. */
  daysLeft: number
  /** The last day it can be claimed. */
  deadline: Date
  /** The bike it belongs to — the most recently bought one. */
  brand: string
  model: string
  purchaseDate: string
  /** True on the final day, so the wording can stop saying "1 days". */
  lastDay: boolean
}

/** Whole days since midnight on a YYYY-MM-DD date, counted in calendar days. */
function daysSince(dateStr: string, now: Date): number | null {
  const m = String(dateStr || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null

  // Both sides are pinned to UTC midnight before subtracting. Comparing a
  // date-only value against a timestamp otherwise makes the count jump by one
  // depending on the hour the page happens to be opened.
  const then = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.floor((today - then) / 86_400_000)
}

/**
 * The offer for this customer, or null when there is nothing to show.
 *
 * Null covers every case that should be silent: no bikes, no purchase date on
 * record, and the window having run out.
 */
export function breakInOffer(
  bikes: { brand?: string | null; model?: string | null; purchase_date?: string | null }[],
  now: Date = new Date(),
): BreakInOffer | null {
  let best: { bike: (typeof bikes)[number]; elapsed: number } | null = null

  for (const bike of bikes || []) {
    const elapsed = daysSince(bike?.purchase_date || '', now)
    if (elapsed === null) continue

    // A purchase dated in the future is a typo or a pre-order; either way the
    // customer has not had the bike yet, so the window has not started.
    const settled = Math.max(0, elapsed)
    if (best === null || settled < best.elapsed) best = { bike, elapsed: settled }
  }

  if (!best) return null

  const daysLeft = BREAK_IN_WINDOW_DAYS - best.elapsed
  if (daysLeft <= 0) return null

  const deadline = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysLeft)

  return {
    daysLeft,
    deadline,
    brand: String(best.bike.brand || '').trim(),
    model: String(best.bike.model || '').trim(),
    purchaseDate: String(best.bike.purchase_date || ''),
    lastDay: daysLeft === 1,
  }
}
