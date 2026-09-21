// Run the real InventoryHandlers.gs against a fake Sheets API.
//
// These tests exist because of a bug that was invisible for weeks: the
// deployed /exec URL was running an older copy of handleSaveColors that did
// headers.indexOf('colors'). The sheet's header reads "Colors (JSON)", so the
// lookup returned -1 and the handler threw '"colors" column not found.' on
// every single save. The browser sent those saves with mode:'no-cors', whose
// opaque response is indistinguishable from success, so salespro reported
// "saved" every time and the sheet never changed.
//
// Two things are locked down here: that the write handlers resolve their
// columns against the sheet's real headers, and that ?action=inventoryVersion
// reports enough to tell a stale deployment from a current one WITHOUT
// writing anything.
const fs = require('fs');
const src = fs.readFileSync('apps-script-inventory.snippet.gs', 'utf8');
let fails = 0;
const ok = (n, c, e = '') => { console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : '')); if (!c) fails++; };

// The sheet's REAL headers, verbatim, parenthesised suffixes and all.
const REAL_HEADERS = ['Brand', 'ID', 'Name', 'Subtitle', 'Price', 'TestRide',
  'Styles', 'Sizes', 'Specs (JSON)', 'Colors (JSON)', 'SizeGuide (JSON)',
  'Size Restrictions (JSON)', 'Mfr Price', 'Difference', 'Price Verified',
  'Discontinued'];

function makeSheet(headers = REAL_HEADERS) {
  const blank = headers.map(() => '');
  const bike = (brand, id, name, price, colors) => {
    const r = blank.slice();
    r[headers.indexOf('Brand')] = brand;
    r[headers.indexOf('ID')] = id;
    r[headers.indexOf('Name')] = name;
    r[headers.indexOf('Price')] = price;
    const ci = headers.findIndex(h => /^colors/i.test(h));
    if (ci !== -1) r[ci] = colors;
    return r;
  };
  const data = [headers.slice(),
    bike('Mokwheel', 'mesalite', 'Mesa Lite', 1299, '{"One Size":{"One Size":[{"name":"Black","hex":"#111111"}]}}'),
    bike('Heybike', 'venus', 'Venus', 1499, '{"Step-Thru":{"One Size":[{"name":"Pink","hex":"#FFDCDC"}]}}'),
  ];
  return {
    data,
    getDataRange: () => ({ getValues: () => data.map(r => r.slice()) }),
    getRange: (r, c) => ({
      setValue: v => { data[r - 1][c - 1] = v; },
      getValue: () => data[r - 1][c - 1]
    })
  };
}

// Captures whatever ContentService was handed, so we can read the JSON body.
function call(fn, sheet, params) {
  let body = null, mime = null;
  const ContentService = {
    MimeType: { JSON: 'application/json' },
    createTextOutput: t => ({ setMimeType: m => { body = t; mime = m; return { body: t, mime: m }; } })
  };
  const sb = {
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }), flush() {} },
    ContentService,
    Logger: { log() {} },
    JSON, String, Object, Array, Number, Error, parseInt, parseFloat, isFinite, Date
  };
  const keys = Object.keys(sb);
  new Function(...keys, src + `\nreturn ${fn}(${JSON.stringify({ parameter: params || {} })});`)(...keys.map(k => sb[k]));
  return { json: JSON.parse(body), mime };
}

// ---------------------------------------------------------------
// The bug itself: saveColors against the sheet's real headers.
// ---------------------------------------------------------------
const NEW_COLORS = '{"One Size":{"One Size":[{"name":"Sand","hex":"#D9C7A3"}]}}';

let sh = makeSheet();
let { json } = call('handleSaveColors', sh, { rowIndex: 2, json: NEW_COLORS });
ok('saveColors succeeds against "Colors (JSON)"', json.ok === true, JSON.stringify(json));
ok('saveColors actually wrote the cell',
   sh.data[1][REAL_HEADERS.indexOf('Colors (JSON)')] === NEW_COLORS);
ok('saveColors echoes the row it wrote', json.rowIndex === 2, String(json.rowIndex));
ok('saveColors left the other bike alone',
   /Pink/.test(sh.data[2][REAL_HEADERS.indexOf('Colors (JSON)')]));

// The regression in its exact original shape.
ok('no "colors column not found" against the real header',
   !/column not found/.test(JSON.stringify(json)), JSON.stringify(json));

// A plain lowercase header must keep working too.
sh = makeSheet(REAL_HEADERS.map(h => h === 'Colors (JSON)' ? 'colors' : h));
({ json } = call('handleSaveColors', sh, { rowIndex: 2, json: NEW_COLORS }));
ok('saveColors still works against a plain "colors" header', json.ok === true, JSON.stringify(json));

// Guards still hold.
sh = makeSheet();
({ json } = call('handleSaveColors', sh, { rowIndex: 1, json: NEW_COLORS }));
ok('row 1 (the header row) is refused', json.ok === false && /rowIndex/.test(json.error));
ok('header row untouched after refusal', sh.data[0][9] === 'Colors (JSON)');

sh = makeSheet();
({ json } = call('handleSaveColors', sh, { rowIndex: 2, json: 'not json{' }));
ok('invalid JSON is refused before the write', json.ok === false);
ok('cell untouched when the payload is invalid',
   /Black/.test(sh.data[1][REAL_HEADERS.indexOf('Colors (JSON)')]));

// ---------------------------------------------------------------
// The other three write handlers share the same column lookup.
// ---------------------------------------------------------------
sh = makeSheet();
({ json } = call('handleUpdatePrice', sh, { rowIndex: 2, price: 1199 }));
ok('updatePrice finds the Price column', json.ok === true, JSON.stringify(json));
ok('updatePrice wrote the new price',
   Number(sh.data[1][REAL_HEADERS.indexOf('Price')]) === 1199);

sh = makeSheet();
({ json } = call('handleSetDiscontinued', sh, { rowIndex: 2, discontinued: 'Yes' }));
ok('setDiscontinued finds the Discontinued column', json.ok === true, JSON.stringify(json));
ok('setDiscontinued wrote the flag',
   sh.data[1][REAL_HEADERS.indexOf('Discontinued')] === 'Yes',
   String(sh.data[1][REAL_HEADERS.indexOf('Discontinued')]));

sh = makeSheet();
sh.data[1][REAL_HEADERS.indexOf('Discontinued')] = 'Yes';
({ json } = call('handleSetDiscontinued', sh, { rowIndex: 2, discontinued: '' }));
ok('setDiscontinued can clear the flag again',
   json.ok === true && sh.data[1][REAL_HEADERS.indexOf('Discontinued')] === '');

sh = makeSheet();
({ json } = call('handleSaveSizeGuide', sh, { rowIndex: 2, json: '{"S":"5ft"}' }));
ok('saveSizeGuide finds the "SizeGuide (JSON)" column', json.ok === true, JSON.stringify(json));
ok('saveSizeGuide wrote the cell',
   sh.data[1][REAL_HEADERS.indexOf('SizeGuide (JSON)')] === '{"S":"5ft"}');

// ---------------------------------------------------------------
// inventoryVersion: the endpoint that makes a stale deployment visible.
// ---------------------------------------------------------------
sh = makeSheet();
const snapshot = JSON.stringify(sh.data);
({ json } = call('handleInventoryVersion', sh, {}));
ok('inventoryVersion answers ok', json.ok === true, JSON.stringify(json));
ok('inventoryVersion writes nothing', JSON.stringify(sh.data) === snapshot);
ok('inventoryVersion reports a version string',
   typeof json.version === 'string' && json.version.length > 0, String(json.version));
ok('version matches the constant in the file',
   json.version === (src.match(/INV_HANDLERS_VERSION\s*=\s*'([^']+)'/) || [])[1], String(json.version));
ok('confirms _headerIndex_ is present', json.hasHeaderIndex === true);
ok('resolves the colours column', json.columns.colors === REAL_HEADERS.indexOf('Colors (JSON)'),
   String(json.columns.colors));
ok('resolves the price column', json.columns.price === REAL_HEADERS.indexOf('Price'));
ok('resolves the size guide column', json.columns.sizeGuide === REAL_HEADERS.indexOf('SizeGuide (JSON)'));
ok('resolves the discontinued column', json.columns.discontinued === REAL_HEADERS.indexOf('Discontinued'));
ok('nothing reported missing on a healthy sheet', json.missingColumns.length === 0,
   String(json.missingColumns));
ok('says writes will work', json.writesWillWork === true);
ok('echoes the real headers back', json.headers.indexOf('Colors (JSON)') !== -1);

// A sheet genuinely missing the column must be reported, not hidden.
sh = makeSheet(REAL_HEADERS.map(h => h === 'Colors (JSON)' ? 'Swatches' : h));
({ json } = call('handleInventoryVersion', sh, {}));
ok('a truly missing colours column is flagged', json.columns.colors === -1);
ok('missing column is named', json.missingColumns.indexOf('colors') !== -1,
   String(json.missingColumns));
ok('writesWillWork goes false when a column is missing', json.writesWillWork === false);

// The diagnostic must survive a sheet it cannot open, rather than 500.
({ json } = call('handleInventoryVersion', {
  getDataRange: () => { throw new Error('boom'); }
}, {}));
ok('reports a sheet failure instead of throwing', json.ok === false && /boom/.test(json.error));
ok('still reports the deployed version when the sheet fails',
   typeof json.version === 'string' && json.version.length > 0);

// ---------------------------------------------------------------
// The trap the first version of this endpoint could NOT see.
//
// Apps Script evaluates every .gs file into ONE global scope, so pasting the
// fixed code into a NEW file while the old file survives changes nothing --
// the last handleSaveColors evaluated wins, silently. The sheet is healthy,
// the new file IS deployed, and saves still fail. Reporting only the column
// indexes made that look like success.
// ---------------------------------------------------------------
sh = makeSheet();
({ json } = call('handleInventoryVersion', sh, {}));
ok('reports which body won for each handler',
   json.handlers && json.handlers.saveColors && json.handlers.saveColors.present === true,
   JSON.stringify(json.handlers));
ok('sees the fixed saveColors calling _headerIndex_',
   json.handlers.saveColors.usesHeaderIndex === true);
ok('sees the fixed saveColors NOT using a bare indexOf',
   json.handlers.saveColors.usesBareIndexOf === false);
ok('all four handlers report as current', json.handlersAreCurrent === true,
   String(json.staleHandlers));
ok('nothing listed as stale', json.staleHandlers.length === 0, String(json.staleHandlers));

// Simulate the shadowing: append the OLD buggy handleSaveColors after the
// file, exactly as a leftover .gs file would. The later declaration wins.
const SHADOW = `
function handleSaveColors(e) {
  try {
    var p = (e && e.parameter) || {};
    var rowIndex = parseInt(p.rowIndex, 10);
    var json = String(p.json || '').trim();
    if (!rowIndex || rowIndex < 2) throw new Error('Invalid rowIndex: ' + p.rowIndex);
    JSON.parse(json);
    var inv = _openInventorySheet_();
    var col = inv.headers.indexOf('colors');
    if (col === -1) throw new Error('"colors" column not found.');
    inv.sheet.getRange(rowIndex, col + 1).setValue(json);
    return ContentService.createTextOutput(JSON.stringify({ ok: true, rowIndex: rowIndex }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
`;
function callShadowed(fn, sheet, params) {
  let body = null;
  const ContentService = {
    MimeType: { JSON: 'application/json' },
    createTextOutput: t => ({ setMimeType: () => { body = t; } })
  };
  const sb = {
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }), flush() {} },
    ContentService, Logger: { log() {} },
    JSON, String, Object, Array, Number, Error, parseInt, parseFloat, isFinite, Date
  };
  const keys = Object.keys(sb);
  new Function(...keys, src + SHADOW + `\nreturn ${fn}(${JSON.stringify({ parameter: params || {} })});`)(...keys.map(k => sb[k]));
  return JSON.parse(body);
}

// First prove the shadow really does reproduce the original bug.
sh = makeSheet();
let shadowed = callShadowed('handleSaveColors', sh, { rowIndex: 2, json: NEW_COLORS });
ok('a shadowing old handler reproduces the original failure',
   shadowed.ok === false && /column not found/.test(shadowed.error), JSON.stringify(shadowed));

// Now the point: the endpoint must SEE it.
sh = makeSheet();
shadowed = callShadowed('handleInventoryVersion', sh, {});
ok('the endpoint detects the shadowed saveColors',
   shadowed.handlers.saveColors.usesHeaderIndex === false,
   JSON.stringify(shadowed.handlers.saveColors));
ok('and spots its bare indexOf', shadowed.handlers.saveColors.usesBareIndexOf === true);
ok('handlersAreCurrent goes false', shadowed.handlersAreCurrent === false);
ok('saveColors is named as stale', shadowed.staleHandlers.indexOf('saveColors') !== -1,
   String(shadowed.staleHandlers));
ok('the untouched handlers are NOT accused',
   shadowed.staleHandlers.length === 1, String(shadowed.staleHandlers));

// The headline boolean must not stay green while a handler is shadowed --
// this is the exact false-positive that sent us chasing a redeploy.
ok('writesWillWork goes false even though every column resolves',
   shadowed.writesWillWork === false && shadowed.missingColumns.length === 0,
   'writesWillWork=' + shadowed.writesWillWork + ' missing=' + shadowed.missingColumns);

console.log(fails ? `\n${fails} FAILED` : '\nAll passed');
process.exit(fails ? 1 : 0);
