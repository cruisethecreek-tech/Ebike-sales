import { test } from 'node:test'
import assert from 'node:assert/strict'
import { baseModelName } from './model-groups.ts'

const cat = (brand, ...names) => names.map((name) => ({ key: `${brand}|${name}`, brand, name, colors: [] }))
const catalog = [
  ...cat('Velotric', 'Breeze 1', 'Discover 3', 'Discover M', 'Tempo', 'Nomad 2X', 'Velotric Discover 2 Ebike', 'Summit 2'),
  ...cat('Heybike', 'Hybrid', 'Venus', 'Ranger 3.0 Pro'),
  ...cat('Mooncool', 'TK2 Electric Trike', 'TK2Pro', 'Tk Pro ', 'TK1', 'CD1 Youth Trike'),
  ...cat('Mokwheel', 'Basalt 2.0 Ebike'),
]
const base = (brand, model) => baseModelName(catalog, brand, model)

test('colour and size variants group under the catalogue model', () => {
  for (const m of ['Tempo (Reg/HS/Green)', 'Tempo high-step silver', 'Tempo Large HS Silver']) {
    assert.equal(base('Velotric', m), 'Tempo')
  }
  for (const m of ['Discover 3', 'Discover 3 Blue Regular', 'Discover 3 reg mint']) {
    assert.equal(base('Velotric', m), 'Discover 3')
  }
  assert.equal(base('Velotric', 'Discover M Regular Silver'), 'Discover M')
  assert.equal(base('Velotric', 'Breeze 1 regular lemons blue'), 'Breeze 1')
  assert.equal(base('Velotric', 'Breeze 1 (free install)'), 'Breeze 1')
  assert.equal(base('Velotric', 'Summit 2 large/ocean blue (free rack)'), 'Summit 2')
  assert.equal(base('Velotric', 'Velotric Discover 2 Ebike'), 'Discover 2')
  assert.equal(base('Mokwheel', 'Basalt 2.0 camo'), 'Basalt 2.0')
})

test('TK2 Pro is not folded into TK2', () => {
  assert.equal(base('Mooncool', 'Tk2 Pro Blue Haze'), 'TK2Pro')
  assert.equal(base('Mooncool', 'TK2Pro (Blue Haze)'), 'TK2Pro')
  assert.equal(base('Mooncool', 'TK2 Pro Electric Trike Deep Magenta'), 'TK2Pro')
  assert.equal(base('Mooncool', 'TK2 Electric Trike Light Blue Shipped'), 'TK2 Electric Trike')
  assert.equal(base('Mooncool', 'TK2 Electric Trike (Blue)'), 'TK2 Electric Trike')
})

test('models missing from the catalogue fall back to cutting at the first variant word', () => {
  assert.equal(base('Heybike', 'Unleash Ranger S Blue'), 'Ranger S')
  assert.equal(base('Heybike', 'Unleashed Ranger S Silver'), 'Ranger S')
  assert.equal(base('Heybike', 'Ranger S'), 'Ranger S')
  assert.equal(base('Heybike', 'Unleash Mars 2.0 Smoke'), 'Mars 2.0')
  assert.equal(base('Heybike', 'Mars'), 'Mars')
  assert.equal(base('Heybike', 'Ranger X 3.0 Pro'), 'Ranger X 3.0 Pro')
  assert.equal(base('Heybike', 'Unleash Venus Grey'), 'Venus')
  assert.equal(base('Heybike', 'Hybrid Black'), 'Hybrid')
})
