/**
 * SpecFixes.gs — corrections to specific Specs (JSON) cells.
 *
 * Paste as a new file in the "Pricing and Orders" Apps Script project, then:
 *
 *   fixSpecsDryRun()    // prints before/after, writes nothing
 *   fixSpecsApply()     // writes
 *
 * WHY THIS IS SEPARATE FROM MokwheelSpecs.gs
 *
 * That file only ever fills an EMPTY cell, so it can never correct a value
 * already in the sheet. Every entry below is a cell that has a value and the
 * value is wrong or incomplete. Overwriting is the whole point, which is why
 * it is a short, explicit, hand-written list rather than anything automatic:
 * each row names the cell, the reason, and the vendor page it came from.
 *
 * Remove an entry once its row is right. Do not grow this into a bulk
 * rewriter — the sheet is where hand-entered work lives.
 */

var FIX_VERSION = '2026-09-15a';

var SPEC_FIXES = [
  {
    brand: 'Mooncool', name: 'TK2Pro',
    why: 'row carried a copy of the TK1 specs — 500W / 696WH / 70 mi / 16 mph. '
       + 'The TK2 PRO is a 750W helical-gear drive (1310W peak, 90Nm) on a '
       + '48V 20Ah pack = 960Wh, 45-75 mi, 15.5 mph. Weight is dropped rather '
       + 'than kept: the 89 lbs in the cell was the TK1 figure too, and Mooncool '
       + 'does not publish one for this model.',
    src: 'https://www.mooncool.com/products/tk2-pro-electric-trike',
    specs: {
      'Range': '45-75 mi', 'Top Speed': '15 mph',
      'Motor': '750W / 1310W peak', 'Battery': '960WH', 'Torque': '90 NM'
    }
  },
  {
    brand: 'Mooncool', name: 'CD1 Youth Trike',
    why: 'battery read 696WH, which is the TK1 pack. The CD1 runs 24V x 10.4Ah '
       + '= 249.6Wh — the cell overstated a childrens trike by nearly 3x. '
       + 'Everything else on the row matches Mooncool and is kept.',
    src: 'https://www.mooncool.com/products/cd1-electric-youth-trike',
    specs: {
      'Range': '35 mi', 'Top Speed': '12 mph',
      'Motor': '250W', 'Battery': '249.6WH', 'Weight': '55 lbs'
    }
  },
  {
    brand: 'Heybike', name: 'Hybrid',
    why: 'the only row on the site with no Top Speed. Heybike publishes 28 mph. '
       + 'Existing values are kept as they are.',
    src: 'https://www.heybike.com/products/hybrid',
    specs: {
      'Range': '100 mi', 'Top Speed': '28 mph', 'Motor': '750W',
      'Battery': '864WH', 'Torque': '75 NM', 'Weight': '69 lbs'
    }
  }
];

/** Same tolerance as salespro: the sheet's Name may carry an "Ebike" suffix. */
function _fixNorm_(n) {
  return String(n || '').toLowerCase()
    .replace(/\s*e[\s-]?bike\s*$/, '').replace(/\s+/g, ' ').trim();
}

function fixSpecs(apply) {
  apply = apply === true;

  var sh = SpreadsheetApp.openById(INV_SHEET_ID).getSheetByName(INV_TAB_NAME);
  if (!sh) {
    Logger.log('Tab "' + INV_TAB_NAME + '" not found in ' + INV_SHEET_ID + '.');
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

  Logger.log('=== Spec corrections  (SpecFixes.gs ' + FIX_VERSION + ') ===\n');

  var applied = [], notFound = [];

  SPEC_FIXES.forEach(function (fix) {
    var rowIndex = -1;
    for (var r = 1; r < data.length; r++) {
      if (_fixNorm_(data[r][col.brand]) === _fixNorm_(fix.brand) &&
          _fixNorm_(data[r][col.name])  === _fixNorm_(fix.name)) { rowIndex = r; break; }
    }
    if (rowIndex === -1) { notFound.push(fix.brand + ' ' + fix.name); return; }

    var before = String(data[rowIndex][col.specs] || '').trim();
    var after  = JSON.stringify(fix.specs);

    Logger.log(fix.brand + ' ' + fix.name + '  (row ' + (rowIndex + 1) + ')');
    Logger.log('   why:    ' + fix.why);
    Logger.log('   src:    ' + fix.src);
    Logger.log('   before: ' + (before || '(empty)'));
    Logger.log('   after:  ' + after);
    if (before === after) { Logger.log('   -> already correct, skipping\n'); return; }
    Logger.log('');

    if (apply) sh.getRange(rowIndex + 1, col.specs + 1).setValue(after);
    applied.push(fix.brand + ' ' + fix.name);
  });

  if (notFound.length) {
    Logger.log('NOT FOUND in the sheet (' + notFound.length + ') — renamed?');
    notFound.forEach(function (t) { Logger.log('  ' + t); });
  }

  if (!apply) {
    Logger.log('\nDry run. Nothing written. ' + applied.length + ' row(s) would change.');
    return { ok: true, applied: false, rows: applied, notFound: notFound };
  }

  SpreadsheetApp.flush();
  Logger.log('\nWrote ' + applied.length + ' row(s).');
  Logger.log('Run the sync-inventory GitHub Action afterwards, or the site keeps');
  Logger.log('serving the old numbers until 6 AM UTC.');
  return { ok: true, applied: true, rows: applied, notFound: notFound };
}

/** Read the log, change nothing. */
function fixSpecsDryRun() { return fixSpecs(false); }

/** Write the corrections. */
function fixSpecsApply()  { return fixSpecs(true); }
