import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lastInviteAt, signupState, daysSince } from './portal-invites.ts'

const now = Date.parse('2026-10-12T12:00:00Z')

test('a sent sign-in link counts as an invite when Supabase has none', () => {
  assert.equal(
    lastInviteAt(null, [{ kind: 'sign_in_link', status: 'sent', sent_at: '2026-10-11T20:45:00Z' }]),
    '2026-10-11T20:45:00Z',
  )
})

test('failed sends and other emails are ignored; the latest invite wins', () => {
  const emails = [
    { kind: 'invite', status: 'failed', sent_at: '2026-10-10T00:00:00Z' },
    { kind: 'repair_stage', status: 'sent', sent_at: '2026-10-09T00:00:00Z' },
    { kind: 'invite', status: 'sent', sent_at: '2026-09-01T00:00:00Z' },
  ]
  assert.equal(lastInviteAt('2026-08-01T00:00:00Z', emails), '2026-09-01T00:00:00Z')
  assert.equal(lastInviteAt(null, []), null)
})

test('states', () => {
  const base = { email: 'a@example.com', registered: false, invitedAt: null }
  assert.equal(signupState({ ...base, registered: true }, now), 'signed_in')
  assert.equal(signupState({ ...base, email: null }, now), 'no_email')
  assert.equal(signupState({ ...base, email: 'x@cruisethecreek.com' }, now), 'no_email')
  assert.equal(signupState(base, now), 'never_invited')
  assert.equal(signupState({ ...base, invitedAt: '2026-10-01T00:00:00Z' }, now), 'invited')
  assert.equal(signupState({ ...base, invitedAt: '2026-09-12T12:00:00Z' }, now), 'reinvite_due')
})

test('daysSince rounds down', () => {
  assert.equal(daysSince('2026-10-11T13:00:00Z', now), 0)
  assert.equal(daysSince('2026-09-12T12:00:00Z', now), 30)
})
