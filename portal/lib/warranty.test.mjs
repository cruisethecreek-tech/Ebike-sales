import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculateBikeWarranties } from './warranty.ts'

const day = (y, m, d) => new Date(y, m - 1, d).toDateString()

test('no delivery date: free tune-up window is 40 days from purchase', () => {
  const w = calculateBikeWarranties('Heybike', '2026-09-28', null, { now: new Date(2026, 9, 1) })
  assert.equal(w.creekReadyKind, 'break-in')
  assert.equal(w.breakInFromDelivery, false)
  assert.equal(w.breakInDueDate.toDateString(), day(2026, 11, 7))
  assert.equal(w.creekReadyDaysLeft, 37)
  assert.equal(w.annualServiceDueDate.toDateString(), day(2027, 9, 28))
})

test('delivery date starts a 30-day window', () => {
  const w = calculateBikeWarranties('Heybike', '2026-09-28', null, { deliveredOn: '2026-10-08', now: new Date(2026, 9, 10) })
  assert.equal(w.creekReadyKind, 'break-in')
  assert.equal(w.breakInFromDelivery, true)
  assert.equal(w.breakInDueDate.toDateString(), day(2026, 11, 7))
  assert.equal(w.creekReadyDaysLeft, 28)
})

test('after the window it moves on to the annual service', () => {
  const w = calculateBikeWarranties('Heybike', '2026-09-28', null, { now: new Date(2026, 10, 10) })
  assert.equal(w.creekReadyKind, 'annual')
  assert.equal(w.creekReadyDueDate.toDateString(), day(2027, 9, 28))
  assert.ok(w.isCreekReadyActive)
})

test('no purchase date: nothing to count down', () => {
  const w = calculateBikeWarranties('Heybike', null)
  assert.equal(w.creekReadyDueDate, null)
  assert.equal(w.isCreekReadyActive, false)
})
