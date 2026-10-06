import { test } from 'node:test'
import assert from 'node:assert/strict'
import { purchaseSummary } from './invite-personalization.ts'

test('one bike reads as brand and model', () => {
  assert.equal(purchaseSummary([{ brand: 'Heybike', model: 'Ranger S' }]), 'Heybike Ranger S')
})

test('two bikes are joined with and; three with commas', () => {
  assert.equal(
    purchaseSummary([{ brand: 'Heybike', model: 'Ranger S' }, { brand: 'Velotric', model: 'Fold 1' }]),
    'Heybike Ranger S and Velotric Fold 1',
  )
  assert.equal(
    purchaseSummary([{ brand: 'Heybike', model: 'Mars 2.0' }, { brand: 'Velotric', model: 'Fold 1' }, { brand: 'Jasion', model: 'EB7' }]),
    'Heybike Mars 2.0, Velotric Fold 1, and Jasion EB7',
  )
})

test('counts, duplicates, the other brand and a brand already in the model', () => {
  assert.equal(purchaseSummary([{ brand: 'Heybike', model: 'Ranger S', count: 2 }]), '2 Heybike Ranger S')
  assert.equal(purchaseSummary([{ brand: 'Heybike', model: 'Ranger S' }, { brand: 'Heybike', model: 'Ranger S' }]), 'Heybike Ranger S')
  assert.equal(purchaseSummary([{ brand: 'other', model: 'Mokwheel Basalt' }]), 'Mokwheel Basalt')
  assert.equal(purchaseSummary([{ brand: 'Heybike', model: 'Heybike Venus' }]), 'Heybike Venus')
})

test('nothing bought gives an empty string', () => {
  assert.equal(purchaseSummary([]), '')
  assert.equal(purchaseSummary([{ brand: 'Heybike', model: '' }]), '')
})
