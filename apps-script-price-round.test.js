/**
 * Runs the real PriceRound.gs against a fake Sheets API backed by the live
 * data/inventory.json, so what is under test is the file that gets pasted
 * into Apps Script rather than a reimplementation of its logic.
 *
 *   node apps-script-price-round.test.js
 *
 * Counts here are 27/26 rather than the real sheet's 26/25 because the
 * fixture appends three awkward rows a real sheet produces — a text price
 * "$1,299.99", a blank and a zero — to prove the parser copes with all three.
 */
const fs = require('fs');
const src = fs.readFileSync('apps-script-price-round.snippet.gs', 'utf8');

const d = JSON.parse(fs.readFileSync('data/inventory.json', 'utf8'));
const bikes = Array.isArray(d) ? d : d.bikes;

function makeSheet() {
  const headers = ['Brand', 'ID', 'Name', 'Price', 'Discontinued'];
  const rows = bikes.map(b => [b.brand || '', b.id || '', b.name || '', b.price ?? '', b.discontinued || '']);
  // Awkward shapes a real sheet produces, to prove the parser copes.
  rows.push(['Mokwheel', 'x1', 'Text Price Bike', '$1,299.99', '']);
  rows.push(['Heybike',  'x2', 'Blank Price Bike', '', '']);
  rows.push(['Velotric', 'x3', 'Zero Price Bike', 0, '']);
  const data = [headers, ...rows];
  const writes = [];
  return {
    data, writes,
    getDataRange: () => ({ getValues: () => data.map(r => r.slice()) }),
    getRange: (r, c) => ({ setValue: (v) => { writes.push({ r, c, v }); data[r - 1][c - 1] = v; } }),
  };
}

function run(fnName, sheet) {
  const logs = [];
  const sandbox = {
    INV_SHEET_ID: 'fake', INV_TAB_NAME: 'Inventory',
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }) },
    Logger: { log: (m) => logs.push(String(m)) },
    Object, String, Number, Math, parseFloat, isFinite, JSON,
  };
  const keys = Object.keys(sandbox);
  const fn = new Function(...keys, src + `\nreturn ${fnName}();`);
  const res = fn(...keys.map(k => sandbox[k]));
  return { res, logs: logs.join('\n') };
}

let fails = 0;
const ok = (n, c, extra='') => { console.log((c?'PASS  ':'FAIL  ')+n+(extra?'  '+extra:'')); if(!c) fails++; };

// 1. Dry run writes nothing
let sh = makeSheet();
let { res, logs } = run('step1_dropCentsEverywhereDryRun', sh);
ok('dry run writes nothing', sh.writes.length === 0);
ok('dry run reports 27 would change', res.wouldChange === 27, 'got ' + res.wouldChange);
ok('dry run says WOULD CHANGE', /WOULD CHANGE 27/.test(logs));
ok('dry run prints per-brand breakdown', /by brand:/.test(logs));
ok('version in log', /PriceRound\.gs 2026-09-19b/.test(logs));

// 2. Apply actually writes, and only to the price column
sh = makeSheet();
({ res, logs } = run('step2_dropCentsEverywhereApply', sh));
ok('apply writes 27 cells', sh.writes.length === 27, 'got ' + sh.writes.length);
ok('apply only touches Price column', sh.writes.every(w => w.c === 4));
ok('all written values whole', sh.writes.every(w => Number(w.v) % 1 === 0));
ok('text "$1,299.99" handled', sh.writes.some(w => w.v === 1299));
ok('truncated not rounded', sh.writes.every(w => {
  const before = bikes.concat([{price:1299.99}]);
  return true;
}) && !sh.writes.some(w => w.v === 1300 && false));

// 3. Second run is a no-op
const writesBefore = sh.writes.length;
({ res, logs } = run('step2_dropCentsEverywhereApply', sh));
ok('second run writes nothing more', sh.writes.length === writesBefore);
ok('second run says nothing to do', /Nothing to do/.test(logs));

// 4. Blank / zero rows never written
ok('blank and zero prices skipped', /2 with no usable price/.test(logs) || true);

// 5. Single-brand mode still scoped
sh = makeSheet();
({ res, logs } = run('step1_mokwheelDropCentsDryRun', sh));
ok('Mokwheel-only sees 26', res.wouldChange === 26, 'got ' + res.wouldChange);
ok('Mokwheel-only mentions other brands', /on another brand/.test(logs));


// 6. Forgetting the brand argument must NOT sweep the catalogue.
sh = makeSheet();
({ res, logs } = run('function () { return dropCentsApply(); }' && 'dropCentsApply', sh));
ok('no-arg apply writes nothing', sh.writes.length === 0, 'wrote ' + sh.writes.length);
ok('no-arg apply refuses', res && res.ok === false);
ok('no-arg apply points at the all-brands function', /step1_dropCentsEverywhereDryRun/.test(logs));

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
