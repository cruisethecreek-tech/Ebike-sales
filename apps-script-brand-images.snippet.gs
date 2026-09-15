/**
 * BrandImages.gs — repoint colour-swatch images at the vendor's own CDN.
 *
 * WHY
 *
 * Mokwheel's rows came in from the vendor's product feed, so every swatch
 * points at cdn.shopify.com and nobody had to upload anything. The four older
 * brands were built up by hand, and it shows:
 *
 *   - 7 swatches point at files that are not in the repo, so they render broken
 *   - 19 still point at static.wixstatic.com, left over from the old Wix site
 *   - the rest are repo-relative uploads that have to be redone by hand
 *     whenever a vendor changes a photo
 *
 * This reads each brand's /products.json, finds the image the vendor uses for
 * each colour, and rewrites ONLY the `img` field.
 *
 * WHAT IT WILL NOT DO
 *
 * It never touches name, hex, price or soldOut — those are hand-curated on
 * these four brands and worth more than the images are. It never blanks an
 * image: a swatch the vendor has no match for keeps exactly what it has and is
 * listed in the log. It never adds or removes a swatch, and never changes the
 * shape of the Colors JSON.
 *
 * Run one brand at a time, read the dry run, then apply:
 *
 *   step1_heybikeImagesDryRun()   /  step2_heybikeImagesApply()
 *   step1_velotricImagesDryRun()  /  step2_velotricImagesApply()
 *   step1_jasionImagesDryRun()    /  step2_jasionImagesApply()
 *   step1_mooncoolImagesDryRun()  /  step2_mooncoolImagesApply()
 *
 * Spot-check a few in the sheet before running the next brand. A colour-name
 * mismatch puts the wrong photo on a bike, which is worse than a broken one.
 *
 * Afterwards, run the sync-inventory GitHub Action or the site keeps serving
 * the old images until 6 AM UTC.
 */

var BIMG_VERSION = '2026-09-15a';

/** Lowercase, strip punctuation. "Alpine Blue" and "alpine-blue" match. */
function _bimgNorm_(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** The sheet's Name may carry a vendor "Ebike" suffix; product titles vary. */
function _bimgNormTitle_(s) {
  return _bimgNorm_(String(s == null ? '' : s).replace(/\s*e[\s-]?bike\s*$/i, ''));
}

/**
 * Colour name -> image URL, taken from the vendor's own variants.
 *
 * Shopify puts the colour on whichever option is named "Color"/"Colour"; when
 * there is no such option the variant title carries it. A variant's
 * featured_image is the photo the vendor shows when that colour is selected,
 * which is exactly what a swatch should point at. Variants with no featured
 * image are skipped rather than falling back to the product's first photo —
 * every colour would then get the same picture, which looks deliberate and is
 * wrong.
 */
function _bimgVariantImages_(product) {
  var optIdx = -1;
  (product.options || []).forEach(function (o, i) {
    if (optIdx === -1 && /colou?r/i.test(String(o.name || ''))) optIdx = i;
  });

  var map = {};
  (product.variants || []).forEach(function (v) {
    var label = optIdx === -1
      ? String(v.title || '').trim()
      : String(v['option' + (optIdx + 1)] || '').trim();
    if (!label || label.toLowerCase() === 'default title') return;
    var src = v.featured_image && v.featured_image.src;
    if (!src) return;
    var k = _bimgNorm_(label);
    if (!map[k]) map[k] = src;
  });
  return map;
}

/**
 * Visit every swatch in a Colors JSON object, whatever its depth.
 * Shapes seen in this sheet: {style:{size:[sw]}} and {style:[sw]}. Booleans
 * appear as size values on some rows and must be stepped over.
 */
function _bimgWalkSwatches_(node, fn) {
  if (Array.isArray(node)) {
    node.forEach(function (sw) { if (sw && typeof sw === 'object' && 'name' in sw) fn(sw); });
    return;
  }
  if (node && typeof node === 'object') {
    Object.keys(node).forEach(function (k) {
      var v = node[k];
      if (typeof v === 'boolean') return;
      _bimgWalkSwatches_(v, fn);
    });
  }
}

/**
 * Find the vendor image for a swatch name. Exact normalized match first; then
 * a containment match, but ONLY when exactly one vendor colour contains the
 * swatch name (or vice versa). Two candidates means we cannot tell them apart,
 * and guessing puts the wrong bike on the page.
 */
function _bimgLookup_(map, swatchName) {
  var want = _bimgNorm_(swatchName);
  if (!want) return null;
  if (map[want]) return { src: map[want], how: 'exact' };

  var hits = Object.keys(map).filter(function (k) {
    return k.indexOf(want) !== -1 || want.indexOf(k) !== -1;
  });
  if (hits.length === 1) return { src: map[hits[0]], how: 'matched "' + hits[0] + '"' };
  return null;
}

function refreshBrandImages(brandName, baseUrl, apply) {
  brandName = String(brandName || '').trim();
  baseUrl   = String(baseUrl || '').replace(/\/+$/, '');
  apply     = apply === true;

  if (!brandName || !baseUrl) {
    Logger.log('Usage: refreshBrandImages("Heybike", "https://www.heybike.com" [, true])');
    return { ok: false };
  }

  var products = [], page = 1;
  while (page <= 10) {
    var resp = UrlFetchApp.fetch(baseUrl + '/products.json?limit=250&page=' + page,
                                 { muteHttpExceptions: true, followRedirects: true });
    if (resp.getResponseCode() !== 200) {
      Logger.log('products.json returned HTTP ' + resp.getResponseCode() + ' — is this a Shopify store?');
      return { ok: false };
    }
    var batch = (JSON.parse(resp.getContentText()) || {}).products || [];
    if (!batch.length) break;
    products = products.concat(batch);
    page++;
  }
  if (!products.length) {
    Logger.log('No products returned from ' + baseUrl + '.');
    return { ok: false };
  }

  var byTitle = {};
  products.forEach(function (p) { byTitle[_bimgNormTitle_(p.title)] = p; });

  var sh = SpreadsheetApp.openById(INV_SHEET_ID).getSheetByName(INV_TAB_NAME);
  if (!sh) { Logger.log('Tab "' + INV_TAB_NAME + '" not found.'); return { ok: false }; }

  var data = sh.getDataRange().getValues();
  var headers = data[0] || [];
  var col = {};
  headers.forEach(function (h, i) {
    var k = String(h || '').toLowerCase().replace(/\s*\(json\)/, '').replace(/[^a-z]/g, '');
    if (k) col[k] = i;
  });
  if (col.brand == null || col.name == null || col.colors == null) {
    Logger.log('Sheet needs Brand, Name and Colors columns. Found: ' + headers.join(' | '));
    return { ok: false };
  }

  Logger.log('=== ' + brandName + ' swatch images from ' + baseUrl +
             '  (BrandImages.gs ' + BIMG_VERSION + ') ===');
  Logger.log(products.length + ' vendor products, ' + (data.length - 1) + ' sheet rows.\n');

  var changedRows = [], noProduct = [], unmatched = [], totalChanged = 0, totalKept = 0;

  for (var r = 1; r < data.length; r++) {
    if (_bimgNorm_(data[r][col.brand]) !== _bimgNorm_(brandName)) continue;
    var title = String(data[r][col.name] || '').trim();

    var raw = String(data[r][col.colors] || '').trim();
    if (!raw) continue;
    var colors;
    try { colors = JSON.parse(raw); }
    catch (e) { Logger.log('  ' + title + ' — Colors JSON will not parse, skipped'); continue; }

    var product = byTitle[_bimgNormTitle_(title)];
    if (!product) { noProduct.push(title); continue; }

    var map = _bimgVariantImages_(product);
    var changes = [];

    _bimgWalkSwatches_(colors, function (sw) {
      var hit = _bimgLookup_(map, sw.name);
      if (!hit) { unmatched.push(title + ' / ' + sw.name); totalKept++; return; }
      if (sw.img === hit.src) { totalKept++; return; }
      changes.push({ name: sw.name, from: sw.img, to: hit.src, how: hit.how });
      sw.img = hit.src;
      totalChanged++;
    });

    if (!changes.length) continue;

    Logger.log(title + '  (' + changes.length + ' image(s))');
    changes.forEach(function (c) {
      Logger.log('   ' + c.name + '  [' + c.how + ']');
      Logger.log('      from: ' + (c.from || '(empty)'));
      Logger.log('      to:   ' + c.to);
    });
    Logger.log('');

    changedRows.push({ rowIndex: r + 1, title: title, json: JSON.stringify(colors) });
  }

  if (noProduct.length) {
    Logger.log('NOT FOUND on the vendor site (' + noProduct.length + ') — renamed or discontinued:');
    noProduct.forEach(function (t) { Logger.log('  ' + t); });
    Logger.log('');
  }
  if (unmatched.length) {
    Logger.log('NO VENDOR COLOUR MATCH (' + unmatched.length + ') — image left as it was:');
    unmatched.forEach(function (t) { Logger.log('  ' + t); });
    Logger.log('');
  }

  Logger.log(totalChanged + ' image(s) would change, ' + totalKept + ' left alone, across ' +
             changedRows.length + ' row(s).');

  if (!apply) {
    Logger.log('\nDry run. Nothing written. Spot-check two or three of the "to" URLs.');
    return { ok: true, applied: false, rows: changedRows.length,
             changed: totalChanged, unmatched: unmatched, noProduct: noProduct };
  }

  changedRows.forEach(function (c) {
    sh.getRange(c.rowIndex, col.colors + 1).setValue(c.json);
  });
  SpreadsheetApp.flush();

  Logger.log('\nWrote ' + changedRows.length + ' row(s).');
  Logger.log('Run the sync-inventory Action, or the site serves the old images until 6 AM UTC.');
  return { ok: true, applied: true, rows: changedRows.length,
           changed: totalChanged, unmatched: unmatched, noProduct: noProduct };
}

// -- Runnable wrappers. The Run button passes no arguments. ---------------
function step1_heybikeImagesDryRun()  { return refreshBrandImages('Heybike',  'https://www.heybike.com'); }
function step2_heybikeImagesApply()   { return refreshBrandImages('Heybike',  'https://www.heybike.com', true); }
function step1_velotricImagesDryRun() { return refreshBrandImages('Velotric', 'https://www.velotricbike.com'); }
function step2_velotricImagesApply()  { return refreshBrandImages('Velotric', 'https://www.velotricbike.com', true); }
function step1_jasionImagesDryRun()   { return refreshBrandImages('Jasion',   'https://www.jasionbike.com'); }
function step2_jasionImagesApply()    { return refreshBrandImages('Jasion',   'https://www.jasionbike.com', true); }
function step1_mooncoolImagesDryRun() { return refreshBrandImages('Mooncool', 'https://www.mooncool.com'); }
function step2_mooncoolImagesApply()  { return refreshBrandImages('Mooncool', 'https://www.mooncool.com', true); }
