// Marking an invoice paid has to move the payment type with it.
//
// The generator rebuilds the balance from paymentMode and deposit every time
// it loads a row: balance = total - deposit. setInvoiceStatus used to write
// status='paid' and balanceDue=0 while leaving paymentMode='full' and
// deposit=0, so the generator recomputed the whole balance, displayed "Pay in
// Full", and wrote the status back to pending on the next save.
//
// CTR-025 showed Paid in the portal, Pay in Full in the generator, and pending
// in the database. One cause, three faces.
const fs = require('fs');
const path = require('path');

let fails = 0;
const ok = (n, c, e = '') => {
  console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : ''));
  if (!c) fails++;
};

const src = fs.readFileSync(path.join(__dirname, 'apps-script-cms-invoices.snippet.gs'), 'utf8');

const HDR = ['invoiceNumber', 'total', 'deposit', 'balanceDue', 'paymentMode',
             'depositMethod', 'paymentNotes', 'status'];
const at = (n) => HDR.indexOf(n);

function makeSheet(fields) {
  const row = new Array(HDR.length).fill('');
  for (const k of Object.keys(fields)) row[at(k)] = fields[k];
  const data = [HDR.slice(), row];
  return {
    data,
    getLastRow: () => 2,
    getDataRange: () => ({ getValues: () => data.map((r) => r.slice()) }),
    getRange: (r, c) => ({
      setValue: (v) => { data[r - 1][c - 1] = v },
      getValue: () => data[r - 1][c - 1],
    }),
  };
}

function setStatus(sheet, params) {
  let out = null;
  const ex = {};
  new Function(
    'SpreadsheetApp', 'ContentService', 'INVOICES_SHEET_ID', 'INVOICES_TAB', 'Logger', 'exports',
    src + '\nexports.f = setInvoiceStatus;',
  )(
    { openById: () => ({ getSheetByName: () => sheet }) },
    { MimeType: { JAVASCRIPT: 'js' }, createTextOutput: (t) => ({ setMimeType: () => { out = t; return {} } }) },
    'x', 'Invoices', { log: () => {} }, ex,
  );
  ex.f({ parameter: { callback: 'cb', ...params } });
  return JSON.parse(String(out).replace(/^cb\(/, '').replace(/\);$/, ''));
}

const read = (sheet, field) => sheet.data[1][at(field)];

/** What the generator would compute for this row, from the form's own rule. */
const generatorWouldSay = (sheet) => {
  const bal = Number(read(sheet, 'total')) - Number(read(sheet, 'deposit') || 0);
  return read(sheet, 'paymentMode') === 'paidInFullCash' || bal <= 0 ? 'paid' : 'pending';
};

// ── CTR-025, exactly as it stands ────────────────────────────────────────
{
  const sh = makeSheet({
    invoiceNumber: 'CTR-025', total: 2457.63, deposit: 0,
    balanceDue: 2457.63, paymentMode: 'full', status: 'sent',
  });

  ok('before: the generator would call it pending', generatorWouldSay(sh) === 'pending');

  setStatus(sh, { invoiceNumber: 'CTR-025', status: 'paid', method: 'snap' });

  ok('the payment type moves to paid in full', read(sh, 'paymentMode') === 'paidInFullCash');
  ok('the deposit becomes the whole total', Number(read(sh, 'deposit')) === 2457.63);
  ok('nothing is left owing', Number(read(sh, 'balanceDue')) === 0);
  ok('the status column says paid', read(sh, 'status') === 'paid');
  ok('a real payment method is recorded', read(sh, 'depositMethod') === 'snap');

  // The assertion the whole change exists for.
  ok('the generator now agrees, so a re-save cannot undo it',
     generatorWouldSay(sh) === 'paid',
     'this is what made the mark evaporate on the next Save Changes');

  ok('the change is written into the notes as a record',
     /Status → paid/.test(String(read(sh, 'paymentNotes'))));
}

// ── Un-paying reverses only what paying did ──────────────────────────────
{
  const sh = makeSheet({
    invoiceNumber: 'CTR-025', total: 2457.63, deposit: 2457.63,
    balanceDue: 0, paymentMode: 'paidInFullCash', status: 'paid',
  });
  setStatus(sh, { invoiceNumber: 'CTR-025', status: 'pending' });

  ok('un-paying puts the payment type back', read(sh, 'paymentMode') === 'full');
  ok('...and the money owed with it', Number(read(sh, 'balanceDue')) === 2457.63);
  ok('...and clears the deposit', Number(read(sh, 'deposit')) === 0);
}

// A real deposit arrangement is a payment record, not a status artefact.
{
  const sh = makeSheet({
    invoiceNumber: 'CTR-040', total: 2000, deposit: 500,
    balanceDue: 1500, paymentMode: 'cashDeposit', status: 'sent',
  });
  setStatus(sh, { invoiceNumber: 'CTR-040', status: 'pending' });

  ok('un-paying does not flatten a genuine deposit',
     read(sh, 'paymentMode') === 'cashDeposit' &&
     Number(read(sh, 'deposit')) === 500 &&
     Number(read(sh, 'balanceDue')) === 1500,
     'resetting those would destroy a payment record to correct a status click');
}

// ── method is also provenance, so it must be filtered ────────────────────
{
  for (const [method, expected] of [['portal', ''], ['snap', 'snap'], ['cash', 'cash'], ['', '']]) {
    const sh = makeSheet({
      invoiceNumber: 'CTR-025', total: 100, paymentMode: 'full', status: 'sent',
    });
    setStatus(sh, { invoiceNumber: 'CTR-025', status: 'paid', method });
    ok(`method "${method || '(none)'}" → depositMethod "${expected}"`,
       read(sh, 'depositMethod') === expected,
       method === 'portal' ? 'the portal sends "portal" to say who changed it, not how it was paid' : '');
  }
}

console.log(fails ? `\n${fails} failing` : '\nall passing');
process.exit(fails ? 1 : 0);
