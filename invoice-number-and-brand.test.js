// Three bugs that met on one invoice — Earl Boylen's CTR-071.
//
//   1. The bike registered against a "Mokwheel Basalt ST 2.0 Ebike" was filed
//      as a VELOTRIC. Nobody mistyped it: Mokwheel was not a value of the
//      bike_brand enum, was not in the admin form's dropdown, and
//      adminAddBike fell back to `|| 'Velotric'` — which is also the first
//      <option>. The wrong brand was not chosen, it was the only outcome
//      available.
//
//   2. The bike's receipt read CTR-71 where the invoice is CTR-071, so the
//      "View Receipt" link 404'd. The bike looked registered, the invoice was
//      right there, and nothing said why they never met.
//
//   3. Not covered here: the stored total was the pre-discount figure. The
//      portal has no discount column, so no test can tell which number is
//      right — only a re-sync from the Sheet can.
const fs = require('fs');
const path = require('path');

let fails = 0;
const ok = (n, c, e = '') => {
  console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : ''));
  if (!c) fails++;
};
const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');

// Load canonicalInvoiceNumber out of the real TypeScript source.
const canonicalInvoiceNumber = (() => {
  const src = read('portal/lib/invoice-number.ts')
    .replace(/export function/g, 'function')
    .replace(/: string \| null \| undefined/g, '')
    .replace(/: string \| null/g, '')
    .replace(/: boolean/g, '')
    .replace(/: string/g, '');
  const ex = {};
  new Function('exports', src + '\nexports.c = canonicalInvoiceNumber;')(ex);
  return ex.c;
})();

// ── The exact failure ────────────────────────────────────────────────────
ok('CTR-71 and CTR-071 become the same number',
   canonicalInvoiceNumber('CTR-71') === 'CTR-071',
   `got ${canonicalInvoiceNumber('CTR-71')}`);

ok('an already-correct number is unchanged',
   canonicalInvoiceNumber('CTR-071') === 'CTR-071');

// The ways it gets typed in a hurry.
const sameAsCTR071 = ['ctr-71', 'CTR 71', 'CTR71', '71', ' ctr-071 ', 'CTR-0071'];
for (const v of sameAsCTR071) {
  ok(`"${v}" resolves to CTR-071`, canonicalInvoiceNumber(v) === 'CTR-071',
     `got ${canonicalInvoiceNumber(v)}`);
}

// ── It must not invent matches ───────────────────────────────────────────
ok('two different invoices stay different',
   canonicalInvoiceNumber('CTR-71') !== canonicalInvoiceNumber('CTR-17'));

ok('a four-digit number is not truncated to three',
   canonicalInvoiceNumber('CTR-1071') === 'CTR-1071',
   `got ${canonicalInvoiceNumber('CTR-1071')}`);

ok('a different prefix is preserved, not rewritten to CTR',
   canonicalInvoiceNumber('INV-12') === 'INV-012');

ok('empty is null, not an empty string that would match nothing loudly',
   canonicalInvoiceNumber('') === null && canonicalInvoiceNumber(null) === null);

ok('something that is not an invoice number is left alone',
   canonicalInvoiceNumber('see paper file') === 'SEE PAPER FILE');

// ── Brand ────────────────────────────────────────────────────────────────
const migration = read('portal/supabase/migrations/00008_bike_brand_mokwheel.sql');
ok('a migration adds Mokwheel to the enum',
   /add value if not exists 'Mokwheel'/.test(migration));

const syncRoute = read('portal/app/api/invoices/sync/route.ts');
const code = syncRoute.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

ok('detectBike recognises Mokwheel',
   /includes\('mokwheel'\)\) brand = 'Mokwheel'/.test(code));

// Every brand detectBike can emit has to exist in the enum, or the insert
// fails and the bike is simply never recorded — which is why `other` appears
// on none of the 34 bikes on file.
{
  const ENUM = ['Heybike', 'Velotric', 'Jasion', 'Mooncool', 'Mokwheel', 'other'];
  const emitted = [...code.matchAll(/brand = '([^']+)'/g)].map((m) => m[1]);
  const bogus = emitted.filter((b) => !ENUM.includes(b));
  ok('detectBike emits only values that exist in bike_brand',
     bogus.length === 0, bogus.length ? `not in the enum: ${bogus.join(', ')}` : emitted.join(', '));

  ok('the invalid "Custom / Other" label is gone',
     !/Custom \/ Other/.test(code),
     'it is not a value of bike_brand, so it could never be stored');
}

const actions = read('portal/app/admin/customers/actions.ts');
ok('adding a bike no longer defaults the brand to Velotric',
   !/formData\.get\('brand'\) as string \|\| 'Velotric'/.test(actions),
   'a missing brand must be rejected, not silently made a Velotric');

ok('a bike with no brand is refused',
   /if \(!customerId \|\| !model \|\| !brand\) return/.test(actions));

const directory = read('portal/app/admin/customers/customer-directory.tsx');
ok('the brand dropdown offers Mokwheel',
   /<option value="Mokwheel">Mokwheel<\/option>/.test(directory));

ok('...and opens on nothing, so a brand has to be chosen',
   /defaultValue=""/.test(directory) && /<option value="" disabled>/.test(directory));

// ── The link must not 404 ────────────────────────────────────────────────
ok('the receipt is canonicalised before it becomes a link',
   /href=\{`\/dashboard\/invoices\/\$\{canonicalInvoiceNumber\(receipt\)\}`\}/.test(directory));

ok('a receipt matching no invoice is shown as a warning, not a link',
   /No matching invoice/.test(directory));

ok('receipt numbers are canonicalised on every write path',
   (actions.match(/canonicalInvoiceNumber\(rawReceipt\)/g) || []).length === 2,
   'both adminUpdateBike and adminAddBike');

const custPage = read('portal/app/admin/customers/page.tsx');
ok('the page reads the invoice numbers the cards need to check against',
   /select\('customer_id, invoice_number/.test(custPage));

console.log(fails ? `\n${fails} failing` : '\nall passing');
process.exit(fails ? 1 : 0);
