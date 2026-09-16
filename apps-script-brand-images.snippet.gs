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

var BIMG_VERSION = '2026-09-16a';

/** Lowercase, strip punctuation. "Alpine Blue" and "alpine-blue" match. */
function _bimgNorm_(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** All non-alphanumerics removed, so "City Run" and "Cityrun" collapse together. */
function _bimgSquash_(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Reduce a product title to the model name.
 *
 * The first version of this only stripped a trailing "Ebike", and the Heybike
 * dry run showed why that is not enough: the sheet says "Hero" while the feed
 * says "Heybike Hero Electric Bike", and "Cityrun" against "City Run". Six of
 * eleven Heybike models missed. So the brand name and the generic words come
 * out too. "Folding", "Pro", "Plus" and the like stay — they distinguish real
 * models from each other.
 */
function _bimgStripBrand_(title, brand) {
  var t = String(title == null ? '' : title);
  var b = String(brand || '').trim();
  if (b) {
    t = t.replace(new RegExp('\\b' + b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'ig'), ' ');
  }
  t = t.replace(/\b(electric|bicycle|bikes?|e[\s-]?bikes?)\b/ig, ' ');
  return _bimgNorm_(t);
}

/** Every spelling of one product we are willing to match on. */
function _bimgTitleKeys_(title, brand) {
  var stripped = _bimgStripBrand_(title, brand);
  var keys = [_bimgNorm_(title), stripped, _bimgSquash_(title), _bimgSquash_(stripped)];
  var out = [];
  keys.forEach(function (k) { if (k && out.indexOf(k) === -1) out.push(k); });
  return out;
}

/**
 * Find the vendor product for a sheet row.
 *
 * Exact on any spelling first. Then containment, but only when exactly one
 * product is a candidate — "Hero" sits inside "Hero Hub", and quietly picking
 * one would put the wrong bike's photos on a row.
 */
function _bimgFindProduct_(index, sheetName, brand) {
  var keys = _bimgTitleKeys_(sheetName, brand);
  for (var i = 0; i < keys.length; i++) if (index[keys[i]]) return index[keys[i]];

  var hits = [], seen = [];
  Object.keys(index).forEach(function (k) {
    var match = keys.some(function (want) {
      return want.length > 2 && (k.indexOf(want) !== -1 || want.indexOf(k) !== -1);
    });
    if (!match) return;
    var p = index[k];
    if (seen.indexOf(p) === -1) { seen.push(p); hits.push(p); }
  });
  return hits.length === 1 ? hits[0] : null;
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

/**
 * Build a full swatch list from a vendor product: name, image, sold-out flag.
 *
 * refreshBrandImages only ever REPOINTS an existing swatch, so a row whose
 * colour list is empty stays empty — "TK1 fat tire" has "One Size": [] and
 * therefore renders with no photo and nothing to click, and no amount of
 * re-running the image pass changes that. There is nothing there to repoint.
 *
 * hex is deliberately left blank. The vendor feed does not carry one, and a
 * guessed colour chip beside a real photo is worse than an empty circle.
 */
function _bimgVariantSwatches_(product) {
  var optIdx = -1;
  (product.options || []).forEach(function (o, i) {
    if (optIdx === -1 && /colou?r/i.test(String(o.name || ''))) optIdx = i;
  });

  var out = [], seen = {};
  (product.variants || []).forEach(function (v) {
    var label = optIdx === -1
      ? String(v.title || '').trim()
      : String(v['option' + (optIdx + 1)] || '').trim();
    if (!label || label.toLowerCase() === 'default title') return;
    if (seen[label]) return;
    seen[label] = true;

    var src = (v.featured_image && v.featured_image.src) ||
              ((product.images && product.images[0] && product.images[0].src) || '');
    if (!src) return;

    var sw = { name: label, hex: '', img: src };
    if (v.available === false) sw.soldOut = true;
    out.push(sw);
  });
  return out;
}

/** Count the swatches in a Colors JSON blob, whatever its shape. */
function _bimgCountSwatches_(colors) {
  var n = 0;
  _bimgWalkSwatches_(colors, function () { n++; });
  return n;
}

/**
 * Fill in colours for rows that have NONE, from the vendor's own feed.
 *
 * Deliberately separate from refreshBrandImages and deliberately narrow: it
 * touches a row only when that row has zero swatches. A row with even one
 * swatch is left entirely alone, so this can never overwrite colours somebody
 * entered by hand — which is the whole reason the image pass refuses to add
 * any.
 */
function seedEmptyColors(brandName, baseUrl, apply) {
  brandName = String(brandName || '').trim();
  baseUrl   = String(baseUrl || '').replace(/\/+$/, '');
  apply     = apply === true;

  var products = [], page = 1;
  while (page <= 10) {
    var resp = UrlFetchApp.fetch(baseUrl + '/products.json?limit=250&page=' + page,
                                 { muteHttpExceptions: true, followRedirects: true });
    if (resp.getResponseCode() !== 200) {
      Logger.log('products.json returned HTTP ' + resp.getResponseCode());
      return { ok: false };
    }
    var batch = (JSON.parse(resp.getContentText()) || {}).products || [];
    if (!batch.length) break;
    products = products.concat(batch);
    page++;
  }
  if (!products.length) { Logger.log('No products from ' + baseUrl); return { ok: false }; }

  var index = {};
  products.forEach(function (p) {
    _bimgTitleKeys_(p.title, brandName).forEach(function (k) { if (!index[k]) index[k] = p; });
    [_bimgNorm_(p.handle), _bimgSquash_(p.handle)].forEach(function (k) { if (k && !index[k]) index[k] = p; });
  });

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

  Logger.log('=== ' + brandName + ' — seed colours for rows that have none  (BrandImages.gs ' +
             BIMG_VERSION + ') ===\n');

  var seeded = [], noProduct = [], noSwatches = [], alreadyHave = 0;

  for (var r = 1; r < data.length; r++) {
    if (_bimgNorm_(data[r][col.brand]) !== _bimgNorm_(brandName)) continue;
    var title = String(data[r][col.name] || '').trim();

    var colors = {};
    var raw = String(data[r][col.colors] || '').trim();
    if (raw) { try { colors = JSON.parse(raw); } catch (e) { colors = {}; } }

    if (_bimgCountSwatches_(colors) > 0) { alreadyHave++; continue; }

    var product = _bimgFindProduct_(index, title, brandName);
    if (!product) { noProduct.push(title); continue; }

    var swatches = _bimgVariantSwatches_(product);
    if (!swatches.length) { noSwatches.push(title + '  (vendor: ' + product.title + ')'); continue; }

    // Keep the shape the rest of the sheet uses: style -> size -> [swatches].
    var built = { Default: { 'One Size': swatches } };
    seeded.push({ rowIndex: r + 1, title: title, json: JSON.stringify(built), swatches: swatches });
  }

  if (seeded.length) {
    Logger.log((apply ? 'WRITING ' : 'WOULD WRITE ') + seeded.length + ' row(s):');
    seeded.forEach(function (x) {
      Logger.log('  ' + x.title + '  (' + x.swatches.length + ' colour(s))');
      x.swatches.forEach(function (sw) {
        Logger.log('      ' + sw.name + (sw.soldOut ? '  [sold out]' : '') + '  ' + sw.img);
      });
    });
    Logger.log('');
  }
  if (noProduct.length) {
    Logger.log('Empty, and NOT FOUND on the vendor site (' + noProduct.length + '):');
    noProduct.forEach(function (t) { Logger.log('  ' + t); });
    Logger.log('');
  }
  if (noSwatches.length) {
    Logger.log('Empty, vendor has no per-colour photo (' + noSwatches.length + '):');
    noSwatches.forEach(function (t) { Logger.log('  ' + t); });
    Logger.log('');
  }

  Logger.log('rows with colours already, untouched : ' + alreadyHave);
  Logger.log('rows that would gain colours         : ' + seeded.length);

  if (!apply) {
    Logger.log('\nDry run. Nothing written. Every hex will be blank — the feed does');
    Logger.log('not carry one — so the swatch circles stay empty until somebody');
    Logger.log('fills them in salespro. The PHOTOS will work.');
    return { ok: true, applied: false, seeded: seeded, noProduct: noProduct };
  }

  seeded.forEach(function (x) { sh.getRange(x.rowIndex, col.colors + 1).setValue(x.json); });
  SpreadsheetApp.flush();
  Logger.log('\nWrote ' + seeded.length + ' row(s). Run the sync-inventory Action.');
  return { ok: true, applied: true, seeded: seeded, noProduct: noProduct };
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

  var index = {};
  products.forEach(function (p) {
    _bimgTitleKeys_(p.title, brandName).forEach(function (k) { if (!index[k]) index[k] = p; });
    [_bimgNorm_(p.handle), _bimgSquash_(p.handle)].forEach(function (k) { if (k && !index[k]) index[k] = p; });
  });

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

  var changedRows = [], noProduct = [], unmatched = [], noVendorImages = [], skipped = [];
  var totalChanged = 0, totalIdentical = 0, rowsSeen = 0, swatchesSeen = 0;

  for (var r = 1; r < data.length; r++) {
    if (_bimgNorm_(data[r][col.brand]) !== _bimgNorm_(brandName)) continue;
    var title = String(data[r][col.name] || '').trim();

    rowsSeen++;

    var raw = String(data[r][col.colors] || '').trim();
    if (!raw) { skipped.push(title + '  (no Colors JSON)'); continue; }
    var colors;
    try { colors = JSON.parse(raw); }
    catch (e) { skipped.push(title + '  (Colors JSON will not parse)'); continue; }

    var product = _bimgFindProduct_(index, title, brandName);
    if (!product) { noProduct.push(title); continue; }

    var map = _bimgVariantImages_(product);
    if (!Object.keys(map).length) {
      // Distinct from "colour not matched": the vendor publishes no per-variant
      // photo at all for this product, so there is nothing here to copy.
      noVendorImages.push(title + '  (vendor title: ' + product.title + ')');
      continue;
    }

    var changes = [];
    _bimgWalkSwatches_(colors, function (sw) {
      swatchesSeen++;
      var hit = _bimgLookup_(map, sw.name);
      if (!hit) { unmatched.push(title + ' / ' + sw.name); return; }
      if (sw.img === hit.src) { totalIdentical++; return; }
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
    Logger.log('  For reference, the first few titles the feed actually uses:');
    products.slice(0, 8).forEach(function (p) { Logger.log('    ' + p.title); });
    Logger.log('');
  }
  if (noVendorImages.length) {
    Logger.log('VENDOR PUBLISHES NO PER-COLOUR PHOTO (' + noVendorImages.length + '):');
    noVendorImages.forEach(function (t) { Logger.log('  ' + t); });
    Logger.log('');
  }
  if (unmatched.length) {
    Logger.log('NO VENDOR COLOUR MATCH (' + unmatched.length + ') — image left as it was:');
    unmatched.forEach(function (t) { Logger.log('  ' + t); });
    Logger.log('');
  }
  if (skipped.length) {
    Logger.log('SKIPPED (' + skipped.length + '):');
    skipped.forEach(function (t) { Logger.log('  ' + t); });
    Logger.log('');
  }

  // Every row and swatch is accounted for, so the numbers can be checked
  // against each other rather than taken on trust.
  Logger.log('Accounting for ' + brandName + ':');
  Logger.log('  sheet rows with this brand : ' + rowsSeen);
  Logger.log('     matched to a product    : ' + (rowsSeen - noProduct.length - noVendorImages.length - skipped.length));
  Logger.log('     no product found        : ' + noProduct.length);
  Logger.log('     product has no photos   : ' + noVendorImages.length);
  Logger.log('     skipped                 : ' + skipped.length);
  Logger.log('  swatches inspected         : ' + swatchesSeen);
  Logger.log('     would change            : ' + totalChanged);
  Logger.log('     already correct         : ' + totalIdentical);
  Logger.log('     no colour match         : ' + unmatched.length);
  Logger.log('  rows to write              : ' + changedRows.length);

  if (!apply) {
    Logger.log('\nDry run. Nothing written. Spot-check two or three of the "to" URLs.');
    return { ok: true, applied: false, rows: changedRows.length, changed: totalChanged,
             unmatched: unmatched, noProduct: noProduct, noVendorImages: noVendorImages };
  }

  changedRows.forEach(function (c) {
    sh.getRange(c.rowIndex, col.colors + 1).setValue(c.json);
  });
  SpreadsheetApp.flush();

  Logger.log('\nWrote ' + changedRows.length + ' row(s).');
  Logger.log('Run the sync-inventory Action, or the site serves the old images until 6 AM UTC.');
  return { ok: true, applied: true, rows: changedRows.length, changed: totalChanged,
           unmatched: unmatched, noProduct: noProduct, noVendorImages: noVendorImages };
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

// -- Seed colours for rows that have none --------------------------------
function step3_mooncoolSeedColorsDryRun() { return seedEmptyColors('Mooncool', 'https://www.mooncool.com'); }
function step4_mooncoolSeedColorsApply()  { return seedEmptyColors('Mooncool', 'https://www.mooncool.com', true); }
function step3_heybikeSeedColorsDryRun()  { return seedEmptyColors('Heybike',  'https://www.heybike.com'); }
function step4_heybikeSeedColorsApply()   { return seedEmptyColors('Heybike',  'https://www.heybike.com', true); }
function step3_velotricSeedColorsDryRun() { return seedEmptyColors('Velotric', 'https://www.velotricbike.com'); }
function step4_velotricSeedColorsApply()  { return seedEmptyColors('Velotric', 'https://www.velotricbike.com', true); }
function step3_jasionSeedColorsDryRun()   { return seedEmptyColors('Jasion',   'https://www.jasionbike.com'); }
function step4_jasionSeedColorsApply()    { return seedEmptyColors('Jasion',   'https://www.jasionbike.com', true); }
