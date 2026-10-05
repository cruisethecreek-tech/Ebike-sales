// Route history maths for the portal map: distance, trips and speeds from a
// tracker's positions. Kept free of React and Leaflet so it can be tested.

export type TrackPoint = {
  fix_time: string
  latitude: number
  longitude: number
  speed_kmh: number | null
  valid: boolean | null
}

export type Trip = {
  points: TrackPoint[]
  start: string
  end: string
  miles: number
  topMph: number
  minutes: number
}

const KM_TO_MI = 0.621371
// Points further apart in time than this belong to different rides. Trackers
// report every few seconds while moving and only every few hours when parked.
const TRIP_GAP_MS = 10 * 60_000
// A hop that implies more than this speed is a bad fix, not a ride.
const MAX_PLAUSIBLE_KMH = 120
// Rides shorter than this are GPS drift while parked.
const MIN_TRIP_MILES = 0.1

export function distanceKm(a: TrackPoint, b: TrackPoint): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Drops invalid fixes and points that jump impossibly far from the last good one. */
export function cleanTrack(points: TrackPoint[]): TrackPoint[] {
  const sorted = points
    .filter((p) => p.valid !== false && Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
    .filter((p) => !(p.latitude === 0 && p.longitude === 0))
    .sort((a, b) => a.fix_time.localeCompare(b.fix_time))
  const out: TrackPoint[] = []
  for (const p of sorted) {
    const prev = out[out.length - 1]
    if (prev) {
      const hours = (Date.parse(p.fix_time) - Date.parse(prev.fix_time)) / 3_600_000
      const km = distanceKm(prev, p)
      if (hours > 0 && km / hours > MAX_PLAUSIBLE_KMH && km > 0.5) continue
    }
    out.push(p)
  }
  return out
}

function trackMiles(points: TrackPoint[]): number {
  let km = 0
  for (let i = 1; i < points.length; i++) km += distanceKm(points[i - 1], points[i])
  return km * KM_TO_MI
}

/** Splits a cleaned track into rides, oldest first. */
export function splitTrips(points: TrackPoint[]): Trip[] {
  const groups: TrackPoint[][] = []
  for (const p of points) {
    const group = groups[groups.length - 1]
    const last = group?.[group.length - 1]
    if (!last || Date.parse(p.fix_time) - Date.parse(last.fix_time) > TRIP_GAP_MS) groups.push([p])
    else group.push(p)
  }
  return groups
    .map((g) => ({
      points: g,
      start: g[0].fix_time,
      end: g[g.length - 1].fix_time,
      miles: trackMiles(g),
      topMph: Math.round(Math.max(0, ...g.map((p) => p.speed_kmh ?? 0)) * KM_TO_MI),
      minutes: Math.round((Date.parse(g[g.length - 1].fix_time) - Date.parse(g[0].fix_time)) / 60_000),
    }))
    .filter((t) => t.points.length >= 2 && t.miles >= MIN_TRIP_MILES)
}

export function summarize(trips: Trip[]) {
  return {
    miles: trips.reduce((s, t) => s + t.miles, 0),
    topMph: Math.max(0, ...trips.map((t) => t.topMph)),
    minutes: trips.reduce((s, t) => s + t.minutes, 0),
  }
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} hr ${m} min` : `${h} hr`
}
