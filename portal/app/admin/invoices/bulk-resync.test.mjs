// The bulk re-sync writes the record the shop bills from, 55 rows at a time.
// Its job is to be interruptible, honest about partial results, and incapable
// of claiming a success it did not get.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
let fails = 0
const ok = (n, c, e = '') => { console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : '')); if (!c) fails++ }

const ui = readFileSync(join(here, 'bulk-resync.tsx'), 'utf8')
const page = readFileSync(join(here, 'page.tsx'), 'utf8')

// --- shape ---------------------------------------------------------------
ok('it reuses the single-invoice action', /resyncStatusToSheet/.test(ui))
ok('one request per invoice, not one giant one',
   /for \(let i = 0; i < targets\.length/.test(ui) && /await resyncStatusToSheet/.test(ui))
ok('the loop is sequential, not fired off in parallel',
   !/Promise\.all|Promise\.allSettled/.test(ui))
ok('it is wired into the invoices page', /<BulkResync/.test(page))
ok('it is fed the id, number and status of each row',
   /id: inv\.id/.test(page) && /invoiceNumber: inv\.invoice_number/.test(page) && /status: inv\.status/.test(page))

// --- guard rails ---------------------------------------------------------
ok('it takes two clicks', /setArmed\(true\)/.test(ui) && /setArmed\(false\)/.test(ui))
ok('the confirm step states how many rows it will write',
   /all \{total\} invoices/.test(ui))
ok('the confirm step says the portal is unchanged and no email goes out',
   /Nothing in the portal changes, and no email is sent/.test(ui))
ok('it can be stopped mid-run', /stopRef\.current = true/.test(ui) && /if \(stopRef\.current\)/.test(ui))
ok('stopping is reported, not silently treated as finished', /stopped: true/.test(ui))
ok('a thrown request is caught and counted as a failure',
   /catch \(e: any\)/.test(ui) && /ok: false, message: e\?\.message/.test(ui))
ok('failures appear as they happen, not only at the end',
   /setFailures\(\[\.\.\.failed\]\)/.test(ui))
ok('each failure names its invoice', /<b>\{f\.n\}<\/b>/.test(ui))
ok('progress is visible while it runs', /\{done\} of \{total\}/.test(ui))
ok('it renders nothing when there is nothing to do', /if \(!total\) return null/.test(ui))

// --- the counting, exercised --------------------------------------------
// Mirrors the loop: ok increments only on res.ok, failures collect the rest,
// and a stop returns what has landed so far rather than the full count.
function run(results, stopAfter = Infinity) {
  let ok = 0
  const failed = []
  for (let i = 0; i < results.length; i++) {
    if (i >= stopAfter) return { ok, failed: failed.length, stopped: true }
    if (results[i]) ok++
    else failed.push(i)
  }
  return { ok, failed: failed.length, stopped: false }
}

let r = run([true, true, true])
ok('all succeeded => 3 ok, 0 failed', r.ok === 3 && r.failed === 0 && !r.stopped)

r = run([true, false, true, false])
ok('mixed => counts both sides', r.ok === 2 && r.failed === 2, JSON.stringify(r))

r = run([true, true, true, true, true], 2)
ok('stopped early => reports only what landed', r.ok === 2 && r.stopped === true, JSON.stringify(r))

r = run([false, false])
ok('all failed => zero claimed as written', r.ok === 0 && r.failed === 2)

ok('a run with failures is not shown as success',
   /finished\.failed \? 'text-\[#B3261E\]' : 'text-\[#2D4A32\]'/.test(ui))

console.log(fails ? `\n${fails} FAILED` : '\nAll passed')
process.exit(fails ? 1 : 0)
