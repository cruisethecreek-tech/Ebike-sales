// Deleting an invoice must take out the Google Sheet row as well as the
// portal copy, or the generator keeps listing it and syncs it back.
import { removeInvoiceEverywhere } from './invoice-removal.ts'

let fails = 0
const ok = (n, c, e = '') => { console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : '')); if (!c) fails++ }

const fakeAdmin = (rows) => ({
  from: () => ({ delete: () => ({ eq: (_c, v) => ({ select: async () => ({ data: rows.filter((r) => r === v).map((id) => ({ id })), error: null }) }) }) }),
})
let sheetCalls = []
const sheet = (reply) => { globalThis.fetch = async (_u, init) => { sheetCalls.push(JSON.parse(init.body)); return { status: 200, text: async () => JSON.stringify(reply) } } }
process.env.ADMIN_API_KEY = 'k'

sheet({ ok: true, removed: 1 })
let r = await removeInvoiceEverywhere(fakeAdmin(['CTR-067']), 'https://script.test/exec', ' ctr-067 ')
ok('both copies go', r.ok && r.portalRemoved === 1 && r.sheetRemoved === 1, JSON.stringify(r))
ok('the Sheet is asked with the key and the canonical number',
   sheetCalls[0].action === 'deleteInvoice' && sheetCalls[0].key === 'k' && sheetCalls[0].invoiceNumber === 'CTR-067')

sheet({ ok: true, removed: 1 })
r = await removeInvoiceEverywhere(fakeAdmin([]), 'https://script.test/exec', 'CTR-062')
ok('a Sheet-only test invoice can be deleted', r.ok && r.portalRemoved === 0 && r.sheetRemoved === 1)

sheet({ ok: false, error: 'not authorized' })
r = await removeInvoiceEverywhere(fakeAdmin(['CTR-070']), 'https://script.test/exec', 'CTR-070')
ok('a Sheet failure is reported, not hidden', r.sheetRemoved === null && /could not be removed/.test(r.message), r.message)

sheetCalls = []
sheet({ ok: true, removed: 0 })
r = await removeInvoiceEverywhere(fakeAdmin(['WIX-1001']), 'https://script.test/exec', 'WIX-1001')
ok('WIX orders never call the Sheet', r.ok && sheetCalls.length === 0)

r = await removeInvoiceEverywhere(fakeAdmin([]), 'https://script.test/exec', 'CTR-1; drop')
ok('junk is refused', !r.ok)

if (fails) { console.error(fails + ' failed'); process.exit(1) }
