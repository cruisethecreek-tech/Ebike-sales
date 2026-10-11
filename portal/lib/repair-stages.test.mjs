import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isActiveRepair, isRepairStage, progressSteps, statusForStage } from './repair-stages.ts'

const states = (steps) => steps.map((s) => `${s.key}:${s.state}`)

test('only known stages count', () => {
  assert.ok(isRepairStage('diagnosing'))
  assert.ok(!isRepairStage('open'))
  assert.ok(!isRepairStage(null))
})

test('a repair is active until it is picked up', () => {
  assert.ok(isActiveRepair('ready'))
  assert.ok(!isActiveRepair('picked_up'))
  assert.ok(!isActiveRepair(null))
})

test('parts step is hidden when the bike never waited for parts', () => {
  assert.deepEqual(states(progressSteps('repairing', ['checked_in', 'diagnosing'])), [
    'checked_in:done', 'diagnosing:done', 'repairing:current', 'ready:todo',
  ])
})

test('parts step shows once the bike has waited, even after it moves on', () => {
  assert.deepEqual(states(progressSteps('repairing', ['checked_in', 'waiting_parts'])), [
    'checked_in:done', 'diagnosing:done', 'waiting_parts:done', 'repairing:current', 'ready:todo',
  ])
  assert.deepEqual(states(progressSteps('waiting_parts')).slice(2, 3), ['waiting_parts:current'])
})

test('picked up shows every step done', () => {
  const s = progressSteps('picked_up')
  assert.equal(s.at(-1).key, 'picked_up')
  assert.ok(s.every((x) => x.state === 'done'))
})

test('no stage, no steps', () => {
  assert.deepEqual(progressSteps(null), [])
})

test('picked up closes the ticket, every other stage keeps it in progress', () => {
  assert.equal(statusForStage('picked_up'), 'resolved')
  assert.equal(statusForStage('ready'), 'in progress')
})
