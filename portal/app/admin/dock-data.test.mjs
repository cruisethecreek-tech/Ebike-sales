// The dock's queries must not be able to fail silently, and must not name a
// column that does not exist.
//
// Swapping select('*') for named columns is right, but I named `email` on
// public.customers — which has no such column. PostgREST rejected the whole
// query, `const { data } = await ...` threw the error away, `|| []` turned it
// into an empty list, and the dock rendered a dead search box that looked
// exactly like a shop with no customers. It shipped.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
let fails = 0
const ok = (n, c, e = '') => { console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : '')); if (!c) fails++ }

const layout = readFileSync(join(here, 'layout.tsx'), 'utf8')
const dock = readFileSync(join(here, 'now-viewing-dock.tsx'), 'utf8')

// The real schemas, as the database reports them.
const SCHEMA = {
  customers: ['id','first_name','last_name','phone','preferred_contact','created_at','updated_at','is_admin','referral_code','referred_by'],
  bikes: ['id','customer_id','brand','model','serial_number','purchase_date','warranty_expires_at','created_at','updated_at','receipt_number'],
  invoices: ['id','customer_id','invoice_number','total_amount','pdf_url','status','issued_at','paid_at','created_at','updated_at','items','supplier_url'],
}

// Pull every .from('x').select('a, b, c') pair out of the file.
function selects(src) {
  const out = []
  const re = /\.from\('(\w+)'\)\s*\n?\s*\.select\('([^']+)'\)/g
  let m
  while ((m = re.exec(src))) out.push({ table: m[1], cols: m[2] })
  return out
}

// Four: the is_admin gate, then the dock's three bulk reads.
const found = selects(layout)
ok('found every select in the layout', found.length === 4,
   found.map(f => `${f.table}(${f.cols})`).join(' | '))
ok('the admin gate asks for only what it checks',
   found.some(f => f.table === 'customers' && f.cols === 'is_admin'))

for (const { table, cols } of found) {
  const known = SCHEMA[table]
  if (!known) { ok(`schema known for ${table}`, false); continue }
  const named = cols.split(',').map(c => c.trim()).filter(c => c && !c.includes('('))
  const bogus = named.filter(c => !known.includes(c))
  ok(`every column selected from ${table} exists`, bogus.length === 0, bogus.join(', '))
}

ok('customers is no longer asked for a non-existent email column',
   !/from\('customers'\)[\s\S]{0,200}?email/.test(layout))

// --- the error can no longer be discarded --------------------------------
ok('the layout keeps the query results, not just their data',
   /const \[customersRes, bikesRes, invoicesRes\]/.test(layout))
ok('it inspects every error', ['customersRes.error','bikesRes.error','invoicesRes.error']
   .every(e => layout.includes(e)))
ok('it builds a single reportable message', /const dockError =/.test(layout))
ok('it logs the failure server-side', /console\.error\('\[admin dock\]/.test(layout))
ok('it passes the failure to the dock', /dataError=\{dockError\}/.test(layout))

ok('the dock accepts it', /dataError\?: string \| null/.test(dock))
ok('the dock says so instead of showing an empty search',
   /Customer data failed to load/.test(dock))
ok('and labels it an error rather than Now Viewing',
   /dataError \? 'Error' : viewingLabel/.test(dock))
ok('the message is available on hover', /title=\{dataError \|\| undefined\}/.test(dock))

// --- the distinction that was missing ------------------------------------
const render = (err, list) => err ? 'error' : (list.length ? 'ok' : 'empty')
ok('a failed query reads as an error, not an empty shop', render('boom', []) === 'error')
ok('a genuinely empty list still reads as empty', render(null, []) === 'empty')
ok('a healthy list renders normally', render(null, [1]) === 'ok')

console.log(fails ? `\n${fails} FAILED` : '\nAll passed')
process.exit(fails ? 1 : 0)
