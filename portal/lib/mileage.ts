import type { BikeMileage } from '@/lib/types'

/** Creek Ready tune-up interval by GPS miles ridden, alongside the annual date. */
export const SERVICE_INTERVAL_MILES = 500

const METERS_PER_MILE = 1609.344

export type MileageStatus = {
  miles: number
  milesSinceService: number
  milesToNext: number
  /** 0–100, how much of the current interval has been ridden. */
  percent: number
  due: boolean
  lastServicedOn: string | null
}

/** Miles ridden and the next tune-up by mileage. Null when the bike has no GPS mileage yet. */
export function mileageStatus(row: BikeMileage | null | undefined): MileageStatus | null {
  if (!row) return null
  const miles = row.distance_m / METERS_PER_MILE
  const milesSinceService = Math.max(0, (row.distance_m - row.service_distance_m) / METERS_PER_MILE)
  return {
    miles,
    milesSinceService,
    milesToNext: Math.max(0, SERVICE_INTERVAL_MILES - milesSinceService),
    percent: Math.min(100, (milesSinceService / SERVICE_INTERVAL_MILES) * 100),
    due: milesSinceService >= SERVICE_INTERVAL_MILES,
    lastServicedOn: row.last_serviced_on,
  }
}
