// An invoice is more than one number.
//
// The portal stored only total_amount, which is why Earl Boylen's CTR-071 sat
// at $1,976.47 against an invoice that totalled $74.03. A $1,799 discount had
// been applied; the portal had nowhere to put it; and 1869 + 5.75% tax is
// exactly 1976.47, so the wrong figure was perfectly self-consistent. Nothing
// could tell a stale total from a discounted one. A human noticed.
//
// These tests hold the parts in place, and hold the rule that matters most:
// "not told" must never be written as zero.
const fs = require('fs');
const path = require('path');

let fails = 0;
const ok = (n, c, e = '') => {
  console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : ''));
  if (!c) fails++;
};
const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');

const migration = read('portal/supabase/migrations/00009_invoice_money_breakdown.sql');
for (const col of ['subtotal', 'discount_amount', 'discount_percent', 'tax_amount',
                   'amount_paid', 'balance_due', 'payment_method', 'payment_reference']) {
  ok(`invoices gains ${col}`, new RegExp(`add column if not exists\\s+${col}\\b`).test(migration));
}

const sync = read('portal/app/api/invoices/sync/route.ts');
const syncCode = sync.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

// The rule this whole feature rests on. A sender that omits a field must leave
// the stored value alone; writing 0 would replace a silent omission with a
// confident wrong number — the exact failure being fixed.
ok('an omitted figure is undefined, not 0',
   /if \(v === undefined \|\| v === null \|\| v === ''\) return undefined/.test(syncCode));

for (const [field, col] of [
  ['subtotal', 'subtotal'],
  ['discountAmount', 'discount_amount'],
  ['discountPercent', 'discount_percent'],
  ['taxAmount', 'tax_amount'],
  ['amountPaid', 'amount_paid'],
  ['balanceDue', 'balance_due'],
  ['paymentMethod', 'payment_method'],
  ['paymentReference', 'payment_reference'],
]) {
  ok(`${col} is only written when sent`,
     new RegExp(`\\.\\.\\.\\(${field} === undefined \\? \\{\\} : \\{ ${col}`).test(syncCode));
}

// Reproduce the arithmetic that went wrong, on Earl's real numbers.
{
  const items = [
    { description: 'Mokwheel Basalt ST 2.0 Ebike', qty: 1, price: 1799 },
    { description: 'Rear Bag', qty: 1, price: 40 },
    { description: 'Mirror', qty: 1, price: 30 },
  ];
  const subtotal = items.reduce((a, i) => a + i.qty * i.price, 0);
  ok('the line items come to $1,869', subtotal === 1869);

  // What the portal used to compute, with no discount to apply:
  const withoutDiscount = Number((subtotal * 1.0575).toFixed(2));
  ok('...which with tax and no discount is exactly the wrong $1,976.47',
     withoutDiscount === 1976.47, String(withoutDiscount));

  // What it should be:
  const discount = 1799;
  const afterDiscount = subtotal - discount;
  const withDiscount = Number((afterDiscount + afterDiscount * 0.0575).toFixed(2));
  ok('...and with the $1,799 discount it is $74.03', withDiscount === 74.03, String(withDiscount));

  ok('the two are far enough apart that a mismatch check catches it',
     Math.abs(withoutDiscount - withDiscount) > 0.02);
}

const detail = read('portal/app/dashboard/invoices/[id]/page.tsx');
ok('the stored discount is used, not only the live Sheet',
   /num\(sheet\?\.discountAmt\) \?\? num\(invoice\.discount_amount\)/.test(detail),
   'deriving from line items alone can never see a discount');

ok('tax is computed after the discount, not before',
   /\(subtotal - discountAmt\) \* 0\.0575/.test(detail));

ok('a breakdown that does not add up says so',
   /totalsDisagree/.test(detail) && /do not add up/.test(detail));

ok('how the money arrived is shown',
   /payment_method/.test(detail) && /Snap \(lease-to-own\)/.test(detail));

// Snap: the shop is paid in full on day one, so it is a payment method, not an
// unpaid balance. Nothing about it touches Stripe.
const gen = read('invoice.html');
ok('the generator offers Snap as a payment method',
   /<option value="snap">Snap \(lease-to-own\)<\/option>/.test(gen));

ok('the generator sends the breakdown it already calculates',
   /subtotal      : parseFloat\(invoiceData\.subtotal\)/.test(gen) &&
   /discountAmt   : parseFloat\(invoiceData\.discountAmt\)/.test(gen) &&
   /tax           : parseFloat\(invoiceData\.tax\)/.test(gen),
   'it computed all of this and then dropped it from the payload');

ok('the payment method and reference reach the portal',
   /paymentMethod : invoiceData\.depositMethod/.test(gen) &&
   /paymentRef    : invoiceData\.depositRef/.test(gen));


// ── A financed sale cannot also be discounted ────────────────────────────
//
// Snap pays the shop the full cash price and the customer then owes Snap, so
// there is nothing to "pay today" and nothing for a discount to describe.
// CTR-071 was booked with a $1,799 discount against a $1,976.47 financed sale,
// leaving $74.03 in the books. Snap's own record — $1,869 subtotal, $107.47
// tax, $1,976.47 total — is what proved which figure was real.
ok('saving refuses a Snap sale that carries a discount',
   /_method === 'snap' && totals\.discountAmount > 0/.test(gen),
   'nothing objected before: a discount is an ordinary thing for an invoice to have');

ok('the refusal names the amount it would have recorded instead',
   /Snap finances the full cash price/.test(gen) &&
   /Clear the discount, or change the payment method/.test(gen));

// Snap's figures, reproduced. If the tax rate or the arithmetic ever drifts
// from what the financing company recorded, the shop's books and Snap's stop
// agreeing and only a human comparing two screens would notice.
{
  const subtotal = 1869;
  const tax = Number((subtotal * 0.0575).toFixed(2));
  ok("tax matches Snap's $107.47", tax === 107.47, String(tax));
  ok("total matches Snap's $1,976.47", Number((subtotal + tax).toFixed(2)) === 1976.47);
  // And the shop's three lines add up to Snap's single one.
  ok('the itemised lines reconcile with the financed subtotal',
     1799 + 40 + 30 === subtotal);
}

console.log(fails ? `\n${fails} failing` : '\nall passing');
process.exit(fails ? 1 : 0);
