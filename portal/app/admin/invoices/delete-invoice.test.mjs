// The delete action must distinguish "deleted" from "the database refused it".
//
// This is the bug the test exists for: RLS on public.invoices had select,
// insert and update policies for admins but no delete policy. Postgres does
// not error when no policy matches — it deletes nothing and reports success.
// The action discarded the response, revalidated, and the row rendered again
// in the same place. From the outside that looked like a dead button.
//
// Run with: node portal/app/admin/invoices/delete-invoice.test.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
let fails = 0
const ok = (n, c, e = '') => { console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : '')); if (!c) fails++ }

// --- the action, exercised against a fake Supabase ----------------------
// The action file imports server-only modules, so run its logic here against
// the same query shape rather than importing it. The assertions below pin the
// source to this shape, so the two cannot drift apart silently.
const src = readFileSync(join(here, 'actions.ts'), 'utf8')
const del = src.slice(src.indexOf('export async function adminDeleteInvoice'))

ok('the delete asks for the affected rows back', /\.select\(['"]id['"]\)/.test(del))
ok('it checks the error', /if \(error\)/.test(del))
ok('it treats zero rows as a failure', /data\.length === 0/.test(del))
ok('it returns a result rather than void',
   /Promise<DeleteInvoiceResult>/.test(del))
ok('it only revalidates after a confirmed delete',
   del.indexOf('data.length === 0') < del.indexOf('revalidatePath'))
ok('the zero-row message says the database may have refused it',
   /refused the delete/.test(del))

// --- a stand-in for the query chain, to prove each branch ---------------
function runDelete({ error = null, rows = [] }) {
  // Mirrors the action: error wins, then zero rows, then success.
  if (error) return { ok: false, message: error.message }
  if (!rows || rows.length === 0) {
    return { ok: false, message: 'Nothing was deleted. …refused the delete for this account.' }
  }
  return { ok: true }
}

let r = runDelete({ rows: [{ id: 'abc' }] })
ok('a real delete reports success', r.ok === true)

r = runDelete({ rows: [] })
ok('an RLS refusal reports failure, not success', r.ok === false, JSON.stringify(r))
ok('and says so in words an admin can act on', /refused/.test(r.message))

r = runDelete({ error: { message: 'permission denied for table invoices' } })
ok('a real error is passed through verbatim',
   r.ok === false && /permission denied/.test(r.message), r.message)

// --- the button must surface it -----------------------------------------
const btn = readFileSync(join(here, 'delete-invoice-button.tsx'), 'utf8')
ok('the button tracks the action result', /useActionState/.test(btn))
ok('the button renders a failure message', /result\.message/.test(btn))
ok('the failure is announced to screen readers', /role="alert"/.test(btn))
ok('the failure survives disarming the button',
   btn.split('result.message').length - 1 >= 2,
   'occurrences: ' + (btn.split('result.message').length - 1))
ok('the confirm button is disabled while in flight', /disabled=\{pending\}/.test(btn))
ok('it still takes two clicks', /setArmed\(true\)/.test(btn) && /setArmed\(false\)/.test(btn))

console.log(fails ? `\n${fails} FAILED` : '\nAll passed')
process.exit(fails ? 1 : 0)
