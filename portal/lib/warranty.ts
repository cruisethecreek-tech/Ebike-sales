export interface WarrantyStatus {
  manufacturerWarrantyDaysLeft: number
  manufacturerWarrantyEndDate: Date
  manufacturerWarrantyPercent: number
  isManufacturerWarrantyActive: boolean
  creekReadyDaysLeft: number
  creekReadyDueDate: Date
  creekReadyPercent: number
  isCreekReadyActive: boolean
}

/**
 * Calculates exact warranty and Creek Ready service plan countdowns.
 * - Velotric: 2 years manufacturer warranty.
 * - Heybike / Mooncool / Jasion: 1 year manufacturer warranty.
 * - Creek Ready: 1-year annual service cycle.
 */
export function calculateBikeWarranties(
  brand: string,
  purchaseDateStr: string | null | undefined
): WarrantyStatus {
  const brandLower = (brand || '').toLowerCase()
  const purchaseDate = purchaseDateStr ? new Date(purchaseDateStr) : new Date('2026-05-15')
  const now = new Date()

  // 1. Manufacturer Warranty Duration
  const warrantyYears = brandLower.includes('velotric') ? 2 : 1
  const manufacturerWarrantyEndDate = new Date(purchaseDate)
  manufacturerWarrantyEndDate.setFullYear(manufacturerWarrantyEndDate.getFullYear() + warrantyYears)

  const totalWarrantyDays = warrantyYears * 365
  const msLeft = manufacturerWarrantyEndDate.getTime() - now.getTime()
  const manufacturerWarrantyDaysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)))
  const daysUsed = totalWarrantyDays - manufacturerWarrantyDaysLeft
  const manufacturerWarrantyPercent = Math.min(100, Math.max(0, (daysUsed / totalWarrantyDays) * 100))
  const isManufacturerWarrantyActive = manufacturerWarrantyDaysLeft > 0

  // 2. Creek Ready Annual Service Cycle (1 year from purchase or annual tune-up)
  const creekReadyDueDate = new Date(purchaseDate)
  creekReadyDueDate.setFullYear(creekReadyDueDate.getFullYear() + 1)

  const totalServiceDays = 365
  const serviceMsLeft = creekReadyDueDate.getTime() - now.getTime()
  const creekReadyDaysLeft = Math.max(0, Math.ceil(serviceMsLeft / (1000 * 60 * 60 * 24)))
  const serviceDaysUsed = totalServiceDays - creekReadyDaysLeft
  const creekReadyPercent = Math.min(100, Math.max(0, (serviceDaysUsed / totalServiceDays) * 100))
  const isCreekReadyActive = creekReadyDaysLeft > 0

  return {
    manufacturerWarrantyDaysLeft,
    manufacturerWarrantyEndDate,
    manufacturerWarrantyPercent,
    isManufacturerWarrantyActive,
    creekReadyDaysLeft,
    creekReadyDueDate,
    creekReadyPercent,
    isCreekReadyActive,
  }
}
