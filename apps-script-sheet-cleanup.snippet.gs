/**
 * SheetCleanup.gs — hide rows that are not bikes.
 *
 * Paste as a new file in the "Pricing and Orders" project. Needs BrandImport.gs
 * in the same project (it reuses that classifier, so the two can never drift).
 *
 *   cleanupInventoryDryRun()   // lists what it would hide, changes nothing
 *   cleanupInventoryApply()    // sets discontinued = "Yes" on those rows
 *
 * WHY
 *
 * The brand imports ran with a classifier that let accessories through, and
 * those rows were then published. As of the last sync 135 rows were live and
 * 50 of them were not bicycles: "Ebike Mirrors", "E-Bike Kickstand", "Jasion
 * Ebike Front Basket", "KastKing Rod and Reel Combo", "Thunder Pro*2", and a
 * row called "Test". Fixing the classifier stops the next import adding more;
 * it does nothing about what is already there. This is that second half.
 *
 * WHAT IT DOES AND DOES NOT DO
 *
 * It only ever SETS discontinued = "Yes". It never clears the flag, never
 * deletes a row, and never touches any other column. Hiding is reversible in
 * one keystroke and deleting is not, so if the classifier is wrong about a row
 * the cost is a bike missing from the site for an hour, not lost work.
 *
 * Read the dry run. A real bike in that list means the classifier is wrong and
 * I want to know before you apply it.
 *
 * Afterwards run the sync-inventory Action, or the site keeps serving the old
 * list until 6 AM UTC.
 */

var CLEAN_VERSION = '2026-09-16a';

function cleanupInventory(apply) {
  apply = apply === true;

  if (typeof _impIsAccessory_ !== 'function') {
    Logger.log('BrandImport.gs is not in this project — its classifier is what this uses.');
    return { ok: false };
  }

  var sh = SpreadsheetApp.openById(INV_SHEET_ID).getSheetByName(INV_TAB_NAME);
  if (!sh) { Logger.log('Tab "' + INV_TAB_NAME + '" not found.'); return { ok: false }; }

  var data = sh.getDataRange().getValues();
  var headers = data[0] || [];
  var col = {};
  headers.forEach(function (h, i) {
    var k = String(h || '').toLowerCase().replace(/\s*\(json\)/, '').replace(/[^a-z]/g, '');
    if (k) col[k] = i;
  });
  if (col.name == null || col.discontinued == null) {
    Logger.log('Sheet needs Name and Discontinued columns. Found: ' + headers.join(' | '));
    return { ok: false };
  }

  Logger.log('=== Inventory cleanup  (SheetCleanup.gs ' + CLEAN_VERSION + ') ===\n');

  var toHide = [], alreadyHidden = 0, kept = 0;

  for (var r = 1; r < data.length; r++) {
    var name = String(data[r][col.name] || '').trim();
    if (!name) continue;
    var brand = col.brand == null ? '' : String(data[r][col.brand] || '').trim();
    var disc  = String(data[r][col.discontinued] || '').trim().toLowerCase();

    if (!_impIsAccessory_(name)) { kept++; continue; }
    if (disc === 'yes') { alreadyHidden++; continue; }

    toHide.push({ rowIndex: r + 1, brand: brand, name: name });
  }

  if (toHide.length) {
    Logger.log((apply ? 'HIDING ' : 'WOULD HIDE ') + toHide.length + ':');
    toHide.forEach(function (t) {
      Logger.log('  row ' + String(t.rowIndex).padStart(3) + '  ' + t.brand + '  —  ' + t.name);
    });
    Logger.log('');
  }

  Logger.log('rows scanned      : ' + (data.length - 1));
  Logger.log('  look like bikes : ' + kept);
  Logger.log('  already hidden  : ' + alreadyHidden);
  Logger.log('  to hide now     : ' + toHide.length);

  if (!apply) {
    Logger.log('\nDry run. Nothing written.');
    Logger.log('Read the list above. A real bike in it means the classifier is wrong —');
    Logger.log('say so before applying, because the fix belongs in BrandImport.gs.');
    return { ok: true, applied: false, toHide: toHide };
  }

  toHide.forEach(function (t) {
    sh.getRange(t.rowIndex, col.discontinued + 1).setValue('Yes');
  });
  SpreadsheetApp.flush();

  Logger.log('\nHid ' + toHide.length + ' row(s). Nothing was deleted — clear the');
  Logger.log('Discontinued cell to bring any of them back.');
  Logger.log('Now run the sync-inventory GitHub Action so the site catches up.');
  return { ok: true, applied: true, toHide: toHide };
}

function cleanupInventoryDryRun() { return cleanupInventory(false); }
function cleanupInventoryApply()  { return cleanupInventory(true); }

/**
 * auditDiscontinuedColumn — why a row you marked "Yes" is still on the site.
 *
 * getBikeInventory hides a row only when its Discontinued cell, trimmed and
 * lowercased, is exactly "yes" or "true". Anything else — "Y", "1", "N/A",
 * "Discontinued", a checkbox left unticked, a cell holding a formula that
 * returns a blank — reads as "still for sale", and nothing anywhere says so.
 *
 * This lists every distinct value in that column with a count, marks which
 * ones actually hide a row, and then names the rows using an unrecognised
 * value. Run it and the answer is usually obvious in the first three lines.
 */
function auditDiscontinuedColumn() {
  var sh = SpreadsheetApp.openById(INV_SHEET_ID).getSheetByName(INV_TAB_NAME);
  if (!sh) { Logger.log('Tab "' + INV_TAB_NAME + '" not found.'); return { ok: false }; }

  var data = sh.getDataRange().getValues();
  var headers = data[0] || [];
  var col = {};
  headers.forEach(function (h, i) {
    var k = String(h || '').toLowerCase().replace(/\s*\(json\)/, '').replace(/[^a-z]/g, '');
    if (k) col[k] = i;
  });
  if (col.discontinued == null) {
    Logger.log('No Discontinued column found. Headers: ' + headers.join(' | '));
    Logger.log('The header must normalise to "discontinued" — that is how every');
    Logger.log('reader finds it. If yours is spelled differently, NOTHING is ever');
    Logger.log('hidden, whatever you type in it.');
    return { ok: false };
  }
  if (col.name == null) { Logger.log('No Name column found.'); return { ok: false }; }

  var counts = {}, odd = [], hidden = 0;
  for (var r = 1; r < data.length; r++) {
    var name = String(data[r][col.name] || '').trim();
    if (!name) continue;
    var raw = data[r][col.discontinued];
    var shown = JSON.stringify(raw);                 // exposes spaces and type
    counts[shown] = (counts[shown] || 0) + 1;

    var norm = String(raw == null ? '' : raw).trim().toLowerCase();
    if (norm === 'yes' || norm === 'true') { hidden++; continue; }
    if (norm !== '' && norm !== 'no' && norm !== 'false') {
      odd.push({ row: r + 1, name: name, value: shown });
    }
  }

  Logger.log('=== Discontinued column  (SheetCleanup.gs ' + CLEAN_VERSION + ') ===');
  Logger.log('Column ' + String.fromCharCode(65 + col.discontinued) +
             ', header "' + headers[col.discontinued] + '"\n');
  Logger.log('Values present (exact, quotes show stray spaces):');
  Object.keys(counts).sort().forEach(function (v) {
    var n = String(v).replace(/^"|"$/g, '').trim().toLowerCase();
    var hides = (n === 'yes' || n === 'true');
    Logger.log('  ' + v + '  x' + counts[v] + (hides ? '   -> HIDES the row' : '   -> row stays visible'));
  });

  Logger.log('\n' + hidden + ' row(s) are hidden from the site.');

  if (odd.length) {
    Logger.log('\nRows with a value that is neither yes/true nor no/blank (' + odd.length + ').');
    Logger.log('These are all VISIBLE on the site:');
    odd.forEach(function (o) {
      Logger.log('  row ' + o.row + '  ' + o.name + '  = ' + o.value);
    });
    Logger.log('Set them to exactly Yes to hide them.');
  }

  Logger.log('\nIf the value already reads "Yes" and the bike is still on the');
  Logger.log('site, the sheet is right and the site is stale — run the');
  Logger.log('sync-inventory Action.');
  return { ok: true, hidden: hidden, odd: odd };
}
