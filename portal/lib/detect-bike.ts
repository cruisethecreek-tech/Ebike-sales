/**
 * Deciding whether a line item on an invoice is a bike.
 *
 * Six customers who had bought a bike showed an empty garage in the portal,
 * and their invoices had all synced with no error whatsoever. Two separate
 * things were wrong, both of them silent.
 *
 * 1. The exclusion list looked for service words anywhere in the description:
 *
 *        if (lower.includes('installation')) return null
 *
 *    The shop writes what is thrown in with the sale into the same line —
 *    "Velotric Discover M Regular Silver (Free Installation)" — so the bike
 *    was read as an installation job and dropped. CTR-026, CTR-032, CTR-033
 *    and CTR-034 all lost their bike this way.
 *
 * 2. A bike was matched against what was already on file by brand and model
 *    string. CTR-006 sells two "Velotric Discover M" on two lines and CTR-020
 *    sells two "Heybike Ranger 3.0 Pro"; one row each was recorded and the
 *    second was read as a duplicate of the first.
 *
 * The rule that resolves the first: a parenthetical saying what comes WITH the
 * item is not the item. "(Free Installation)" and "(free rack)" go; "(Blue
 * Haze)", "(Reg/HS/Green)" and "(pink)" stay, because a colour and a frame
 * size are part of which bike it is, and rows already on file carry them.
 */

/** Words that mean a line item is a service or an accessory, not a bike. */
export const NOT_A_BIKE = [
  'tune-up', 'tune up', 'service', 'installation', 'install', 'assembly',
  'delivery', 'build', 'repair', 'labor', 'labour', 'diagnostic',
  'lock', 'helmet', 'mirror', 'basket', 'bag', 'battery', 'charger',
  'throttle', 'tire', 'tube', 'pedal', 'rack', 'shipping', 'freight',
]

/** Words that mark a parenthetical as a note about the deal, not the bike. */
const DEAL_NOTE = ['free', 'incl', 'included', 'including', 'complimentary', 'gratis']

function isDealNote(inner: string): boolean {
  const s = inner.toLowerCase()
  return DEAL_NOTE.some((w) => s.includes(w)) || NOT_A_BIKE.some((w) => s.includes(w))
}

/**
 * The line with notes about what is included stripped off, and everything that
 * describes the bike itself kept.
 */
export function lineSubject(desc: string): string {
  let s = String(desc || '')

  // Drop only the parentheticals that are about the deal. "(Blue Haze)" is
  // part of the bike's name and stays.
  s = s.replace(/[([{]([^)\]}]*)[)\]}]/g, (whole, inner) => (isDealNote(inner) ? ' ' : whole))

  // "Mooncool TK2 - free installation", "… , includes assembly"
  s = s.replace(/\s*[-–—,/|+&]+\s*(free|incl\.?|including|includes|with|w\/)\s+\S.*$/i, ' ')
  // "… with free delivery" — no punctuation in front of it.
  s = s.replace(/\s*\b(with|w\/)\s+free\b.*$/i, ' ')

  return s.replace(/\s+/g, ' ').trim()
}

/**
 * One spelling for comparing a bike against what is already on file.
 *
 * Rows registered before this existed have the note baked into the model —
 * "Venus Pink (free install)", "Summit 2 large/ocean blue (free rack)". They
 * are the same bikes as the clean names the sync now produces, and matching on
 * the raw string would file every one of them a second time.
 */
export function bikeModelKey(model: string): string {
  return String(model || '')
    .replace(/[([{][^)\]}]*[)\]}]/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

export function detectBike(itemDesc: string): { brand: string; model: string } | null {
  const d = String(itemDesc || '').trim()

  // Fall back to the whole description when stripping leaves nothing: a line
  // that reads only "(Free Installation)" really is just the service.
  const subject = lineSubject(d) || d
  const lower = subject.toLowerCase()

  if (NOT_A_BIKE.some((w) => lower.includes(w))) return null

  // These must be values of the bike_brand enum and nothing else. The previous
  // list returned 'Aventon', 'Lectric' and 'Custom / Other', none of which
  // exist in that type, so any bike matching them failed to insert instead of
  // being recorded — which is why `other` appears on none of the 34 bikes on
  // file. Mokwheel, the largest range in the shop, was missing entirely.
  let brand = 'other'
  if (lower.includes('heybike')) brand = 'Heybike'
  else if (lower.includes('velotric')) brand = 'Velotric'
  else if (lower.includes('jasion')) brand = 'Jasion'
  else if (lower.includes('mooncool')) brand = 'Mooncool'
  else if (lower.includes('mokwheel')) brand = 'Mokwheel'

  const isBikeOrTrike =
    brand !== 'other' ||
    lower.includes('trike') ||
    lower.includes('bike') ||
    lower.includes('cruiser') ||
    lower.includes('step-thru')

  if (!isBikeOrTrike) return null

  let model = subject
  if (brand !== 'other') {
    model = subject.replace(new RegExp(brand, 'i'), '').trim()
  }
  if (!model) model = subject

  // 'other' verbatim — it is the enum value. The maker's name stays in the
  // model, so an Aventon trade-in reads "other / Aventon Level 2" rather than
  // being lost to a failed insert.
  return {
    brand,
    model: model.replace(/^[-–—:\s]+/, '').trim(),
  }
}

/** Every bike an invoice's line items sell, with how many of each. */
export function bikesOnInvoice(
  items: any[],
): { brand: string; model: string; count: number }[] {
  const wanted = new Map<string, { brand: string; model: string; count: number }>()
  for (const it of items || []) {
    const bike = detectBike(it?.description || '')
    if (!bike) continue
    const key = `${bike.brand.toLowerCase()}|${bikeModelKey(bike.model)}`
    const qty = Math.max(1, Math.floor(Number(it?.qty) || 1))
    const seen = wanted.get(key)
    if (seen) seen.count += qty
    else wanted.set(key, { ...bike, count: qty })
  }
  return [...wanted.values()]
}
