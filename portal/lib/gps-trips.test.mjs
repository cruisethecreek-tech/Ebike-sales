import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanTrack, splitTrips, summarize, formatDuration } from './gps-trips.ts'

const T0 = Date.parse('2026-10-04T14:00:00Z')
const pt = (minutes, lat, lon, speed = 20, valid = true) => ({
  fix_time: new Date(T0 + minutes * 60_000).toISOString(),
  latitude: lat,
  longitude: lon,
  speed_kmh: speed,
  valid,
})
// About 0.69 mi per 0.01 degree of latitude.
const ride = (startMin, lat0, steps) =>
  Array.from({ length: steps + 1 }, (_, i) => pt(startMin + i, lat0 + i * 0.002, -80.65))

test('splits rides on a 10+ minute gap and measures each', () => {
  const trips = splitTrips(cleanTrack([...ride(0, 41.1, 10), ...ride(60, 41.2, 5)]))
  assert.equal(trips.length, 2)
  assert.ok(Math.abs(trips[0].miles - 1.38) < 0.05, `got ${trips[0].miles}`)
  assert.equal(trips[0].minutes, 10)
  assert.equal(trips[0].topMph, 12)
})

test('drops invalid fixes, 0,0 fixes and impossible jumps', () => {
  const pts = [...ride(0, 41.1, 4), pt(2.5, 45, -80.65), pt(3.5, 0, 0), pt(3.7, 41.5, -81, 20, false)]
  const clean = cleanTrack(pts)
  assert.equal(clean.length, 5)
  assert.ok(clean.every((p) => p.latitude < 42))
})

test('parked drift is not a ride', () => {
  const drift = [pt(0, 41.1, -80.65, 0), pt(1, 41.10005, -80.65, 0), pt(2, 41.1, -80.65005, 0)]
  assert.equal(splitTrips(cleanTrack(drift)).length, 0)
})

test('totals add up across rides', () => {
  const s = summarize(splitTrips(cleanTrack([...ride(0, 41.1, 10), ...ride(60, 41.2, 5)])))
  assert.equal(s.minutes, 15)
  assert.ok(s.miles > 2 && s.miles < 2.2)
  assert.equal(formatDuration(75), '1 hr 15 min')
})
