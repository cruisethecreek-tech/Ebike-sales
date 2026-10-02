import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mileageStatus, SERVICE_INTERVAL_MILES } from './mileage.ts'

const MILE = 1609.344
const row = (miles, serviceMiles = 0) => ({
  bike_id: 'b', distance_m: miles * MILE, service_distance_m: serviceMiles * MILE, last_serviced_on: null, updated_at: '',
})

test('no mileage row: nothing to show', () => {
  assert.equal(mileageStatus(null), null)
})

test('counts miles since the last service toward the next tune-up', () => {
  const m = mileageStatus(row(620, 300))
  assert.equal(Math.round(m.miles), 620)
  assert.equal(Math.round(m.milesSinceService), 320)
  assert.equal(Math.round(m.milesToNext), SERVICE_INTERVAL_MILES - 320)
  assert.equal(m.due, false)
})

test('due once the interval is ridden', () => {
  const m = mileageStatus(row(800, 300))
  assert.equal(m.due, true)
  assert.equal(m.milesToNext, 0)
  assert.equal(m.percent, 100)
})
