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

ok('a run with failures is not shown as success, and unknowns get their own colour',
   /finished\.failed \? 'text-\[#B3261E\]' : finished\.unknown \? 'text-\[#8A6D1F\]' : 'text-\[#2D4A32\]'/.test(ui))

// --- a timeout is not a failure -----------------------------------------
//
// 16 of 55 in the first real run came back "The operation was aborted due to
// timeout". That says the answer never arrived, NOT that the Sheet refused
// the write — Apps Script may well have saved the row and been slow to say
// so. Reporting it as "could not write" is as wrong as reporting success.
const actions = readFileSync(join(here, 'actions.ts'), 'utf8')

ok('a timed-out write is marked unknown, not failed', /unknown: true/.test(actions))
ok('and says plainly that it may or may not have saved',
   /may or may not have been saved/.test(actions))
ok('the timeout is long enough for a cold Apps Script', /25_000/.test(actions))
ok('it retries once, with more room', /40_000/.test(actions))
ok('a refusal is NOT retried — that is an answer',
   /A refusal is an answer, not a transport problem/.test(actions))
ok('only transport errors retry', /if \(!timedOut\) break/.test(actions))

ok('the bulk run counts unknowns separately', /let unknown = 0/.test(ui))
ok('and does not fold them into the failed count',
   /failed: failed\.length - unknown/.test(ui))
ok('the summary names them', /unconfirmed/.test(ui))
ok('and says what to do about them', /Run it again/.test(ui))
ok('unknown reads as a warning, not an error',
   /finished\.unknown \? '⚠️ '/.test(ui))
ok('the loop paces itself between writes', /setTimeout\(r, 250\)/.test(ui))

// The three-way tally, exercised.
const tally = (rs) => rs.reduce((a, r) => {
  if (r === 'ok') a.ok++
  else if (r === 'unknown') a.unknown++
  else a.failed++
  return a
}, { ok: 0, failed: 0, unknown: 0 })

let t = tally(['ok','ok','unknown','refused'])
ok('ok / unknown / refused are counted apart',
   t.ok === 2 && t.unknown === 1 && t.failed === 1, JSON.stringify(t))
t = tally(['ok','unknown'])
ok('an unknown alone is not reported as a clean run', t.unknown === 1 && t.failed === 0)
t = tally(['ok','ok'])
ok('a clean run has no unknowns and no failures', t.unknown === 0 && t.failed === 0)

console.log(fails ? `\n${fails} FAILED` : '\nAll passed')
process.exit(fails ? 1 : 0)
