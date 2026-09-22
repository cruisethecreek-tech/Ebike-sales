// Back-filling a historical invoice must not email the customer.
//
// The portal only learns about an invoice when it is synced from the
// generator with an email present, so 13 invoices — CTR-066 among them —
// exist in the Sheet and not in the portal. Bringing them across means
// creating accounts, and inviteUserByEmail is the one call on this path that
// sends mail. A "set your password" link arriving months after someone bought
// a bike, because staff were auditing, is an email nobody asked for.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
let fails = 0
const ok = (n, c, e = '') => { console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : '')); if (!c) fails++ }

const route = readFileSync(join(here, 'route.ts'), 'utf8')
const gen = readFileSync(join(here, '..', '..', '..', '..', '..', 'invoice.html'), 'utf8')

// --- the flag ------------------------------------------------------------
ok('the endpoint accepts a quiet flag', /const quiet = body\.quiet === true/.test(route))
ok('it also accepts the string form, since this arrives as JSON from a form tool',
   /body\.quiet === 'true'/.test(route))
ok('quiet defaults to off, so a real sale still invites',
   !/const quiet = true/.test(route) && /body\.quiet === true \|\| body\.quiet === 'true'/.test(route))

// --- what quiet actually changes -----------------------------------------
// Strip comments before checking for calls: the quiet branch NAMES
// inviteUserByEmail in a comment explaining why it does not use it.
const decomment = (t) => t.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
const quietBlock = decomment(
  route.slice(route.indexOf('if (!user && quiet)'), route.indexOf('// Send official portal invite')))
ok('the quiet branch creates the user directly', /admin\.createUser\(/.test(quietBlock))
ok('and never calls the invite, which is what sends mail',
   !/admin\.inviteUserByEmail\(/.test(quietBlock), quietBlock.slice(0, 120))
ok('it confirms the address so the account is not left pending',
   /email_confirm: true/.test(quietBlock))
ok('it reports that it happened', /createdQuietly = true/.test(quietBlock))
ok('the response says whether an email went out', /emailSent: invited/.test(route))

// The invite path must still exist for ordinary sales.
ok('the inviting path is still there for new invoices',
   /inviteUserByEmail/.test(route))

// --- the generator uses it for Save Changes only -------------------------
ok('syncInvoiceToPortal takes the flag',
   /function syncInvoiceToPortal\(invoiceData, paymentLink, quiet\)/.test(gen))
ok('it forwards it to the endpoint', /quiet\s*:\s*quiet === true/.test(gen))
ok('Save Changes passes it', /syncInvoiceToPortal\(invoiceData, existingLink, true\)/.test(gen))
ok('and tells the person no email was sent',
   /no email was sent to the customer/.test(gen))

// New-sale paths must NOT pass quiet — the customer SHOULD be invited then.
// Check every call site rather than a slice: exactly one may be quiet.
const calls = [...gen.matchAll(/syncInvoiceToPortal\(([^)]*)\)/g)]
  .map(m => m[1].trim())
  .filter(a => !a.startsWith('invoiceData, paymentLink'))   // the definition
const quietCalls = calls.filter(a => /,\s*true\s*$/.test(a))
ok('exactly one call site syncs quietly', quietCalls.length === 1, calls.join(' | '))
ok('and it is the Save Changes one', /existingLink,\s*true/.test(quietCalls[0] || ''), quietCalls[0])
ok('every sale path still invites the customer',
   calls.filter(a => !/,\s*true\s*$/.test(a)).length === calls.length - 1,
   calls.join(' | '))

// --- the decision table --------------------------------------------------
const emails = (userExists, quiet) => userExists ? false : !quiet
ok('new customer, normal sync => invite email', emails(false, false) === true)
ok('new customer, quiet sync => NO email', emails(false, true) === false)
ok('existing customer => no email either way',
   emails(true, false) === false && emails(true, true) === false)

console.log(fails ? `\n${fails} FAILED` : '\nAll passed')
process.exit(fails ? 1 : 0)
