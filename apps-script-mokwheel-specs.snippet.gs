/**
 * MokwheelSpecs.gs — hand-checked spec table for the Mokwheel lineup.
 *
 * WHY THIS EXISTS
 *
 * fillBrandSpecs() reads specs out of a vendor's product description. For
 * Mokwheel that does not work: 19 of 25 models have nothing readable in
 * body_html at all, and of the handful that did parse, the Basalt reported an
 * 1100W motor — its peak figure, not its 750W rating. A number that overstates
 * a bike is worse than a blank cell, because staff quote it to buyers.
 *
 * So these values were read off Mokwheel's own product and comparison pages and
 * written down here. Every entry carries the page it came from. Nothing in this
 * file was inferred, averaged, or filled in by pattern.
 *
 * BEFORE YOU TRUST A ROW
 *
 * Vendors revise specs between model years without renaming the product. Open
 * the src URL and check the four numbers whenever a model matters — especially
 * the ones marked 'check' in notes, where Mokwheel's own pages disagree with
 * each other.
 *
 * Run:
 *   step5_mokwheelSpecsFromTableDryRun()   // log only, writes nothing
 *   step5_mokwheelSpecsFromTableApply()    // writes empty Specs cells
 *
 * It only ever fills a Specs cell that is empty. It will not overwrite a value
 * you typed by hand.
 */

var MOK_VERSION = '2026-09-15e';

// Battery is written as V x Ah in watt-hours, matching the existing rows
// ("705.6WH"). Mokwheel quotes the pack as V and Ah; the Wh figure on their
// page is sometimes rounded, so the arithmetic is shown in each comment.
var MOKWHEEL_SPECS = {
  // --- Basalt: 48V 19.6Ah = 940.8Wh ------------------------------------
  'Basalt Ebike': {
    Range: '60-80 mi', 'Top Speed': '28 mph', Motor: '750W / 1100W peak', Battery: '940.8WH',
    src: 'https://www.mokwheel.com/products/basalt' },
  'Basalt ST Ebike': {
    Range: '60-80 mi', 'Top Speed': '28 mph', Motor: '750W / 1100W peak', Battery: '940.8WH',
    src: 'https://www.mokwheel.com/products/basalt-st' },
  'Basalt 2.0 Ebike': {
    Range: '60-80 mi', 'Top Speed': '28 mph', Motor: '1000W / 1100W peak', Battery: '940.8WH',
    src: 'https://www.mokwheel.com/products/basalt-2-0' },
  'Basalt ST 2.0 Ebike': {
    Range: '60-80 mi', 'Top Speed': '28 mph', Motor: '1000W / 1100W peak', Battery: '940.8WH',
    src: 'https://www.mokwheel.com/products/basalt-st-2-0-s' },

  // --- Scoria: 48V 19.6Ah = 940.8Wh ------------------------------------
  'Scoria 2.0 Ebike': {
    Range: '60-80 mi', 'Top Speed': '28 mph', Motor: '750W / 1100W peak', Battery: '940.8WH',
    src: 'https://www.mokwheel.com/products/scoria-2-0' },

  // --- Obsidian, full suspension: 48V 19.6Ah = 940.8Wh -----------------
  // Mokwheel publishes three numbers for this motor: rated 750W, continuous
  // 1000W, peak 1300W. The first pass of this table used 1000W as the rating,
  // which is the same overstatement the Basalt's 1100W was — a continuous or
  // peak figure standing in for the rated one. Rated power is what goes here,
  // consistently with the Basalt and Tarmac entries.
  'Obsidian Ebike': {
    Range: '60-80 mi', 'Top Speed': '28 mph', Motor: '750W / 1300W peak', Battery: '940.8WH',
    src: 'https://www.mokwheel.com/products/obsidian' },
  'Obsidian ST Ebike': {
    Range: '60-80 mi', 'Top Speed': '28 mph', Motor: '750W / 1300W peak', Battery: '940.8WH',
    src: 'https://www.mokwheel.com/products/obsidian-st' },

  // The 2.0s keep the 750W rear-hub layout and the 48V 19.6Ah pack, and raise
  // torque to 105Nm+. Their speed spec is genuinely different from the 1.0:
  // Mokwheel ships them at 20 mph by default, rider-adjustable 15-28 mph. That
  // is worth saying out loud on the floor — a customer who reads "28 mph" and
  // takes delivery of a 20 mph bike will think something is broken.
  'Obsidian 2.0 Ebike': {
    Range: '60-80 mi', 'Top Speed': '20-28 mph (adjustable)', Motor: '750W / 1300W peak',
    Battery: '940.8WH',
    notes: 'ships at 20 mph by default, adjustable 15-28 mph in custom mode',
    src: 'https://www.mokwheel.com/products/obsidian-2-0' },
  'Obsidian ST 2.0 Ebike': {
    Range: '60-80 mi', 'Top Speed': '20-28 mph (adjustable)', Motor: '750W / 1300W peak',
    Battery: '940.8WH',
    notes: 'ships at 20 mph by default, adjustable 15-28 mph in custom mode',
    src: 'https://www.mokwheel.com/products/obsidian-st-2-0' },

  // --- Onyx, mid-drive: 750W rated / 1300W peak, 210Nm+. 48V 19.6Ah = 940.8Wh.
  // The product page omits a top speed, so this was left blank on the first
  // pass; Mokwheel lists the Onyx in its 28 MPH collection, which is the
  // vendor stating it directly rather than us inferring it from the lineup.
  'Onyx Ebike': {
    Range: '60-80 mi', 'Top Speed': '28 mph', Motor: '750W / 1300W peak', Battery: '940.8WH',
    src: 'https://www.mokwheel.com/collections/28-mph-electric-bike' },
  'Onyx ST Ebike': {
    Range: '60-80 mi', 'Top Speed': '28 mph', Motor: '750W / 1300W peak', Battery: '940.8WH',
    src: 'https://www.mokwheel.com/collections/28-mph-electric-bike' },

  // --- Tarmac commuter: 48V 15Ah = 720Wh -------------------------------
  'Tarmac Ebike': {
    Range: '60 mi', 'Top Speed': '28 mph', Motor: '750W / 920W peak', Battery: '720WH',
    src: 'https://www.mokwheel.com/products/tarmac' },
  'Tarmac ST Ebike': {
    Range: '60 mi', 'Top Speed': '28 mph', Motor: '750W / 920W peak', Battery: '720WH',
    src: 'https://www.mokwheel.com/products/tarmac-st' },

  // --- Asphalt cruiser: 48V 14.7Ah = 705.6Wh ---------------------------
  'Asphalt Ebike': {
    Range: '50-60 mi', 'Top Speed': '28 mph', Motor: '500W / 860W peak', Battery: '705.6WH',
    src: 'https://www.mokwheel.com/products/asphalt' },
  'Asphalt ST Ebike': {
    Range: '50-60 mi', 'Top Speed': '28 mph', Motor: '500W / 860W peak', Battery: '705.6WH',
    src: 'https://www.mokwheel.com/products/asphalt-st' },

  // --- Mesa Lite: 36V 14.7Ah = 529.2Wh. Mokwheel's copy also says "750Wh"
  // somewhere, which cannot both be true — 36 x 14.7 is 529.2. The V x Ah
  // figures are the ones printed on the pack, so those are used here.
  'Mesa Lite Ebike': {
    Range: '40-50 mi', 'Top Speed': '28 mph', Motor: '350W / 600W peak', Battery: '529.2WH',
    notes: 'check: vendor copy also quotes 750Wh, which contradicts 36V x 14.7Ah',
    src: 'https://www.mokwheel.com/products/new-mesa-lite' },
  'Mesa Lite ST Ebike': {
    Range: '40-50 mi', 'Top Speed': '28 mph', Motor: '350W / 600W peak', Battery: '529.2WH',
    notes: 'check: vendor copy also quotes 750Wh, which contradicts 36V x 14.7Ah',
    src: 'https://www.mokwheel.com/products/new-mesa-lite-st' },

  // --- Mesa Plus ST: 48V 16Ah = 768Wh. Same rounding disagreement.
  'Mesa Plus ST Ebike': {
    Range: '60 mi', 'Top Speed': '28 mph', Motor: '750W / 1100W peak', Battery: '768WH',
    notes: 'check: vendor quotes 750Wh for a 48V x 16Ah pack; a review reports 35-55 mi',
    src: 'https://www.mokwheel.com/products/mesa-plus-st' },

  // --- Tor Plus: 48V 16Ah = 768Wh --------------------------------------
  'Tor Plus Ebike': {
    Range: '50-60 mi', 'Top Speed': '28 mph', Motor: '750W / 1100W peak', Battery: '768WH',
    src: 'https://www.mokwheel.com/products/tor-plus' },

  // --- FLINT lightweight commuters: 36V 10Ah = 360Wh -------------------
  // The importer's own reading of these two pages found 350W and 250W, which
  // matches Mokwheel's copy — the chain-drive FLINT is 350W, the belt-drive
  // PRO is 250W. The PRO is not a weaker mistake, it is a lighter bike.
  'FLINT Ebike': {
    Range: '60 mi', 'Top Speed': '28 mph', Motor: '350W / 550W peak', Battery: '360WH',
    src: 'https://www.mokwheel.com/products/flint' },
  'FLINT ST Ebike': {
    Range: '60 mi', 'Top Speed': '28 mph', Motor: '350W / 550W peak', Battery: '360WH',
    src: 'https://www.mokwheel.com/products/flint-st' },
  'FLINT PRO Ebike': {
    Range: '60 mi', 'Top Speed': '28 mph', Motor: '250W', Battery: '360WH',
    src: 'https://www.mokwheel.com/products/flint-pro' },
  'FLINT PRO ST Ebike': {
    Range: '60 mi', 'Top Speed': '28 mph', Motor: '250W', Battery: '360WH',
    src: 'https://www.mokwheel.com/products/flint-pro-st' },

  // --- Granite cargo trike: 48V 15Ah = 720Wh. Class 2, so 20 mph, not 28.
  'Granite E-Trike': {
    Range: '45-55 mi', 'Top Speed': '20 mph', Motor: '500W / 1092W peak', Battery: '720WH',
    src: 'https://www.mokwheel.com/products/granite' },

  // --- Slate folder: 48V 15Ah = 720Wh. No peak figure published.
  'Slate Ebike': {
    Range: '60 mi', 'Top Speed': '28 mph', Motor: '500W', Battery: '720WH',
    src: 'https://www.mokwheel.com/products/slate' },
};

/**
 * Models whose Specs cell an earlier version of this table got wrong, and which
 * step7 is allowed to overwrite rather than skip.
 *
 * The normal fill refuses to touch a non-empty cell, which is the right default
 * — it protects anything typed by hand. But that also means a correction made
 * here can never reach a row that was already written, and a wrong motor rating
 * sitting in the sheet is worse than one that was never written at all.
 *
 * So: an explicit, named list. Remove a name once its row is correct. Never add
 * a name to force a bulk rewrite — that is how hand-entered work gets lost.
 */
var MOK_RECHECK = [
  'Obsidian Ebike',      // was 1000W / 1300W peak — 1000W is the continuous figure
  'Obsidian ST Ebike',   // same
  'Onyx Ebike',          // was written with no Top Speed
  'Onyx ST Ebike',       // same
];

var MOK_FIELDS = ['Range', 'Top Speed', 'Motor', 'Battery'];

function _mokNorm_(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Write the table above into empty Specs (JSON) cells.
 * Pass true to actually write; anything else is a dry run.
 */
function fillMokwheelSpecsFromTable(apply) {
  apply = apply === true;

  var sh = SpreadsheetApp.openById(INV_SHEET_ID).getSheetByName(INV_TAB_NAME);
  if (!sh) {
    Logger.log('Tab "' + INV_TAB_NAME + '" not found in spreadsheet ' + INV_SHEET_ID + '.');
    return { ok: false };
  }

  var data = sh.getDataRange().getValues();
  var headers = data[0] || [];
  var col = {};
  headers.forEach(function (h, i) {
    var k = String(h || '').toLowerCase().replace(/\s*\(json\)/, '').replace(/[^a-z]/g, '');
    if (k) col[k] = i;
  });
  if (col.brand == null || col.name == null || col.specs == null) {
    Logger.log('Sheet needs Brand, Name and Specs columns. Found: ' + headers.join(' | '));
    return { ok: false };
  }

  var byName = {};
  Object.keys(MOKWHEEL_SPECS).forEach(function (k) { byName[_mokNorm_(k)] = MOKWHEEL_SPECS[k]; });

  var toWrite = [], already = [], noEntry = [], used = {};

  for (var r = 1; r < data.length; r++) {
    if (_mokNorm_(data[r][col.brand]) !== 'mokwheel') continue;
    var title = String(data[r][col.name] || '').trim();
    var entry = byName[_mokNorm_(title)];
    if (!entry) { noEntry.push(title); continue; }
    used[_mokNorm_(title)] = true;
    if (String(data[r][col.specs] || '').trim()) { already.push(title); continue; }

    // Only keys with a value. A blank spec line renders as a broken row.
    var specs = {};
    MOK_FIELDS.forEach(function (f) { if (entry[f]) specs[f] = entry[f]; });
    toWrite.push({ rowIndex: r + 1, title: title, specs: specs, entry: entry });
  }

  Logger.log('=== Mokwheel specs from the hand-checked table  (MokwheelSpecs.gs ' +
             MOK_VERSION + ') ===');
  Logger.log((data.length - 1) + ' sheet rows scanned.\n');

  if (toWrite.length) {
    Logger.log((apply ? 'WRITING ' : 'WOULD WRITE ') + toWrite.length + ':');
    toWrite.forEach(function (w) {
      Logger.log('  ' + w.title);
      Logger.log('      ' + JSON.stringify(w.specs));
      Logger.log('      src: ' + w.entry.src);
      if (w.entry.notes) Logger.log('      NOTE: ' + w.entry.notes);
    });
  }
  if (already.length) {
    Logger.log('\nAlready had specs, left alone (' + already.length + '):');
    already.forEach(function (t) { Logger.log('  ' + t); });
  }
  if (noEntry.length) {
    Logger.log('\nNo entry in the table (' + noEntry.length + ') — fill by hand:');
    noEntry.forEach(function (t) { Logger.log('  ' + t); });
  }
  var unused = Object.keys(MOKWHEEL_SPECS).filter(function (k) { return !used[_mokNorm_(k)]; });
  if (unused.length) {
    Logger.log('\nIn the table but not in the sheet (' + unused.length + ') — renamed, or not stocked:');
    unused.forEach(function (t) { Logger.log('  ' + t); });
  }

  if (!apply) {
    Logger.log('\nDry run. Nothing written.');
    return { ok: true, applied: false, toWrite: toWrite, noEntry: noEntry };
  }

  toWrite.forEach(function (w) {
    sh.getRange(w.rowIndex, col.specs + 1).setValue(JSON.stringify(w.specs));
  });
  SpreadsheetApp.flush();

  Logger.log('\nWrote specs for ' + toWrite.length + ' row(s).');
  Logger.log('Rows stay hidden until you clear discontinued — the colour hex');
  Logger.log('codes still need a human, and blank hexes render as empty swatches.');
  return { ok: true, applied: true, toWrite: toWrite, noEntry: noEntry };
}

/** Step 5 — read the log, change nothing. */
function step5_mokwheelSpecsFromTableDryRun() {
  return fillMokwheelSpecsFromTable(false);
}

/** Step 6 — write the table into empty Specs cells. */
function step6_mokwheelSpecsFromTableApply() {
  return fillMokwheelSpecsFromTable(true);
}

/**
 * Step 7 — overwrite only the rows named in MOK_RECHECK, then run the normal
 * fill. Every other row with a value in Specs is left exactly as it is.
 */
function step7_mokwheelSpecsFixCorrectedRows() {
  var sh = SpreadsheetApp.openById(INV_SHEET_ID).getSheetByName(INV_TAB_NAME);
  if (!sh) {
    Logger.log('Tab "' + INV_TAB_NAME + '" not found in spreadsheet ' + INV_SHEET_ID + '.');
    return { ok: false };
  }
  var data = sh.getDataRange().getValues();
  var headers = data[0] || [];
  var col = {};
  headers.forEach(function (h, i) {
    var k = String(h || '').toLowerCase().replace(/\s*\(json\)/, '').replace(/[^a-z]/g, '');
    if (k) col[k] = i;
  });
  if (col.name == null || col.specs == null) {
    Logger.log('Sheet needs Name and Specs columns. Found: ' + headers.join(' | '));
    return { ok: false };
  }

  var recheck = {};
  MOK_RECHECK.forEach(function (n) { recheck[_mokNorm_(n)] = true; });

  Logger.log('=== Clearing ' + MOK_RECHECK.length + ' corrected row(s)  (MokwheelSpecs.gs ' +
             MOK_VERSION + ') ===');
  var cleared = 0;
  for (var r = 1; r < data.length; r++) {
    var title = String(data[r][col.name] || '').trim();
    if (!recheck[_mokNorm_(title)]) continue;
    var before = String(data[r][col.specs] || '').trim();
    if (!before) { Logger.log('  ' + title + ' — already empty'); continue; }
    Logger.log('  ' + title);
    Logger.log('      was: ' + before);
    sh.getRange(r + 1, col.specs + 1).setValue('');
    cleared++;
  }
  SpreadsheetApp.flush();
  Logger.log('Cleared ' + cleared + ' cell(s). Refilling from the table:\n');

  return fillMokwheelSpecsFromTable(true);
}
