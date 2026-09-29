import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanCustomerDetails } from './customer-details.ts'

const base = { firstName: ' Edgar ', lastName: 'Wilson', email: ' ERWilson6@Gmail.com ', phone: '(330) 571-2271', preferredContact: 'email' }

test('tidies a good record', () => {
  const r = cleanCustomerDetails(base)
  assert.deepEqual(r, { ok: true, value: { firstName: 'Edgar', lastName: 'Wilson', email: 'erwilson6@gmail.com', phone: '3305712271', preferredContact: 'email' } })
})

test('accepts a leading 1 and a blank phone', () => {
  assert.equal(cleanCustomerDetails({ ...base, phone: '+1 330 571 2271' }).value.phone, '3305712271')
  assert.equal(cleanCustomerDetails({ ...base, phone: '' }).value.phone, null)
})

test('refuses what the database or a person would trip on', () => {
  assert.equal(cleanCustomerDetails({ ...base, lastName: '  ' }).ok, false)
  assert.equal(cleanCustomerDetails({ ...base, firstName: '' }).ok, false)
  assert.equal(cleanCustomerDetails({ ...base, email: 'erwilson6@gmail' }).ok, false)
  assert.equal(cleanCustomerDetails({ ...base, phone: '330571221' }).ok, false)
})

test('an unknown contact method falls back to text', () => {
  assert.equal(cleanCustomerDetails({ ...base, preferredContact: 'pigeon' }).value.preferredContact, 'text')
})
