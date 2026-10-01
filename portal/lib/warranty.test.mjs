import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculateBikeWarranties } from './warranty.ts'

test('first 30 days show the free break-in tune-up', () => {
  const w = calculateBikeWarranties('Heybike', '2026-09-28', null, new Date(2026, 9, 1))
  assert.equal(w.creekReadyKind, 'break-in')
  assert.equal(w.creekReadyDaysLeft, 27)
  assert.equal(w.breakInDueDate.toDateString(), new Date(2026, 9, 28).toDateString())
  assert.equal(w.annualServiceDueDate.toDateString(), new Date(2027, 8, 28).toDateString())
})

test('after 30 days it moves on to the annual service', () => {
  const w = calculateBikeWarranties('Heybike', '2026-09-28', null, new Date(2026, 10, 5))
  assert.equal(w.creekReadyKind, 'annual')
  assert.equal(w.creekReadyDueDate.toDateString(), new Date(2027, 8, 28).toDateString())
  assert.ok(w.isCreekReadyActive)
})

test('no purchase date: nothing to count down', () => {
  const w = calculateBikeWarranties('Heybike', null)
  assert.equal(w.creekReadyDueDate, null)
  assert.equal(w.isCreekReadyActive, false)
})
