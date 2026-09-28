// The portal is a mirror of the Sheet, and nothing compared them.
//
// 15 invoices — CTR-001, 009, 016, 019, 022, 030, 035, 043, 058, 059, 061,
// 062, 066, 067, 069 — are in the Sheet and not in the portal. There was no
// error, no gap in any list and nothing to notice; they were found by a human
// scrolling two screens side by side.
//
// The usual cause is the sync's own guard: an invoice with no customer email
// is skipped, because a portal invoice belongs to an auth user and an auth
// user needs an address. A reasonable rule, applied invisibly.
const fs = require('fs');
const path = require('path');

let fails = 0;
const ok = (n, c, e = '') => {
  console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : ''));
  if (!c) fails++;
};
const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');

const page = read('portal/app/admin/invoices/reconcile/page.tsx');
const importer = read('portal/app/admin/invoices/reconcile/import-payload.ts');
const lib = read('portal/lib/sheet-invoices.ts');

// ── Reading the whole Sheet ──────────────────────────────────────────────
ok('the whole Sheet can be read, not just one invoice at a time',
   /export async function fetchAllSheetInvoices/.test(lib));

// The single-invoice lookup and the full list must parse rows identically, or
// the comparison would flag differences that are only parsing artefacts.
ok('both paths share one row parser',
   /function rowToSheetInvoice/.test(lib) &&
   (lib.match(/rowToSheetInvoice\(/g) || []).length >= 3);

// This is the assertion that matters most on this page.
ok('a Sheet that cannot be read throws instead of returning an empty list',
   /throw new Error\(`Could not read the Sheet/.test(lib),
   'returning [] would report "nothing is missing" when nothing could be checked');

ok('...and the page says so rather than showing a clean result',
   /could not be read, so nothing below is/.test(page.replace(/\s+/g, ' ')));

ok('a failed portal read is surfaced too',
   /portalError/.test(page));

// ── The comparison ───────────────────────────────────────────────────────
ok('numbers are compared canonically, so CTR-71 and CTR-071 are one invoice',
   /canonicalInvoiceNumber\(r\.invoice_number\)/.test(page) &&
   /canonicalInvoiceNumber\(inv\.invoiceNumber\)/.test(page));

ok('the two reasons an invoice is missing are separated',
   /const importable = missing\.filter\(\(m\) => m\.customerEmail\.trim\(\)\)/.test(page) &&
   /const blocked = missing\.filter\(\(m\) => !m\.customerEmail\.trim\(\)\)/.test(page),
   'one is fixable from this page, the other needs an email added first');

ok('the blocked list explains what to do about it',
   /a login needs an email/i.test(page.replace(/\s+/g, ' ')));

ok('counts are stated: sheet, portal, missing',
   /in the Sheet/.test(page) && /in the portal/.test(page) && /missing/.test(page));

// ── Importing ────────────────────────────────────────────────────────────
ok('importing is quiet — no customer is emailed about an old invoice',
   /quiet: true/.test(importer));

ok('the whole money breakdown is carried over, not just the total',
   ['subtotal', 'discountAmt', 'tax', 'processingFee', 'total', 'amountPaid', 'balanceDue']
     .every((f) => new RegExp(`${f}:`).test(importer)));

// The sync endpoint answers HTTP 200 with ok:false when it skips an invoice,
// so checking res.ok alone would report a skip as a success — which is the
// same blindness that produced the 15.
ok('a skip is treated as a failure, not a success',
   /json\.ok === false/.test(importer),
   'the endpoint returns 200 with ok:false when it declines');

// The reason now comes back from the shared runImport, which prefers the
// endpoint's `error` over its `message` — a no-email skip fills in both, and
// `error` is the one that names the invoice.
ok('a failed import shows why',
   /json\.error \|\| json\.message/.test(importer));
ok('and the buttons show it',
   /setMessage\(r\.error\)/.test(read('portal/app/admin/invoices/reconcile/import-missing.tsx')));

ok('the invoices page links to the check',
   /admin\/invoices\/reconcile/.test(read('portal/app/admin/invoices/page.tsx')));

console.log(fails ? `\n${fails} failing` : '\nall passing');
process.exit(fails ? 1 : 0);
