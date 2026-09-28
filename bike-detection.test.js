// Why customers who had bought a bike showed an empty garage.
//
// Two silent faults, on invoices that all synced with ok:true.
//
// 1. The exclusion list looked for service words anywhere in the description:
//
//        if (lower.includes('installation')) return null
//
//    The shop writes what is thrown in with the sale into the same line, so
//    "Velotric Discover M Regular Silver (Free Installation)" was read as an
//    installation job and the bike was dropped. CTR-026 Tammy Bullock,
//    CTR-032 Kelly Coryea, CTR-033 Richard Lorenzi and CTR-034 Mark Benedetto
//    all lost their bike this way.
//
// 2. Bikes were matched against what was on file by brand and model string.
//    CTR-006 sells two "Velotric Discover M" on two lines and CTR-020 sells
//    two "Heybike Ranger 3.0 Pro"; one row each went in and the second was
//    read as a duplicate of the first.
//
// The half of this that is easy to get wrong in the other direction: rows
// already on file carry the note in the model — "Venus Pink (free install)",
// "Summit 2 large/ocean blue (free rack)" — so a fix that cleans up the model
// string must still recognise them, or it files every one of them twice.
const fs = require('fs');
const path = require('path');

let fails = 0;
const ok = (n, c, e = '') => {
  console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : ''));
  if (!c) fails++;
};
const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');

// Load the real module. Compiled with the project's own TypeScript rather than
// regex-stripped, so what these tests exercise is exactly what ships.
const { detectBike, lineSubject, bikeModelKey, bikesOnInvoice } = (() => {
  const { execFileSync } = require('child_process');
  const os = require('os');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-bike-'));
  execFileSync(path.join(__dirname, 'portal/node_modules/.bin/esbuild'), [
    path.join(__dirname, 'portal/lib/detect-bike.ts'),
    '--format=cjs', '--platform=node', '--outfile=' + path.join(out, 'detect-bike.js'),
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  return require(path.join(out, 'detect-bike.js'));
})();

// ── The four invoices that lost their bike ───────────────────────────────
const LOST = [
  ['CTR-026 Tammy Bullock',   'Velotric Discover M Regular Silver (Free Installation)', 'Velotric', 'Discover M Regular Silver'],
  ['CTR-032 Kelly Coryea',    'Mooncool Tk2 Pro Purple (Free Installation)',            'Mooncool', 'Tk2 Pro Purple'],
  ['CTR-033 Richard Lorenzi', 'Mooncool TK2 Electric Trike (Blue) (Free Installation)', 'Mooncool', 'TK2 Electric Trike (Blue)'],
  ['CTR-034 Mark Benedetto',  'Heybike Hybrid Black (free installation)',               'Heybike',  'Hybrid Black'],
];
for (const [who, desc, brand, model] of LOST) {
  const got = detectBike(desc);
  ok(who + ' is recognised as a bike', !!got, JSON.stringify(desc));
  ok(who + ' brand is ' + brand, got && got.brand === brand, got ? got.brand : 'null');
  ok(who + ' model is ' + JSON.stringify(model), got && got.model === model, got ? JSON.stringify(got.model) : 'null');
}

// A colour or a frame size is part of which bike it is. Only the note about
// what comes with the sale is dropped.
ok('a colour in brackets is kept',
  (detectBike('Mooncool TK2Pro (Blue Haze)') || {}).model === 'TK2Pro (Blue Haze)',
  JSON.stringify(detectBike('Mooncool TK2Pro (Blue Haze)')));
ok('a size/colour code is kept',
  (detectBike('Velotric Tempo (Reg/HS/Green)') || {}).model === 'Tempo (Reg/HS/Green)',
  JSON.stringify(detectBike('Velotric Tempo (Reg/HS/Green)')));
ok('a free extra is dropped',
  (detectBike('Velotric Summit 2 large/ocean blue (free rack)') || {}).model === 'Summit 2 large/ocean blue',
  JSON.stringify(detectBike('Velotric Summit 2 large/ocean blue (free rack)')));

// ── A service line is still a service line ───────────────────────────────
const NOT_BIKES = [
  'Free Installation', 'Installation', 'Assembly', 'Tune-Up',
  'Full Service Tune-Up', 'Helmet', 'Cable Lock', 'Spare Battery',
  'Rear Basket', 'Rear Bag', 'Shipping', 'Delivery', 'Replacement Tire',
  'Phone Holder',
  // CTR-013 Kimberly Warren: $150 to build a bike she brought in. The word
  // "bike" is in it, which was enough to file it as one.
  'Bike build',
];
for (const desc of NOT_BIKES) {
  ok('not a bike: ' + desc, detectBike(desc) === null, JSON.stringify(detectBike(desc)));
}
ok('Mokwheel Spare Battery is not a bike', detectBike('Mokwheel Spare Battery') === null);
ok('Heybike helmet is not a bike', detectBike('Heybike Helmet (Medium)') === null);

// ── Plain bikes keep working ─────────────────────────────────────────────
for (const [desc, brand, model] of [
  ['Velotric Discover 3', 'Velotric', 'Discover 3'],
  ['Mooncool Tk Pro', 'Mooncool', 'Tk Pro'],
  ['Mokwheel Basalt ST 2.0 Ebike', 'Mokwheel', 'Basalt ST 2.0 Ebike'],
  ['Jasion EB5 Pro', 'Jasion', 'EB5 Pro'],
]) {
  const got = detectBike(desc);
  ok('plain: ' + desc, got && got.brand === brand && got.model === model, JSON.stringify(got));
}
const aventon = detectBike('Aventon Level 2 Ebike');
ok('unknown maker files as the enum value other', aventon && aventon.brand === 'other', JSON.stringify(aventon));
ok('unknown maker keeps its name in the model', aventon && /aventon/i.test(aventon.model));

// ── Counting: two of the same bike is two bikes ──────────────────────────
const ctr006 = bikesOnInvoice([
  { qty: 1, price: 2499, description: 'Velotric Discover M' },
  { qty: 1, price: 2499, description: 'Velotric Discover M' },
]);
ok('CTR-006 David Markovitch bought two Discover M',
  ctr006.length === 1 && ctr006[0].count === 2, JSON.stringify(ctr006));

const ctr020 = bikesOnInvoice([
  { qty: 1, price: 1499, description: 'Heybike Ranger 3.0 Pro' },
  { qty: 1, price: 1499, description: 'Heybike Ranger 3.0 Pro' },
  { qty: 1, price: 25, description: 'Mirror' },
  { qty: 1, price: 100, description: 'Installation' },
]);
ok('CTR-020 Rosemary Lockett bought two Rangers and no mirrors',
  ctr020.length === 1 && ctr020[0].count === 2, JSON.stringify(ctr020));

ok('a quantity of two is two bikes',
  bikesOnInvoice([{ qty: 2, description: 'Mokwheel Basalt' }])[0].count === 2);
ok('two different bikes stay two entries',
  bikesOnInvoice([
    { qty: 1, description: 'Velotric Discover M' },
    { qty: 1, description: 'Velotric T1 ST' },
  ]).length === 2);

// ── Recognising rows already on file ─────────────────────────────────────
// These pairs are the same bike. If bikeModelKey told them apart, re-saving
// the invoice would file a second copy of a bike the customer already has.
const SAME = [
  ['Venus Pink (free install)', 'Venus Pink'],
  ['Summit 2 large/ocean blue (free rack)', 'Summit 2 large/ocean blue'],
  ['Breeze 1 (free install)', 'Breeze 1'],
  ['TK2Pro (Blue Haze)', 'TK2Pro (Blue Haze)'],
  ['CD1 Youth Trike (pink)', 'CD1 Youth Trike (pink)'],
  ['Discover M', 'discover m'],
];
for (const [a, b] of SAME) {
  ok('same bike: ' + JSON.stringify(a) + ' / ' + JSON.stringify(b),
    bikeModelKey(a) === bikeModelKey(b), bikeModelKey(a) + ' vs ' + bikeModelKey(b));
}
ok('different bikes stay different', bikeModelKey('Discover M') !== bikeModelKey('Discover 3'));

// ── The route must not lose an insert failure ─────────────────────────────
const route = read('portal/app/api/invoices/sync/route.ts');
const codeOnly = route
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !/^\s*\/\//.test(l))
  .join('\n');

ok('the swallowed-error line is gone', !/if \(!bikeErr\) bikesAdded\+\+/.test(codeOnly));
ok('a failed bike insert is collected', /bikeErrors\.push/.test(codeOnly));
ok('bike failures reach the response', /\{ bikeErrors/.test(codeOnly));
ok('the route uses the shared detector', /from '@\/lib\/detect-bike'/.test(codeOnly));
ok('an existing row can only be claimed once', /row\.claimed = true/.test(codeOnly));
ok('a hand-typed model still matches by receipt',
  /sameInvoiceNumber\(row\.receipt, receiptNumber\)/.test(codeOnly));
ok('receipt_number is canonicalised', /canonicalInvoiceNumber\(body\.invoiceNumber\)/.test(codeOnly));
ok('the bike insert uses it', /receipt_number: receiptNumber/.test(codeOnly));

console.log(fails ? '\n' + fails + ' FAILED' : '\nAll passed');
process.exit(fails ? 1 : 0);
