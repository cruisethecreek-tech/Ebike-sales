/**
 * PriceRound.gs — drop the trailing cents from a brand's prices.
 *
 * Paste as a new file in the "Pricing and Orders" project. Stands alone —
 * it needs nothing from the other snippets except INV_SHEET_ID / INV_TAB_NAME.
 *
 *   step1_mokwheelDropCentsDryRun()   // lists every change, writes nothing
 *   step2_mokwheelDropCentsApply()    // writes them
 *
 *   dropCentsDryRun('Mooncool')       // any other brand
 *   dropCentsApply('Mooncool')
 *
 * WHY
 *
 * All 25 Mokwheel rows carry the vendor's .99 pricing — 1699.99, 2199.99,
 * 3299.99. The site renders whatever the sheet says: test-ride.html rewrites
 * every price from data/inventory.json on load, and so do the brand pages and
 * the shop grid. So "$1,699.99" on the page is the sheet talking, and the
 * sheet is the only place worth fixing it. Editing the HTML would last until
 * the next sync.
 *
 * TRUNCATES, DOES NOT ROUND
 *
 * 1699.99 becomes 1699, not 1700. That is the literal reading of "remove the
 * .99", and it is the safe direction: the price can only ever go down by
 * cents, never up. A customer is never quoted more than the sheet previously
 * said.
 *
 * This is a real price change, not a display tweak. Each bike drops by up to
 * $0.99 and the invoice generator will bill the new figure. That is the point
 * — the alternative, formatting the cents away on the page while still
 * charging them, shows one number and takes another.
 *
 * Only rows with a fractional price are touched. Whole-number prices, blank
 * prices, and every other brand are left exactly as they are. Run it twice
 * and the second run reports nothing to do.
 *
 * Afterwards run the sync-inventory Action, or the site keeps serving the old
 * numbers until the next scheduled run.
 */

var ROUND_VERSION = '2026-09-19a';

function dropCents(brandName, apply) {
  apply = apply === true;
  var want = String(brandName || '').trim().toLowerCase();
  if (!want) { Logger.log('Pass a brand name, e.g. dropCentsDryRun("Mokwheel").'); return { ok: false }; }

  var sh = SpreadsheetApp.openById(INV_SHEET_ID).getSheetByName(INV_TAB_NAME);
  if (!sh) { Logger.log('Tab "' + INV_TAB_NAME + '" not found.'); return { ok: false }; }

  var data = sh.getDataRange().getValues();
  var headers = data[0] || [];
  var col = {};
  headers.forEach(function (h, i) {
    var k = String(h || '').toLowerCase().replace(/\s*\(json\)/, '').replace(/[^a-z]/g, '');
    if (k) col[k] = i;
  });
  if (col.brand == null || col.name == null || col.price == null) {
    Logger.log('Sheet needs Brand, Name and Price columns. Found: ' + headers.join(' | '));
    return { ok: false };
  }

  Logger.log('=== Drop cents: ' + brandName + '  (PriceRound.gs ' + ROUND_VERSION + ') ===\n');

  var changes = [], alreadyWhole = 0, noPrice = 0;

  for (var r = 1; r < data.length; r++) {
    var brand = String(data[r][col.brand] || '').trim().toLowerCase();
    if (brand !== want) continue;

    var name = String(data[r][col.name] || '').trim();
    if (!name) continue;

    // Prices arrive as a number from a numeric cell and as a string from a
    // text one, sometimes carrying "$" or a thousands comma. Strip those
    // before parsing or "1,699.99" reads as 1.
    var raw = data[r][col.price];
    var num = (typeof raw === 'number')
      ? raw
      : parseFloat(String(raw == null ? '' : raw).replace(/[^0-9.\-]/g, ''));

    if (!isFinite(num) || num <= 0) { noPrice++; continue; }
    if (num % 1 === 0) { alreadyWhole++; continue; }

    changes.push({ rowIndex: r + 1, name: name, from: num, to: Math.floor(num) });
  }

  if (!changes.length) {
    Logger.log('Nothing to do. ' + alreadyWhole + ' row(s) already whole, ' +
               noPrice + ' with no usable price.');
    return { ok: true, changed: 0 };
  }

  Logger.log((apply ? 'CHANGING ' : 'WOULD CHANGE ') + changes.length + ':');
  var lost = 0;
  changes.forEach(function (c) {
    lost += c.from - c.to;
    Logger.log('  row ' + c.rowIndex + '  ' + c.name + '   ' + c.from + '  ->  ' + c.to);
  });
  Logger.log('\n  total reduction across all rows: $' + lost.toFixed(2));
  Logger.log('  left alone: ' + alreadyWhole + ' already whole, ' + noPrice + ' with no usable price');

  if (apply) {
    changes.forEach(function (c) {
      sh.getRange(c.rowIndex, col.price + 1).setValue(c.to);
    });
    Logger.log('\nWritten. Now run the sync-inventory Action so the site picks it up.');
  } else {
    Logger.log('\nDry run — nothing written. Re-run the Apply version to commit.');
  }

  return { ok: true, changed: apply ? changes.length : 0, wouldChange: changes.length };
}

function dropCentsDryRun(brandName) { return dropCents(brandName, false); }
function dropCentsApply(brandName)  { return dropCents(brandName, true); }

function step1_mokwheelDropCentsDryRun() { return dropCents('Mokwheel', false); }
function step2_mokwheelDropCentsApply()  { return dropCents('Mokwheel', true); }
