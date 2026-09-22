// Admin pages must not await independent queries one after another.
//
// Loading /admin/invoices made EIGHT sequential round trips to Supabase:
// the middleware's auth check, the layout's getUser, the layout's is_admin
// lookup, then customers, bikes and invoices one at a time, then the page's
// own invoices and bikes. Each one waited for the last. The data is tiny —
// all three tables together are about 32 kB — so the cost was never the rows,
// it was the number of times the render stopped and waited.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
let fails = 0
const ok = (n, c, e = '') => { console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : '')); if (!c) fails++ }

const layout = readFileSync(join(here, 'layout.tsx'), 'utf8')
const page = readFileSync(join(here, 'invoices/page.tsx'), 'utf8')

// Count the awaits that actually hit the network in each file.
const dbAwaits = (src) => (src.match(/await supabase\s*\n?\s*\.from\(/g) || []).length

ok('the layout no longer awaits its bulk reads one by one',
   dbAwaits(layout) <= 1, String(dbAwaits(layout)))
ok('the layout batches them with Promise.all', /await Promise\.all\(\[/.test(layout))
ok('all three bulk reads are inside that batch',
   /Promise\.all\(\[[\s\S]*?from\('customers'\)[\s\S]*?from\('bikes'\)[\s\S]*?from\('invoices'\)[\s\S]*?\]\)/.test(layout))

ok('the invoices page batches its two reads', /await Promise\.all\(\[/.test(page))
ok('the invoices page has no lone db await left',
   dbAwaits(page) === 0, String(dbAwaits(page)))

// select('*') pulls columns nothing renders, including the line-items blob.
ok('the layout stopped selecting every column',
   !/\.select\('\*'\)/.test(layout), 'select(*) still present')
ok('the dock still gets the fields it renders',
   ['first_name','last_name','phone','email','referral_code','is_admin']
     .every(f => layout.includes(f)))
ok('bikes still carry what the dock searches and shows',
   ['brand','model','serial_number','receipt_number','purchase_date']
     .every(f => layout.includes(f)))
ok('invoices still carry what the dock searches',
   layout.includes('invoice_number') && layout.includes('total_amount'))

// The page must still select what the table renders, now that it names columns.
for (const f of ['invoice_number','total_amount','status','issued_at','created_at','items','supplier_url']) {
  ok(`the invoices page still selects ${f}`, page.includes(f))
}
ok('and still joins the customer name', /customers\(first_name, last_name\)/.test(page))

console.log(fails ? `\n${fails} FAILED` : '\nAll passed')
process.exit(fails ? 1 : 0)
