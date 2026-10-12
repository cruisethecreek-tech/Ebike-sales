import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectBike, bikesOnInvoice } from './detect-bike.ts'

test('a fat tire bike is a bike (CTR-076)', () => {
  assert.deepEqual(
    detectBike('Velotric Nomad 2 Fat Tire Step-Thru Midnight Blue Regular (Free Install)'),
    { brand: 'Velotric', model: 'Nomad 2 Fat Tire Step-Thru Midnight Blue Regular' },
  )
  assert.equal(bikesOnInvoice([{ description: 'Mokwheel Basalt fat-tyre e-bike', qty: 1 }]).length, 1)
})

test('tires and tubes on their own are still not bikes', () => {
  assert.equal(detectBike('Fat Tire 20x4.0'), null)
  assert.equal(detectBike('20x4 fat tire tube'), null)
  assert.equal(detectBike('Heybike Ranger rear tire'), null)
  assert.equal(detectBike('Tire replacement labor'), null)
})

test('existing rules hold', () => {
  assert.deepEqual(detectBike('Velotric Discover M Regular Silver (Free Installation)'),
    { brand: 'Velotric', model: 'Discover M Regular Silver' })
  assert.equal(detectBike('Tune-up'), null)
  assert.equal(detectBike('Velotric spare battery'), null)
})
