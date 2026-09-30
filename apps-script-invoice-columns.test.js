// addOrder writes a POSITIONAL row. That is the whole hazard.
//
// The live Invoices tab is A..W and column W is supplierUrl — the staff-only
// link to the supplier/warranty paperwork, filled from a different screen by
// setInvoiceMeta. The snippet's EXPECTED list never mentioned it, so appending
// 'processingFee' to what looked like the end of the list actually put the fee
// at position 23, which IS column W. Every save would have written the
// processing fee over the supplier link — and because the generator does not
// send supplierUrl at all, a re-save would have written a plain 0 there.
//
// The header check only looks at A1, so the header row would have gone on
// saying "supplierUrl" the whole time.
//
// This runs the real snippet against a sheet shaped like the live one.
const fs = require('fs');
const src = fs.readFileSync('apps-script-cms-invoices.snippet.gs', 'utf8');

let fails = 0;
const ok = (n, c, e = '') => {
  console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : ''));
  if (!c) fails++;
};

// The live tab's header, read off the real sheet.
const HEADER = ['invoiceNumber','invoiceDate','dueDate','customerName','customerEmail',
  'customerPhone','customerAddress','lineItems','subtotal','discountPct','discountAmt',
  'tax','total','deposit','balanceDue','paymentMode','depositMethod','depositRef',
  'paymentNotes','paymentLink','createdAt','status','supplierUrl'];

function makeSheet(rows) {
  const data = [HEADER.slice(), ...rows.map((r) => r.slice())];
  return {
    data,
    getLastRow: () => data.length,
    getLastColumn: () => Math.max(...data.map((r) => r.length)),
    getDataRange: () => ({ getValues: () => data.map((r) => r.slice()) }),
    getRange: (r, c, nr, nc) => ({
      getValues: () => {
        const out = [];
        for (let i = 0; i < (nr || 1); i++) {
          const row = data[r - 1 + i] || [];
          out.push(row.slice(c - 1, c - 1 + (nc || 1)));
        }
        return out;
      },
      getValue: () => (data[r - 1] || [])[c - 1],
      setValue: (v) => { (data[r - 1] = data[r - 1] || [])[c - 1] = v; },
      setValues: (vals) => {
        vals.forEach((rv, i) => {
          data[r - 1 + i] = data[r - 1 + i] || [];
          rv.forEach((v, j) => { data[r - 1 + i][c - 1 + j] = v; });
        });
      },
      setFontWeight: () => {}, setNumberFormat: () => {}, setBackground: () => {},
      setFrozenRows: () => {},
    }),
    appendRow: (row) => { data.push(row.slice()); },
    setFrozenRows: () => {},
    insertSheet: () => {},
  };
}

function runAddOrder(sheet, params) {
  let captured = null;
  const sandbox = {
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet, insertSheet: () => sheet }) },
    ContentService: {
      createTextOutput: (t) => { captured = t; return { setMimeType: () => t }; },
      MimeType: { JAVASCRIPT: 'js', JSON: 'json' },
    },
    Logger: { log: () => {} },
    console: { warn: () => {}, log: () => {} },
    Object, String, Number, Math, parseFloat, parseInt, isFinite, isNaN, JSON, Date, Array, RegExp,
  };
  const keys = Object.keys(sandbox);
  const fn = new Function(...keys, src + '\nreturn addOrder(arguments[arguments.length - 1]);');
  fn(...keys.map((k) => sandbox[k]), { parameter: params });
  // addOrder catches its own errors and answers ok:false. Without this, a
  // throw inside it would read as a quietly passing test.
  const body = String(captured || '');
  if (/"ok":\s*false/.test(body)) throw new Error('addOrder refused: ' + body);
  return captured;
}

const base = {
  invoiceNumber: 'CTR-999', invoiceDate: '2026-09-30', dueDate: '2026-09-30',
  customerName: 'Test Person', customerEmail: 't@example.com',
  lineItems: '[{"description":"Mokwheel Basalt","qty":1,"price":1799}]',
  subtotal: '1799', tax: '103.44', total: '1941.44', deposit: '1941.44',
  balanceDue: '0', paymentMode: 'paidInFullCash', depositMethod: 'snap',
  processingFee: '39.00',
};

// ── A new invoice ────────────────────────────────────────────────────────
{
  const sh = makeSheet([]);
  runAddOrder(sh, base);
  const row = sh.data[1];
  ok('the row is one wider than the header — supplierUrl kept, fee appended',
    row.length === HEADER.length + 1, `header ${HEADER.length}, row ${row.length}`);
  const iSupplier = HEADER.indexOf('supplierUrl');
  ok('supplierUrl is not given the processing fee',
    row[iSupplier] !== 39 && row[iSupplier] !== '39.00',
    `column W got ${JSON.stringify(row[iSupplier])}`);
  ok('the processing fee lands after supplierUrl, not on it',
    Number(row[HEADER.length]) === 39, `got ${JSON.stringify(row[HEADER.length])}`);
  ok('the invoice number still starts the row', row[0] === 'CTR-999');
  ok('the total is still in the total column', Number(row[HEADER.indexOf('total')]) === 1941.44);
}

// ── Re-saving an invoice that already has a supplier link ────────────────
//
// This is the one that would have cost real work: the link is set from another
// screen, the generator never sends it, so a blind positional write blanks it.
{
  const existing = HEADER.map(() => '');
  existing[0] = 'CTR-999';
  existing[HEADER.indexOf('supplierUrl')] = 'https://mokwheel.com/warranty/12345';
  const sh = makeSheet([existing]);

  runAddOrder(sh, base);
  const row = sh.data[1];
  ok('a re-save keeps the supplier link',
    row[HEADER.indexOf('supplierUrl')] === 'https://mokwheel.com/warranty/12345',
    `got ${JSON.stringify(row[HEADER.indexOf('supplierUrl')])}`);
  ok('and still records the fee', Number(row[HEADER.length]) === 39);
  ok('it updated the row rather than adding one', sh.data.length === 2, `rows: ${sh.data.length}`);
}

// A link that IS supplied replaces the old one.
{
  const existing = HEADER.map(() => '');
  existing[0] = 'CTR-999';
  existing[HEADER.indexOf('supplierUrl')] = 'https://old.example/1';
  const sh = makeSheet([existing]);
  runAddOrder(sh, Object.assign({}, base, { supplierUrl: 'https://new.example/2' }));
  ok('a supplied link wins',
    sh.data[1][HEADER.indexOf('supplierUrl')] === 'https://new.example/2');
}

// ── The two lists have to agree ──────────────────────────────────────────
const expected = src.match(/var EXPECTED = \[([\s\S]*?)\];/)[1]
  .replace(/\/\/[^\n]*/g, '')
  .match(/'([^']+)'/g).map((s) => s.slice(1, -1));
ok('EXPECTED starts with the live header, in order',
  HEADER.every((h, i) => expected[i] === h),
  expected.slice(0, HEADER.length).join(',')); 
ok('processingFee is appended after it, not into it',
  expected[HEADER.length] === 'processingFee', expected[HEADER.length]);
ok('nothing was inserted in the middle', expected.length === HEADER.length + 1,
  `EXPECTED has ${expected.length}`);

console.log(fails ? '\n' + fails + ' FAILED' : '\nAll passed');
process.exit(fails ? 1 : 0);
