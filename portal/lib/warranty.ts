/**
 * Manufacturer warranty terms per brand, and the countdowns the portal shows.
 *
 * Terms are transcribed from each brand's published warranty policy as sent
 * by Cruise on 2026-09-29. Each brand's policy is written for bikes bought
 * from that brand's own website; bikes sold through Cruise the Creek are shown
 * the same terms. The clock starts at purchase_date. Most brands start it on
 * delivery, which for a shop sale is the same day.
 */

export interface CoverageItem {
  /** What the line covers, e.g. "Frame" or "Battery". */
  label: string
  /** Length in days, or null for lifetime. */
  days: number | null
  /** Short human form, e.g. "2 years", "Lifetime", "7 days". */
  term: string
  endDate: Date | null
  daysLeft: number | null
  isActive: boolean
}

export interface BrandWarranty {
  /** The headline term the progress bar counts down. */
  headlineLabel: string
  headlineDays: number
  coverage: { label: string; days: number | null; term: string }[]
  /** One-line caveat shown under the coverage list. */
  note: string
}

const YEAR = 365

// Brand keys are lowercase, matched against bikes.brand (public.bike_brand).
export const BRAND_WARRANTIES: Record<string, BrandWarranty> = {
  heybike: {
    headlineLabel: 'Battery & bike',
    headlineDays: 2 * YEAR,
    coverage: [
      { label: 'Battery & bike (excluding wear items)', days: 2 * YEAR, term: '2 years' },
      {
        label: 'Frame, fork, motor, controller, display, wiring & other listed parts',
        days: 7,
        term: '7 days',
      },
    ],
    note: 'Heybike lists frame, motor, controller, display and most components as covered for one week after delivery; later damage is charged. Transferable with proof of the original order.',
  },
  velotric: {
    headlineLabel: 'Electrical & battery',
    headlineDays: 2 * YEAR,
    coverage: [
      { label: 'Frame & rigid fork', days: 5 * YEAR, term: '5 years' },
      { label: 'Motor, controller, display, battery & wiring', days: 2 * YEAR, term: '2 years' },
      { label: 'Brakes, drivetrain, suspension & other parts', days: YEAR, term: '1 year' },
      { label: 'Accessories', days: YEAR, term: '1 year' },
    ],
    note: 'Original owner only; not transferable to a later owner.',
  },
  mokwheel: {
    headlineLabel: 'Whole bike',
    headlineDays: 2 * YEAR,
    coverage: [
      { label: 'Bike, battery & motor (excluding wear items)', days: 2 * YEAR, term: '2 years' },
      { label: 'Accessories', days: 30, term: '30 days' },
    ],
    note: 'Original owner only. Keep the receipt; Mokwheel needs proof of purchase.',
  },
  mooncool: {
    headlineLabel: 'Battery',
    headlineDays: 2 * YEAR,
    coverage: [
      { label: 'Frame', days: null, term: 'Lifetime' },
      { label: 'Battery', days: 2 * YEAR, term: '2 years' },
      { label: 'Motor, display, brakes, drivetrain & other parts', days: YEAR, term: '1 year' },
    ],
    note: 'Tires, tubes and brake and shifter cables are not covered.',
  },
  jasion: {
    headlineLabel: 'Whole bike',
    headlineDays: YEAR,
    coverage: [{ label: 'Frame, battery & parts (excluding wear items)', days: YEAR, term: '1 year' }],
    note: 'A later owner is covered only within the first year and with the original order number.',
  },
}

export interface WarrantyStatus {
  /** False when the bike has no purchase date, so no countdown can be shown. */
  hasPurchaseDate: boolean
  /** False for brands we have no terms for ("other"). */
  hasKnownTerms: boolean
  headlineLabel: string
  coverage: CoverageItem[]
  note: string | null
  manufacturerWarrantyDaysLeft: number
  manufacturerWarrantyEndDate: Date | null
  manufacturerWarrantyPercent: number
  isManufacturerWarrantyActive: boolean
  creekReadyDaysLeft: number
  creekReadyDueDate: Date | null
  creekReadyPercent: number
  isCreekReadyActive: boolean
}

const DAY_MS = 1000 * 60 * 60 * 24

/** Parses a Postgres date ("2026-05-15") as a local calendar date. */
function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

/** Adds a term in days; whole-year terms move the calendar year so leap days don't cut them short. */
function addDays(date: Date, days: number): Date {
  const out = new Date(date)
  if (days % YEAR === 0) out.setFullYear(out.getFullYear() + days / YEAR)
  else out.setDate(out.getDate() + days)
  return out
}

function daysUntil(end: Date, now: Date): number {
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY_MS))
}

/**
 * Warranty and Creek Ready countdowns for one bike.
 *
 * warrantyExpiresAt, when staff have set it on the bike, overrides the
 * headline end date (for an extended warranty or a replacement unit).
 */
export function calculateBikeWarranties(
  brand: string,
  purchaseDateStr: string | null | undefined,
  warrantyExpiresAt?: string | null,
  now: Date = new Date(),
): WarrantyStatus {
  const terms = BRAND_WARRANTIES[(brand || '').toLowerCase()] ?? null
  const purchaseDate = parseDate(purchaseDateStr)
  const override = parseDate(warrantyExpiresAt)

  const coverage: CoverageItem[] = (terms?.coverage ?? []).map((c) => {
    const endDate = purchaseDate && c.days != null ? addDays(purchaseDate, c.days) : null
    const daysLeft = endDate ? daysUntil(endDate, now) : null
    return {
      ...c,
      endDate,
      daysLeft,
      isActive: c.days == null ? purchaseDate != null : (daysLeft ?? 0) > 0,
    }
  })

  let manufacturerWarrantyEndDate: Date | null = null
  let totalDays = terms?.headlineDays ?? YEAR
  if (override) {
    manufacturerWarrantyEndDate = override
    if (purchaseDate) totalDays = Math.max(1, Math.round((override.getTime() - purchaseDate.getTime()) / DAY_MS))
  } else if (purchaseDate && terms) {
    manufacturerWarrantyEndDate = addDays(purchaseDate, terms.headlineDays)
  }

  const manufacturerWarrantyDaysLeft = manufacturerWarrantyEndDate ? daysUntil(manufacturerWarrantyEndDate, now) : 0
  const manufacturerWarrantyPercent = manufacturerWarrantyEndDate
    ? Math.min(100, Math.max(0, ((totalDays - manufacturerWarrantyDaysLeft) / totalDays) * 100))
    : 100

  // Creek Ready: annual service, due one year after purchase.
  const creekReadyDueDate = purchaseDate ? addDays(purchaseDate, YEAR) : null
  const creekReadyDaysLeft = creekReadyDueDate ? daysUntil(creekReadyDueDate, now) : 0
  const creekReadyPercent = creekReadyDueDate
    ? Math.min(100, Math.max(0, ((YEAR - creekReadyDaysLeft) / YEAR) * 100))
    : 100

  return {
    hasPurchaseDate: purchaseDate != null,
    hasKnownTerms: terms != null,
    headlineLabel: terms?.headlineLabel ?? 'Manufacturer warranty',
    coverage,
    note: terms?.note ?? null,
    manufacturerWarrantyDaysLeft,
    manufacturerWarrantyEndDate,
    manufacturerWarrantyPercent,
    isManufacturerWarrantyActive: manufacturerWarrantyDaysLeft > 0,
    creekReadyDaysLeft,
    creekReadyDueDate,
    creekReadyPercent,
    isCreekReadyActive: creekReadyDaysLeft > 0,
  }
}
