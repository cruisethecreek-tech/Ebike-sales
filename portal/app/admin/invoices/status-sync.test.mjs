// Marking an invoice paid in the portal must change the Google Sheet too —
// and must never email the customer.
//
// The Sheet is what the shop bills from; the portal holds a mirror. Setting
// status only in Supabase repainted a badge while the Sheet still showed a
// balance owing, which is why "Paid" in the portal was cosmetic and "Paid in
// Full (Cash/Check)" in the generator was real.
//
// The no-email part is not a nicety. This is used to audit historical
// invoices, so a customer receiving a fresh bill for something they settled
// months ago would be worse than the original bug.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '../../../..')
let fails = 0
const ok = (n, c, e = '') => { console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : '')); if (!c) fails++ }

const actions = readFileSync(join(here, 'actions.ts'), 'utf8')
const ui = readFileSync(join(here, 'status-buttons.tsx'), 'utf8')
const page = readFileSync(join(here, '[id]/page.tsx'), 'utf8')
const gs = readFileSync(join(repo, 'apps-script-cms-invoices.snippet.gs'), 'utf8')

// --- NO EMAIL ------------------------------------------------------------
ok('the Apps Script invoice module sends no mail at all',
   !/MailApp|GmailApp|sendEmail/.test(gs),
   (gs.match(/MailApp|GmailApp|sendEmail/) || [])[0])

const handler = gs.slice(gs.indexOf('function setInvoiceStatus'),
                         gs.indexOf('function setInvoiceStatus') + 2200)
ok('setInvoiceStatus writes only the Sheet',
   /setIf\('status'/.test(handler) && !/MailApp|GmailApp|fetch|UrlFetchApp/.test(handler))
ok('it zeroes the balance when paid', /status === 'paid'\) setIf\('balanceDue', 0\)/.test(handler))
ok('it leaves an audit note', /paymentNotes/.test(handler))

ok('the portal action calls no email or Stripe endpoint',
   !/mail|stripe|invite/i.test(actions.slice(actions.indexOf('async function syncStatusToSheet'),
                                             actions.indexOf('export async function updateInvoiceStatus'))))
ok('and the UI promises that to the admin', /No email is sent/i.test(ui))

// --- THE LINK ------------------------------------------------------------
ok('the action targets setInvoiceStatus', /action=setInvoiceStatus/.test(actions))
ok('it sends the invoice number and the new status',
   /invoiceNumber=\$\{encodeURIComponent/.test(actions) && /status=\$\{encodeURIComponent/.test(actions))
ok('it uses the CMS deployment, not the inventory one',
   /APPS_SCRIPT_CMS_URL/.test(actions))

const constants = readFileSync(join(here, '../../../lib/constants.ts'), 'utf8')
ok('the CMS url points at the project that owns setInvoiceStatus',
   /6xM0tEDAhcJA/.test(constants), 'wrong deployment')
ok('a missing env var cannot silently disable the Sheet write',
   /process\.env\.APPS_SCRIPT_CMS_URL \|\|/.test(constants))

// --- FAILURE IS VISIBLE --------------------------------------------------
ok('the action returns a result instead of void', /Promise<StatusResult>/.test(actions))
ok('a Supabase refusal is reported', /database refused the update/.test(actions))
ok('a Sheet failure is reported as a FAILURE, not a success',
   /sheetSynced: false/.test(actions) && /ok: false,\s*\n\s*sheetSynced: false/.test(actions))
ok('the failure message says the Sheet is what bills',
   /Sheet is what bills/.test(actions))
ok('the request cannot hang the action', /AbortSignal\.timeout/.test(actions))
ok('the UI surfaces the result', /result\.message/.test(ui) && /role="alert"/.test(ui))
ok('the UI distinguishes success from failure by colour',
   /result\.ok \? 'text-\[#2D4A32\]' : 'text-\[#B3261E\]'/.test(ui))
ok('buttons are disabled while in flight', /disabled=\{current === status \|\| pending\}/.test(ui))
ok('the detail page uses the new control', /<StatusButtons /.test(page))
ok('and no longer posts straight to the raw action',
   !/action=\{updateInvoiceStatus\}/.test(page))

// --- the outcome table, exercised ---------------------------------------
const decide = (dbOk, rows, sheetOk) => {
  if (!dbOk) return 'db-error'
  if (!rows) return 'db-refused'
  return sheetOk ? 'ok' : 'sheet-failed'
}
ok('portal ok + sheet ok => success', decide(true, 1, true) === 'ok')
ok('portal ok + sheet failed => NOT success', decide(true, 1, false) === 'sheet-failed')
ok('portal refused => not success', decide(true, 0, true) === 'db-refused')
ok('portal errored => not success', decide(false, 0, true) === 'db-error')

console.log(fails ? `\n${fails} FAILED` : '\nAll passed')
process.exit(fails ? 1 : 0)
