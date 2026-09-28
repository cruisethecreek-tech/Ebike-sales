// Why fifteen invoices were missing from the portal, and what stops it next time.
//
// The Sheet holds CTR-001 … CTR-072 (CTR-009 was never issued). The portal held
// 57 of them. Reading the Sheet showed two different faults wearing the same
// clothes:
//
//   Five had no customer email — CTR-016 Jennifer, CTR-019 Peter Wagler
//   ($2,113.94), CTR-022 John, CTR-030 Rick Vadino, CTR-035 Steven Eagle. The
//   sync declines those on purpose, because a portal invoice hangs off a login
//   and a login is an email address. It declined them with HTTP 200, the reason
//   in a `message` field nobody read, while the generator's own screen said
//   "· Invited to Customer Portal". A correct decision, reported as a success.
//
//   Nine had an email and still failed. Their auth account and customer row
//   exist, created at the moment their invoice was saved, with no invoice
//   against them — so the sync ran, got the customer in, and lost the invoice.
//   The upsert's error was discarded at the time, so the reason is gone. That is
//   the part these tests are really about: not the fifteen, but the discarding.
const fs = require('fs');
const path = require('path');

let fails = 0;
const ok = (n, c, e = '') => {
  console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : ''));
  if (!c) fails++;
};
const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const codeOnly = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');

// ── The skip says why, in the field callers read ──────────────────────────
const sync = codeOnly(read('portal/lib/sync-invoice.ts'));
ok('a no-email skip is labelled', /skipped: 'no_email'/.test(sync));
ok('a no-email skip carries an error, not only a message',
  /skipped: 'no_email'[\s\S]{0,400}error:/.test(sync));
ok('it still answers 200 — a decision, not a fault',
  /skipped: 'no_email'[\s\S]{0,500}, 200\)/.test(sync));

// ── Nothing reads .id off nothing ─────────────────────────────────────────
ok('the null user is caught before userId', /if \(!user\?\.id\)/.test(sync));
ok('and it names the customer', /Could not find or create a portal account for \$\{email\}/.test(sync));

// The assignment below the invite-failure recovery used to run unconditionally.
// When the create had failed, createdUser is null, so reading .user off it threw
// a TypeError — losing the invoice on the very path that had just recovered.
ok('createdUser.user is only read when the create worked',
  !/^\s*user = createdUser\.user$/m.test(sync), 'unguarded assignment still present');
ok('the recovery has an else branch', /user = createdUser\?\.user \?\? null/.test(sync));

// ── The generator stops claiming an invite it cannot send ─────────────────
const gen = read('invoice.html');
const genCode = codeOnly(gen);
ok('the generator has one test for "can this reach the portal"',
  /function hasCustomerEmail\(/.test(genCode));
ok('the paid-in-cash save uses it', /hasCustomerEmail\(invoiceData\)\s*\n?\s*\?\s*' · Invited to Customer Portal'/.test(genCode));
ok('and says plainly when it cannot', /NO EMAIL — this invoice is in the Sheet only/.test(genCode));
ok('a no-email save is not shown as a success',
  /hasCustomerEmail\(invoiceData\) \? 'success' : 'error'/.test(genCode));
ok('the sync still returns early without an email',
  /function syncInvoiceToPortal[\s\S]{0,200}if \(!hasCustomerEmail\(invoiceData\)\) return;/.test(genCode));

// ── The Import button was answering 401 ──────────────────────────────────
//
// /api/invoices/sync is guarded by the shared admin key that invoice.html
// keeps in localStorage. The reconcile page's Import button was a browser
// fetch to that route with no key on it, so it answered 401 every single time.
// The page built to find the missing invoices could not put one back — which
// is why they were still missing after it shipped, and why nobody could tell
// the button was broken rather than the invoices being unimportable.
const guard = codeOnly(read('portal/lib/api-auth.ts'));
ok('the route really does require the shared key', /x-ctc-admin-key/.test(guard));

const action = codeOnly(read('portal/app/admin/invoices/reconcile/actions.ts'));
ok('importing is a server action', /'use server'/.test(read('portal/app/admin/invoices/reconcile/actions.ts')));
ok('it authenticates with the staff session', /await requireAdminUser\(\)/.test(action));
ok('it calls the sync directly, not over HTTP', /await syncInvoice\(/.test(action));
ok('it cannot be talked out of being quiet', /quiet: true/.test(action));
ok('a decline is a failure even at status 200', /result\?\.ok === false/.test(action));

const payload = read('portal/app/admin/invoices/reconcile/import-payload.ts');
ok('no browser fetch to the key-guarded route is left',
  !/fetch\(['"]\/api\/invoices\/sync/.test(payload),
  'a fetch from an admin page carries no admin key');
ok('the buttons go through the action', /importSheetInvoice\(importPayload\(invoice\)\)/.test(payload));

// One implementation, two doors: the storefront page with the shared key, and
// staff pages with a session. They must not drift apart.
const route = codeOnly(read('portal/app/api/invoices/sync/route.ts'));
ok('the route still demands the key', /requireAdminKey\(req\)/.test(route));
ok('and shares the one implementation', /syncInvoice\(body\)/.test(route));

// ── Reconciling is one click, and reports every outcome ──────────────────
const shared = codeOnly(read('portal/app/admin/invoices/reconcile/import-payload.ts'));
ok('one payload builder for both import buttons', /export function importPayload/.test(shared));
ok('back-filling never emails the customer', /quiet: true/.test(shared));
ok('ok:false is treated as a failure, not just a bad status code',
  /result\?\.ok === false/.test(action));

const all = codeOnly(read('portal/app/admin/invoices/reconcile/import-all.tsx'));
ok('there is an import-all', /Import all \$\{invoices\.length\}/.test(all));
ok('it imports one at a time', /for \(const inv of invoices\)/.test(all));
ok('it names each failure', /\{r\.error\}/.test(all));
ok('it does not hide a bike that failed to register', /bikeErrors/.test(all));

const single = codeOnly(read('portal/app/admin/invoices/reconcile/import-missing.tsx'));
ok('the single-row button shares the same import', /runImport\(invoice\)/.test(single));

const page = codeOnly(read('portal/app/admin/invoices/reconcile/page.tsx'));
ok('import-all is on the page', /<ImportAll invoices=\{importable\}/.test(page));

console.log(fails ? '\n' + fails + ' FAILED' : '\nAll passed');
process.exit(fails ? 1 : 0);
