import { test } from 'node:test'
import assert from 'node:assert/strict'
import { customerKind, isServiceLine, serviceHistory } from './customer-kind.ts'

const inv = (...descriptions) => ({ items: descriptions.map((description) => ({ qty: 1, price: 1, description })) })

test('service lines the shop actually writes are recognised', () => {
  for (const d of ['Installation', 'Wheel repair', 'Tune-up', 'Tune up', 'Delivery (13 mi one-way)',
    'Front brake bleed', 'Bike build', '2 Tune-ups 2 Chain Replacements Pickup/Delivery', 'Motor & Brake Repair']) {
    assert.ok(isServiceLine(d), d)
  }
})

test('accessories are not service', () => {
  for (const d of ['Mirror', 'Standard Helmet', 'Rear Bag', 'Gift Card']) assert.ok(!isServiceLine(d), d)
})

test('a bike on file wins over everything', () => {
  assert.equal(customerKind(1, [inv('Standard Helmet')]), 'bike')
})

test('service wins over gear, gear over nothing', () => {
  assert.equal(customerKind(0, [inv('Mirror', 'Tune up')]), 'service')
  assert.equal(customerKind(0, [inv('Rear Bag')]), 'gear')
  assert.equal(customerKind(0, []), 'none')
})

test('items stored as a JSON string still count', () => {
  assert.equal(customerKind(0, [{ items: JSON.stringify([{ description: 'Brake bleed' }]) }]), 'service')
})

test('service history keeps only service lines with their invoice', () => {
  const h = serviceHistory([{ ...inv('Mirror', 'Brake repair'), issued_at: '2026-09-01', invoice_number: 'CTR-031' }])
  assert.deepEqual(h, [{ description: 'Brake repair', date: '2026-09-01', invoice: 'CTR-031' }])
})
