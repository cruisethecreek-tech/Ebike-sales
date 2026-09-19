/**
 * PriceRound.gs — drop the trailing cents from a brand's prices.
 *
 * Paste as a new file in the "Pricing and Orders" project. Stands alone —
 * it needs nothing from the other snippets except INV_SHEET_ID / INV_TAB_NAME.
 *
 *   step1_dropCentsEverywhereDryRun()   // every brand — lists, writes nothing
 *   step2_dropCentsEverywhereApply()    // every brand — writes them
 *
 *   dropCentsDryRun('Mokwheel')         // one brand at a time, if preferred
 *   dropCentsApply('Mokwheel')
 *
 * WHY
 *
 * All 25 Mokwheel rows carry the vendor's .99 pricing — 1699.99, 2199.99,
 * 3299.99 — and one Mooncool row does too. The site renders whatever the
 * sheet says: test-ride.html rewrites every price from data/inventory.json on
 * load, and so do the brand pages and the shop grid. So "$1,699.99" on the
 * page is the sheet talking, and the sheet is the only place worth fixing it.
 * Editing the HTML would last until the next sync.
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
 * Only rows with a fractional price are touched. Whole-number prices and
 * blank prices are left exactly as they are, so running the everywhere
 * version is not a blanket rewrite — as of writing it moves 26 rows out of
 * 67 and leaves the other 41 alone. Run it twice and the second run reports
 * nothing to do.
 *
 * There is deliberately no way to sweep every brand by forgetting an
 * argument: dropCents() demands a brand name and the all-brands pass is its
 * own named function, so a slip of the hand cannot reprice the catalogue.
 *
 * Afterwards run the sync-inventory Action, or the site keeps serving the old
 * numbers until the next scheduled run.
 */

var ROUND_VERSION = '2026-09-19b';

function _dropCents_(wantBrand, label, apply) {
  apply = apply === true;

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

  Logger.log('=== Drop cents: ' + label + '  (PriceRound.gs ' + ROUND_VERSION + ') ===\n');

  var changes = [], alreadyWhole = 0, noPrice = 0, otherBrand = 0;

  for (var r = 1; r < data.length; r++) {
    var brand = String(data[r][col.brand] || '').trim();
    // wantBrand === null is the explicit all-brands pass.
    if (wantBrand !== null && brand.toLowerCase() !== wantBrand) { otherBrand++; continue; }

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

    changes.push({ rowIndex: r + 1, brand: brand, name: name, from: num, to: Math.floor(num) });
  }

  if (!changes.length) {
    Logger.log('Nothing to do. ' + alreadyWhole + ' row(s) already whole, ' +
               noPrice + ' with no usable price' +
               (wantBrand === null ? '' : ', ' + otherBrand + ' on another brand') + '.');
    return { ok: true, changed: 0 };
  }

  Logger.log((apply ? 'CHANGING ' : 'WOULD CHANGE ') + changes.length + ':');
  var lost = 0, perBrand = {};
  changes.forEach(function (c) {
    lost += c.from - c.to;
    perBrand[c.brand] = (perBrand[c.brand] || 0) + 1;
    Logger.log('  row ' + c.rowIndex + '  ' + (c.brand ? c.brand + ' ' : '') + c.name +
               '   ' + c.from + '  ->  ' + c.to);
  });

  if (wantBrand === null) {
    Logger.log('\n  by brand:');
    Object.keys(perBrand).sort().forEach(function (b) {
      Logger.log('    ' + (b || '(no brand)') + ': ' + perBrand[b]);
    });
  }

  Logger.log('\n  total reduction across all rows: $' + lost.toFixed(2));
  Logger.log('  left alone: ' + alreadyWhole + ' already whole, ' + noPrice +
             ' with no usable price' +
             (wantBrand === null ? '' : ', ' + otherBrand + ' on another brand'));

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

/**
 * One brand. The name is required — calling this with nothing does NOT quietly
 * fall through to every brand, because repricing the whole catalogue should
 * never be something you can do by forgetting an argument.
 */
function dropCents(brandName, apply) {
  var want = String(brandName || '').trim();
  if (!want) {
    Logger.log('Pass a brand name, e.g. dropCentsDryRun("Mokwheel").');
    Logger.log('For every brand at once use step1_dropCentsEverywhereDryRun().');
    return { ok: false };
  }
  return _dropCents_(want.toLowerCase(), want, apply);
}

function dropCentsDryRun(brandName) { return dropCents(brandName, false); }
function dropCentsApply(brandName)  { return dropCents(brandName, true); }

/** Every brand in the sheet. */
function dropCentsEverywhere(apply) { return _dropCents_(null, 'every brand', apply); }

function step1_dropCentsEverywhereDryRun() { return dropCentsEverywhere(false); }
function step2_dropCentsEverywhereApply()  { return dropCentsEverywhere(true); }

function step1_mokwheelDropCentsDryRun() { return dropCents('Mokwheel', false); }
function step2_mokwheelDropCentsApply()  { return dropCents('Mokwheel', true); }
