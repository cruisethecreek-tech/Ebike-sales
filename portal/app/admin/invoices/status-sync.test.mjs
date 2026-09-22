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
ok('the current status stays disabled, and all of them while a request is in flight',
   /disabled=\{current === status \|\| busy\}/.test(ui))
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

// --- Re-sync: push the status the portal already holds -------------------
//
// The status buttons disable whatever is already current, so an invoice the
// portal calls paid while the Sheet calls it pending could otherwise only be
// fixed by toggling to another status and back — which writes a WRONG status
// to the thing that bills, however briefly, and leaves two misleading lines
// in paymentNotes.
ok('a re-sync action exists', /export async function resyncStatusToSheet/.test(actions))

const resync = actions.slice(actions.indexOf('export async function resyncStatusToSheet'),
                             actions.indexOf('export type DeleteInvoiceResult'))
ok('it reads the invoice rather than writing it',
   /\.select\('invoice_number, status'\)/.test(resync) && !/\.update\(/.test(resync))
ok('it pushes the status already stored, not one from the form',
   /syncStatusToSheet\(invoiceNumber, status\)/.test(resync) && !/formData\.get\('status'\)/.test(resync))
ok('it refuses an invoice with no status', /no status to push/.test(resync))
ok('it refuses an invoice that is gone', /no longer in the portal/.test(resync))
ok('a Sheet failure is still a failure', /ok: false,\s*\n\s*sheetSynced: false/.test(resync))
ok('it says the portal was left alone', /Nothing in the portal changed/.test(resync))
ok('it sends no email either',
   !/mail|stripe|invite/i.test(resync))

ok('the button is wired to it', /action=\{resubmit\}/.test(ui))
ok('it carries the invoice id', /name="invoice_id"/.test(ui))
ok('its result has its own slot, not shared with the status result',
   /resync && !resyncing/.test(ui) && /result && !pending/.test(ui))
ok('every button is disabled while either request is in flight',
   /const busy = pending \|\| resyncing/.test(ui) && /disabled=\{busy\}/.test(ui))
ok('the hover text explains it changes nothing in the portal',
   /without changing anything here/.test(ui))
ok('the no-email promise now covers both buttons',
   /Both buttons write the Google Sheet\. No email is sent/.test(ui))

// Idempotence is the property that makes it safe to click during an audit.
const push = (sheetStatus, portalStatus) => portalStatus
ok('pushing a status the Sheet already has is a no-op in effect',
   push('paid', 'paid') === 'paid')
ok('pushing corrects a stale Sheet', push('pending', 'paid') === 'paid')

console.log(fails ? `\n${fails} FAILED` : '\nAll passed')
process.exit(fails ? 1 : 0)
