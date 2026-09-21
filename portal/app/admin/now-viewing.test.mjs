// The Now Viewing bar must not name someone the page is not about.
//
// selectedId only ever changed when a customer was picked inside the dock,
// and that pick was persisted to localStorage indefinitely. Opening Allan
// Zinz's invoice while Kelly Hartner had been selected days earlier left the
// bar reading "Now Viewing Kelly Hartner" over Allan's record.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
let fails = 0
const ok = (n, c, e = '') => { console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : '')); if (!c) fails++ }

const dock = readFileSync(join(here, 'now-viewing-dock.tsx'), 'utf8')
const sync = readFileSync(join(here, 'sync-now-viewing.tsx'), 'utf8')
const invoice = readFileSync(join(here, 'invoices/[id]/page.tsx'), 'utf8')

// --- the wiring ---------------------------------------------------------
ok('the dock listens for page context', /ctc-page-customer/.test(dock))
ok('the dock removes that listener on unmount',
   /removeEventListener\('ctc-page-customer'/.test(dock))
ok('page context is separate from the pinned selection',
   /pageCustomerId/.test(dock) && /selectedId/.test(dock))
ok('page context is NOT persisted',
   !/localStorage[^\n]*pageCustomer/i.test(dock))
ok('the label is computed, not hardcoded', /\{viewingLabel\}/.test(dock))
ok('a pin on an unrelated page is labelled as a pin', /Pinned Customer/.test(dock))

ok('the sync component clears context on unmount', /id: null/.test(sync))
ok('the sync component renders nothing', /return null/.test(sync))
ok('the sync component does nothing without an id', /if \(!customerId\) return/.test(sync))

ok('the invoice page reports its customer',
   /<SyncNowViewing customerId=\{invoice\.customer_id\}/.test(invoice))

// --- the resolution rule, exercised -------------------------------------
const customers = [{ id: 'k', first_name: 'Kelly', last_name: 'Hartner' },
                   { id: 'a', first_name: 'Allan', last_name: 'Zinz' }]
function resolve(pageId, pinnedId) {
  const page = pageId ? customers.find(c => c.id === pageId) || null : null
  const pinned = pinnedId ? customers.find(c => c.id === pinnedId) || null : null
  const who = pageId ? page : pinned
  const label = pageId ? 'Now Viewing' : who ? 'Pinned Customer' : 'Now Viewing'
  return { name: who ? who.first_name : null, label }
}

let r = resolve('a', 'k')
ok('the page wins over a stale pin', r.name === 'Allan', String(r.name))
ok('and it is honestly labelled Now Viewing', r.label === 'Now Viewing')

r = resolve(null, 'k')
ok('with no page context the pin still shows', r.name === 'Kelly')
ok('but is labelled as a pin, not as Now Viewing', r.label === 'Pinned Customer', r.label)

r = resolve('ghost', 'k')
ok('a page customer missing from the list shows nobody, not the pin',
   r.name === null, String(r.name))

r = resolve(null, null)
ok('nothing selected shows nobody', r.name === null)

console.log(fails ? `\n${fails} FAILED` : '\nAll passed')
process.exit(fails ? 1 : 0)
