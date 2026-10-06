import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isEmailToken, newEmailToken, parseEmailLogEntry, trackableUrl, trackedLink } from './email-tracking.ts'

test('new tokens are 32 lower-case hex characters', () => {
  const t = newEmailToken()
  assert.ok(isEmailToken(t))
  assert.notEqual(t, newEmailToken())
  assert.equal(isEmailToken('ABC'), false)
  assert.equal(isEmailToken(undefined), false)
})

test('only the shop and Stripe are allowed as click destinations', () => {
  assert.ok(trackableUrl('https://portal.cruisethecreek.com/dashboard'))
  assert.ok(trackableUrl('https://cruisethecreek.com/'))
  assert.ok(trackableUrl('https://buy.stripe.com/abc'))
  assert.equal(trackableUrl('http://cruisethecreek.com/'), null)
  assert.equal(trackableUrl('https://cruisethecreek.com.evil.com/'), null)
  assert.equal(trackableUrl('https://evilcruisethecreek.com/'), null)
  assert.equal(trackableUrl('https://user@cruisethecreek.com/'), null)
  assert.equal(trackableUrl('javascript:alert(1)'), null)
  assert.equal(trackableUrl(null), null)
})

test('tracked links wrap shop links and leave others alone', () => {
  const t = '0123456789abcdef0123456789abcdef'
  assert.equal(
    trackedLink(t, 'https://buy.stripe.com/x?a=1&b=2'),
    `https://portal.cruisethecreek.com/api/email/click?t=${t}&u=https%3A%2F%2Fbuy.stripe.com%2Fx%3Fa%3D1%26b%3D2`,
  )
  assert.equal(trackedLink(t, 'https://example.com/'), 'https://example.com/')
})

test('log entries from the Apps Script are cleaned up', () => {
  const t = '0123456789abcdef0123456789abcdef'
  assert.deepEqual(
    parseEmailLogEntry({ token: t, email: ' Sam@Example.COM ', kind: 'invoice', subject: 'Your invoice', ref: 'INV-1', status: 'sent', error: '' }),
    { token: t, email: 'sam@example.com', kind: 'invoice', subject: 'Your invoice', ref: 'INV-1', status: 'sent', error: null },
  )
  assert.equal(parseEmailLogEntry({ token: t, email: 'sam@example.com', kind: 'invoice', status: 'failed', error: 'quota' }).status, 'failed')
  assert.equal(parseEmailLogEntry({ token: 'nope', email: 'sam@example.com', kind: 'invoice' }), null)
  assert.equal(parseEmailLogEntry({ token: t, email: 'not-an-email', kind: 'invoice' }), null)
  assert.equal(parseEmailLogEntry({ token: t, email: 'sam@example.com', kind: 'Drop Table' }), null)
  assert.equal(parseEmailLogEntry(null), null)
})
