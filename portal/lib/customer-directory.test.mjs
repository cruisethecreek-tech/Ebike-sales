// The generator's customer picker must show what the portal shows: no
// archived or merged-away customers, and no Sheet rows that bring them back.
import { buildCustomerDirectory } from './customer-directory.ts'

let fails = 0
const ok = (n, c, e = '') => { console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : '')); if (!c) fails++ }

const cust = (id, first, last, extra = {}) => ({
  id, first_name: first, last_name: last, phone: '', referral_code: null, archived_at: null, ...extra,
})
// The real case: Anna was entered twice, once under the shop's own address,
// and the second record was merged into the first.
const customers = [
  cust('keep', 'Anna', 'james', { phone: '(330) 881-8812', referral_code: 'ANNA-I1T' }),
  cust('gone', 'Anna', 'james', { phone: '3305078702', archived_at: '2026-09-29T02:31:02Z' }),
  cust('old', 'Pat', 'Lee', { archived_at: '2026-09-01T00:00:00Z' }),
  cust('bob', 'Bob', 'Stone'),
]
const emails = new Map([
  ['keep', 'annaholliwood@gmail.com'],
  ['gone', 'cruisethecreek@gmail.com'],
  ['old', 'pat@example.com'],
  ['bob', 'bob@example.com'],
])
const sheet = [
  { customerName: 'Anna james', customerEmail: 'cruisethecreek@gmail.com', customerPhone: '3305078702' },
  { customerName: 'Anna James', customerEmail: 'annaholliwood@gmail.com', customerAddress: '1 Main St' },
  // A different walk-in filed under the same shop address stays.
  { customerName: 'Earl Boylen', customerEmail: 'cruisethecreek@gmail.com' },
  { customerName: 'Pat Lee', customerEmail: 'pat@example.com' },
  { customerName: 'Pat Lee', customerEmail: '' },
  { customerName: 'Walk In', customerEmail: '' },
]
const list = buildCustomerDirectory(customers, emails, sheet)
const names = list.map((c) => `${c.name}|${c.email}`)

ok('Anna appears once', list.filter((c) => /^anna/i.test(c.name)).length === 1, JSON.stringify(names))
ok('the kept Anna is the one shown, with her code and Sheet address',
   list.some((c) => c.id === 'keep' && c.referralCode === 'ANNA-I1T' && c.address === '1 Main St'))
ok('an archived customer is gone, Sheet rows included', !list.some((c) => /pat/i.test(c.name)), JSON.stringify(names))
ok('another person on the shop address stays', list.some((c) => c.name === 'Earl Boylen' && c.id === ''))
ok('Sheet-only walk-ins stay', list.some((c) => c.name === 'Walk In'))
ok('live customers stay', list.some((c) => c.id === 'bob'))

if (fails) { console.error(fails + ' failed'); process.exit(1) }
