/**
 * PASTE TARGET: the INVENTORY Apps Script project (deployment AKfycbyxVMuF… —
 * the one that owns getBikeInventory and InventoryHandlers.gs).
 *
 * This file is NOT executed from the repo — Apps Script source lives only in
 * the Apps Script editor. Paste it as a new script file, then run
 * importBrand() from the editor.
 *
 * WHAT IT DOES
 *   Pulls a brand's catalog straight from their Shopify /products.json — the
 *   same feed PriceMonitor.gs already reads — and appends one inventory row
 *   per bike, in this sheet's own column layout.
 *
 * WHY THIS AND NOT HAND-ENTRY
 *   Model names, prices, colors, per-color images and sold-out status come
 *   from the vendor's own feed. Nothing is transcribed, so nothing is
 *   mistyped, and re-running picks up models added since last time.
 *
 * WHAT IT DELIBERATELY LEAVES BLANK
 *   Specs (Range / Top Speed / Motor / Battery) and colour hex codes are NOT
 *   in a Shopify feed in any dependable form — they live in marketing HTML
 *   that differs per brand. Guessing them would put unverified performance
 *   claims on a page where people spend $1,700, so the importer leaves them
 *   empty and lists exactly what needs filling.
 *
 *   Because those fields are empty, imported rows are written with
 *   discontinued = "Yes", i.e. HIDDEN from the public site. They stay hidden
 *   until you fill the specs and clear the flag. salespro.html still shows
 *   them (getSidebarInventory returns discontinued rows), so you can edit
 *   them there.
 *
 * HOW TO RUN
 *   1. importBrand('Mokwheel', 'https://mokwheel.com')
 *        -> dry run. Logs every row it would add. Writes nothing.
 *   2. importBrand('Mokwheel', 'https://mokwheel.com', true)
 *        -> appends the rows, then logs the manual follow-up list.
 *
 *   Re-running skips models already in the sheet, so it is safe to run again
 *   whenever a brand launches something.
 */

var IMP_TAB_NAME = 'Inventory';   // keep in sync with INV_TAB_NAME

// Products whose title contains any of these are not bikes. PriceMonitor.gs
// has the long battle-tested list; if it lives in this project we reuse it.
var IMP_FALLBACK_ACCESSORY_WORDS = [
  'battery', 'charger', 'tire', 'inner tube', 'rack', 'basket', 'bag', 'pedal',
  'grip', 'brake', 'fender', 'lock', 'light', 'display', 'sensor', 'throttle',
  'saddle', 'seatpost', 'mirror', 'bell', 'pump', 'mount', 'kickstand', 'cover',
  'helmet', 'gloves', 'shirt', 'hat', 'warranty', 'protection plan', 'gift card',
  'sticker', 'trailer', 'pannier', 'controller', 'handlebar', 'stem', 'adapter',
  'spare', 'replacement', 'kit', 'plan', 'membership', 'shipping', 'accessory',
];

function _impAccessoryWords_() {
  return (typeof PM_ACCESSORY_WORDS !== 'undefined' && PM_ACCESSORY_WORDS.length)
    ? PM_ACCESSORY_WORDS
    : IMP_FALLBACK_ACCESSORY_WORDS;
}

// Phrases that mean "this is a bike", even though they contain a word that
// also appears in the accessory list. "Upland Fat Tire" is a bike; 'tire' alone
// would have thrown it away, and Mooncool already sells a fat-tire model.
var IMP_BIKE_PHRASES = [
  'fat tire', 'fat-tire', 'fattire', 'e-bike', 'ebike', 'electric bike',
  'electric bicycle', 'e-trike', 'etrike', 'electric trike', 'mountain bike',
  'cargo bike', 'folding bike', 'step-thru', 'step-through',
];

// Parts and plans that are never a bike, whatever else the title says. These
// win over IMP_BIKE_PHRASES, so "Fat Tire Inner Tube" stays an accessory.
var IMP_HARD_PARTS = [
  'battery', 'charger', 'inner tube', 'tube', 'warranty', 'protection plan',
  'gift card', 'helmet', 'lock', 'rack', 'pump', 'pedal', 'saddle', 'fender',
];

/** Whole-word (or whole-phrase) test, so 'light' does not match "Lightweight". */
function _impHasTerm_(title, term) {
  var w = String(term || '').trim();
  if (!w) return false;
  var re = new RegExp('(^|[^a-z0-9])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)', 'i');
  return re.test(String(title || ''));
}

function _impAny_(title, terms) {
  for (var i = 0; i < terms.length; i++) if (_impHasTerm_(title, terms[i])) return true;
  return false;
}

/**
 * Three-step classification, most specific first:
 *   1. a hard part or plan  -> accessory, no argument
 *   2. an explicit bike phrase -> bike
 *   3. otherwise fall back to the broad accessory keyword list
 * The dry run prints everything it skipped and why, so a misjudgement here is
 * visible before anything is written.
 */
function _impIsAccessory_(title) {
  if (_impAny_(title, IMP_HARD_PARTS)) return true;
  if (_impAny_(title, IMP_BIKE_PHRASES)) return false;
  return _impAny_(title, _impAccessoryWords_());
}

/** Same slug rule as apps-script-id-cleanup.snippet.gs. Keep them identical. */
function _impSlug_(raw) {
  return String(raw == null ? '' : raw).trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Normalizes a header cell so "Specs (JSON)" and "specs" both match. */
function _impNormHeader_(h) {
  return String(h == null ? '' : h).toLowerCase()
    .replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
}

/** Maps our field names onto whatever this sheet actually calls its columns. */
function _impColumnMap_(headers) {
  var want = {
    id: ['id', 'bikeid', 'slug'], order: ['order'], brand: ['brand'],
    name: ['name', 'model'], subtitle: ['subtitle'], price: ['price'],
    testRide: ['testride'], styles: ['styles'], sizes: ['sizes'],
    specs: ['specs'], colors: ['colors'], sizeGuide: ['sizeguide'],
    discontinued: ['discontinued'], categories: ['categories'], stock: ['stock'],
  };
  var map = {};
  headers.forEach(function (h, i) {
    var n = _impNormHeader_(h);
    Object.keys(want).forEach(function (field) {
      if (map[field] == null && want[field].indexOf(n) !== -1) map[field] = i;
    });
  });
  return map;
}

/**
 * Turns one Shopify product into the colors JSON this sheet expects:
 *   { "Default": { "One Size": [ {name, hex, img, price?, soldOut?}, ... ] } }
 * "Default" is already used by six existing bikes and renderInventory()
 * treats it as "no frame-style split", so it is the right neutral default.
 */
function _impBuildColors_(product, basePrice) {
  var optIdx = -1;
  (product.options || []).forEach(function (o, i) {
    if (optIdx === -1 && /colou?r/i.test(String(o.name || ''))) optIdx = i;
  });

  var swatches = [];
  var seen = {};
  (product.variants || []).forEach(function (v) {
    var label = optIdx === -1
      ? String(v.title || '').trim()
      : String(v['option' + (optIdx + 1)] || '').trim();
    if (!label || label.toLowerCase() === 'default title') return;
    if (seen[label]) return;
    seen[label] = true;

    var sw = {
      name: label,
      hex: '',                                   // NOT in the feed — fill by hand
      img: (v.featured_image && v.featured_image.src)
        || ((product.images && product.images[0] && product.images[0].src) || ''),
    };
    var p = parseFloat(v.price);
    if (isFinite(p) && basePrice && Math.round(p) !== Math.round(basePrice)) {
      sw.price = Math.round(p);                  // per-colour upcharge
    }
    if (v.available === false) sw.soldOut = true;
    swatches.push(sw);
  });

  if (!swatches.length) {
    swatches.push({ name: 'Standard', hex: '', img:
      (product.images && product.images[0] && product.images[0].src) || '' });
  }
  var out = { Default: {} };
  out.Default['One Size'] = swatches;
  return out;
}

/** Lowest variant price, which is what the catalog card shows. */
function _impBasePrice_(product) {
  var prices = (product.variants || [])
    .map(function (v) { return parseFloat(v.price); })
    .filter(function (p) { return isFinite(p) && p > 0; });
  return prices.length ? Math.min.apply(null, prices) : 0;
}

/**
 * @param {string}  brandName  e.g. 'Mokwheel' — written to the Brand column.
 * @param {string}  baseUrl    e.g. 'https://mokwheel.com' (no trailing slash).
 * @param {boolean} apply      false/omitted = dry run. true = append rows.
 * @return {Object} { ok, applied, added:[...], skipped:[...], error }
 */
function importBrand(brandName, baseUrl, apply) {
  apply = (apply === true);
  brandName = String(brandName || '').trim();
  baseUrl = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!brandName || !baseUrl) {
    Logger.log('Usage: importBrand("Mokwheel", "https://mokwheel.com" [, true])');
    return { ok: false, error: 'brandName and baseUrl are required' };
  }

  var ss = SpreadsheetApp.openById(INV_SHEET_ID);   // from InventoryHandlers.gs
  var sh = ss.getSheetByName(IMP_TAB_NAME);
  if (!sh) {
    var tabs = ss.getSheets().map(function (s) { return s.getName(); });
    Logger.log('Tab "' + IMP_TAB_NAME + '" not found. Tabs present: ' + tabs.join(', '));
    return { ok: false, error: 'tab not found', tabs: tabs };
  }

  var data    = sh.getDataRange().getValues();
  var headers = data[0] || [];
  var col     = _impColumnMap_(headers);
  if (col.id == null || col.brand == null || col.name == null) {
    Logger.log('Could not find id/brand/name columns. Headers: ' + headers.join(' | '));
    return { ok: false, error: 'column map incomplete' };
  }

  // Existing state: ids are global keys, so a new bike must not reuse one.
  var existingIds = {}, existingNames = {}, maxOrder = 0;
  for (var r = 1; r < data.length; r++) {
    var eid = String(data[r][col.id] || '').trim().toLowerCase();
    if (eid) existingIds[eid] = true;
    var en = String(data[r][col.name] || '').trim().toLowerCase();
    var eb = String(data[r][col.brand] || '').trim().toLowerCase();
    if (en) existingNames[eb + '|' + en] = true;
    if (col.order != null) {
      var o = Number(data[r][col.order]);
      if (isFinite(o) && o > maxOrder) maxOrder = o;
    }
  }

  // Fetch. Reuse PriceMonitor's fetcher when it is in this project.
  var products;
  if (typeof _pmFetchShopifyProducts_ === 'function') {
    products = _pmFetchShopifyProducts_(brandName, baseUrl);
  } else {
    products = _impFetchProducts_(brandName, baseUrl);
  }
  if (!products || !products.length) {
    Logger.log('No products returned from ' + baseUrl + '/products.json — is this a Shopify store?');
    return { ok: false, error: 'no products fetched' };
  }
  Logger.log('Fetched ' + products.length + ' product(s) from ' + baseUrl);

  var added = [], skipped = [], batchIds = {};

  products.forEach(function (p) {
    var title = String(p.title || '').trim();
    if (!title) return;

    if (_impIsAccessory_(title)) { skipped.push(title + '  (accessory)'); return; }

    var nameKey = brandName.toLowerCase() + '|' + title.toLowerCase();
    if (existingNames[nameKey]) { skipped.push(title + '  (already in sheet)'); return; }

    // Shopify handles are already slugs; re-slug anyway so the rule is ours.
    var id = _impSlug_(p.handle || title);
    if (existingIds[id] || batchIds[id]) {
      var pref = _impSlug_(brandName) + '-' + id;
      Logger.log('  id "' + id + '" is taken — using "' + pref + '"');
      id = pref;
    }
    if (existingIds[id] || batchIds[id]) { skipped.push(title + '  (id collision)'); return; }
    batchIds[id] = true;

    var basePrice = _impBasePrice_(p);
    maxOrder += 10;

    added.push({
      id: id, title: title, price: basePrice,
      colors: _impBuildColors_(p, basePrice),
      order: maxOrder,
    });
  });

  Logger.log('\n' + (apply ? 'ADDING ' : 'DRY RUN — would add ') + added.length + ' bike(s):');
  added.forEach(function (a) {
    var n = a.colors.Default['One Size'].length;
    Logger.log('  ' + a.id + '  |  ' + a.title + '  |  $' + a.price + '  |  ' + n + ' colour(s)');
  });
  if (skipped.length) {
    Logger.log('\nSkipped ' + skipped.length + ':');
    skipped.forEach(function (s) { Logger.log('  ' + s); });
  }

  if (!added.length) {
    Logger.log('\nNothing new to add.');
    return { ok: true, applied: false, added: [], skipped: skipped };
  }

  if (!apply) {
    Logger.log('\nNothing written. Re-run with true as the third argument to apply.');
    return { ok: true, applied: false, added: added, skipped: skipped };
  }

  // Write. Only touch columns this sheet actually has.
  added.forEach(function (a) {
    var row = new Array(headers.length).fill('');
    var put = function (field, value) { if (col[field] != null) row[col[field]] = value; };
    put('id', a.id);
    put('brand', brandName);
    put('name', a.title);
    put('price', a.price);
    put('order', a.order);
    put('colors', JSON.stringify(a.colors));
    put('sizes', 'One Size');
    put('specs', '');            // filled by hand — see the follow-up list
    // Hidden until a human fills the specs and the colour hexes.
    put('discontinued', 'Yes');
    sh.appendRow(row);
  });
  SpreadsheetApp.flush();

  Logger.log('\nAdded ' + added.length + ' row(s), all with discontinued = "Yes" (hidden).');
  Logger.log('\n--- STILL NEEDS YOU, per bike ---');
  added.forEach(function (a) {
    var names = a.colors.Default['One Size'].map(function (s) { return s.name; }).join(', ');
    Logger.log('  ' + a.title);
    Logger.log('      Specs (JSON): {"Range":"", "Top Speed":"", "Motor":"", "Battery":""}');
    Logger.log('      hex codes for: ' + names);
    Logger.log('      then clear discontinued to publish');
  });
  Logger.log('\nImages point at the vendor CDN. That works, but downloading them into');
  Logger.log('the repo images/ folder is faster and survives the vendor reorganising.');

  return { ok: true, applied: true, added: added, skipped: skipped };
}

/** Standalone Shopify fetch, used only when PriceMonitor.gs is not present. */
function _impFetchProducts_(brand, baseUrl) {
  var products = [], page = 1, limit = 250;
  while (page <= 20) {
    var resp;
    try {
      resp = UrlFetchApp.fetch(baseUrl + '/products.json?limit=' + limit + '&page=' + page, {
        muteHttpExceptions: true,
        headers: { 'User-Agent': 'CTC-BrandImport/1.0' },
        followRedirects: true,
      });
    } catch (e) {
      console.error(brand + ' fetch failed on page ' + page + ': ' + e);
      break;
    }
    if (resp.getResponseCode() !== 200) {
      console.warn(brand + ' products.json returned HTTP ' + resp.getResponseCode());
      break;
    }
    var batch = (JSON.parse(resp.getContentText()) || {}).products || [];
    if (!batch.length) break;
    batch.forEach(function (p) { products.push(p); });
    if (batch.length < limit) break;
    page++;
    Utilities.sleep(1000);
  }
  return products;
}
