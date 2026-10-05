import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretEvent, noticeText, signPayload, verifySignature, TOLERANCE_S } from './stripe.ts'

const SECRET = 'whsec_test'
const NOW = 1_760_000_000

test('accepts a correctly signed delivery', async () => {
  const body = '{"id":"evt_1"}'
  const sig = await signPayload(SECRET, NOW, body)
  assert.equal(await verifySignature(SECRET, `t=${NOW},v1=${sig}`, body, NOW), true)
  assert.equal(await verifySignature(SECRET, `t=${NOW},v1=deadbeef,v1=${sig}`, body, NOW), true)
})

test('refuses a wrong secret, tampered body, missing header, or old timestamp', async () => {
  const body = '{"id":"evt_1"}'
  const sig = await signPayload(SECRET, NOW, body)
  assert.equal(await verifySignature('whsec_other', `t=${NOW},v1=${sig}`, body, NOW), false)
  assert.equal(await verifySignature(SECRET, `t=${NOW},v1=${sig}`, body + ' ', NOW), false)
  assert.equal(await verifySignature(SECRET, null, body, NOW), false)
  assert.equal(await verifySignature('', `t=${NOW},v1=${sig}`, body, NOW), false)
  assert.equal(await verifySignature(SECRET, `t=${NOW},v1=${sig}`, body, NOW + TOLERANCE_S + 1), false)
})

test('subscription checkout records the buyer', () => {
  const c = interpretEvent({
    id: 'evt', type: 'checkout.session.completed',
    data: { object: { mode: 'subscription', subscription: 'sub_1', customer: 'cus_1', customer_details: { email: ' Ann@Example.com ', name: 'Ann Lee' } } },
  })
  assert.equal(c.subscriptionId, 'sub_1')
  assert.deepEqual(c.row, { stripe_customer_id: 'cus_1', email: 'ann@example.com', name: 'Ann Lee', status: 'active' })
  assert.equal(c.notice.kind, 'signup')
})

test('one-off payments are not CreekGuard', () => {
  assert.equal(interpretEvent({ id: 'e', type: 'checkout.session.completed', data: { object: { mode: 'payment' } } }), null)
  assert.equal(interpretEvent({ id: 'e', type: 'invoice.paid', data: { object: {} } }), null)
})

test('cancel at period end: canceling with the end date, pushed once', () => {
  const c = interpretEvent({
    id: 'e', type: 'customer.subscription.updated',
    data: {
      object: { id: 'sub_1', customer: 'cus_1', status: 'active', cancel_at_period_end: true, cancel_at: NOW },
      previous_attributes: { cancel_at_period_end: false, cancel_at: null },
    },
  })
  assert.equal(c.row.status, 'canceling')
  assert.equal(c.row.cancel_at, new Date(NOW * 1000).toISOString())
  assert.equal(c.notice.kind, 'canceling')

  // A later renewal-type update while still cancelling: no second push.
  const again = interpretEvent({
    id: 'e2', type: 'customer.subscription.updated',
    data: { object: { id: 'sub_1', status: 'active', cancel_at: NOW }, previous_attributes: { latest_invoice: 'in_1' } },
  })
  assert.equal(again.row.status, 'canceling')
  assert.equal(again.notice, null)
})

test('cancel_at_period_end without cancel_at uses the period end', () => {
  const c = interpretEvent({
    id: 'e', type: 'customer.subscription.updated',
    data: {
      object: { id: 'sub_1', status: 'active', cancel_at_period_end: true, items: { data: [{ current_period_end: NOW }] } },
      previous_attributes: { cancel_at_period_end: false },
    },
  })
  assert.equal(c.row.cancel_at, new Date(NOW * 1000).toISOString())
  assert.equal(c.notice.kind, 'canceling')
})

test('undoing a cancellation is reported as kept', () => {
  const c = interpretEvent({
    id: 'e', type: 'customer.subscription.updated',
    data: {
      object: { id: 'sub_1', status: 'active', cancel_at_period_end: false, cancel_at: null },
      previous_attributes: { cancel_at_period_end: true, cancel_at: NOW },
    },
  })
  assert.equal(c.row.status, 'active')
  assert.equal(c.row.cancel_at, null)
  assert.equal(c.notice.kind, 'resumed')
})

test('a failed renewal is pushed once', () => {
  const c = interpretEvent({
    id: 'e', type: 'customer.subscription.updated',
    data: { object: { id: 'sub_1', status: 'past_due' }, previous_attributes: { status: 'active' } },
  })
  assert.equal(c.row.status, 'past_due')
  assert.equal(c.notice.kind, 'past_due')
})

test('deleted subscription ends the plan and is urgent', () => {
  const c = interpretEvent({
    id: 'e', type: 'customer.subscription.deleted',
    data: { object: { id: 'sub_1', customer: 'cus_1', status: 'canceled', ended_at: NOW } },
  })
  assert.equal(c.row.status, 'canceled')
  assert.equal(c.row.ended_at, new Date(NOW * 1000).toISOString())
  assert.equal(c.notice.kind, 'ended')
  assert.equal(noticeText('ended', 'Ann Lee').urgent, true)
  assert.match(noticeText('canceling', 'Ann Lee', c.row.ended_at).message, /Plan ends \w{3} \d+, \d{4}/)
})
