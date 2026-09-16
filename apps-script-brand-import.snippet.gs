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

// Printed at the top of every run — see the note on FS_VERSION in BrandSpecs.gs.
// Apps Script runs the last SAVED file, so this is how you tell whether the
// paste you just made is the code that actually executed.
var IMP_VERSION = '2026-09-16a';

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
  // Bundles and free-gift SKUs. Brands list one per colourway, so a single
  // missing word here adds a dozen junk rows. 'accessory' does not match
  // "Accessories" -- matching is whole-word -- so both spellings are listed.
  'accessory', 'accessories', 'pack', 'bundle',
  // Mokwheel sells power gear alongside the bikes; two solar panels imported
  // as bicycles on the first real run.
  'solar panel', 'solar', 'inverter', 'generator', 'power station',
  // Heybike lists the same bike many times over: "Saturn-combo", "ALPHA (VIP
  // only)", "Cityscape 2.0（Deal）", "Mars 3.0 for Spurs Fans". Each one is a
  // separate product in the feed and each became its own row. They are not new
  // models, they are the same bike with a promotion attached, and a shop with
  // four Saturn rows is worse than one.
  'combo', 'deal', 'vip', 'spurs fans', 'gift pack', 'protection', 'headlight',
  // Parts whose names contain "Ebike". Jasion calls every accessory "Jasion
  // Ebike <thing>", and IMP_BIKE_PHRASES was rescuing all of them as bicycles
  // before the accessory list was ever consulted — that is how "Jasion Ebike
  // Front Basket" and "Ebike Mirrors" ended up on the public shop. These must
  // live HERE, above the rescue, not in the keyword list below it.
  // 'tire' is deliberately absent: "TK1 Fat Tire Electric Trike" is a real bike
  // and IMP_BIKE_PHRASES exists precisely to save it.
  'basket', 'mirror', 'holder', 'bag', 'backpack', 'chain', 'kickstand',
  'controller', 'scabbard', 'mount', 'bottle', 'crank', 'wheel', 'fork',
  'derailleur', 'shifter', 'caliper', 'rotor', 'freewheel', 'seatpost',
  'stem', 'grip', 'display', 'horn', 'liner', 'rod', 'reel',
];

/**
 * Multi-packs and two-bike bundles.
 *
 * Jasion sells "Thunder Pro*2" and "X-Hunter + X-Hunter ST" as their own
 * products. Each one imported as a separate bike, so the shop showed a Thunder
 * Pro twice over at two different prices. They are not models.
 */
function _impIsBundle_(title) {
  var t = String(title || '');
  return /\*\s*\d/.test(t) || /\S\s*\+\s*\S/.test(t);
}

/**
 * Whole-word (or whole-phrase) test, so 'light' does not match "Lightweight".
 *
 * An optional trailing "s" is allowed, because the keyword lists are singular
 * and vendors are not: 'mirror' did not match "Mirrors（3FOR99）" and 'basket'
 * did not match "Dual Rear Side Baskets Set", so both imported as bicycles.
 * Listing every plural by hand would have to be redone for each new list.
 */
function _impHasTerm_(title, term) {
  var w = String(term || '').trim();
  if (!w) return false;
  var re = new RegExp('(^|[^a-z0-9])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
                      's?([^a-z0-9]|$)', 'i');
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
  if (_impIsBundle_(title)) return true;
  if (_impAny_(title, IMP_HARD_PARTS)) return true;
  if (_impAny_(title, IMP_BIKE_PHRASES)) return false;
  return _impAny_(title, _impAccessoryWords_());
}

/** All non-alphanumerics removed, so "City Run" and "Cityrun" collapse. */
function _impSquash_(x) {
  return String(x == null ? '' : x).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function _impNormName_(x) {
  return String(x == null ? '' : x).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Reduce a title to the model name: drop the brand and the generic words,
 * keep everything that tells two models apart.
 */
function _impStripBrand_(title, brand) {
  var t = String(title == null ? '' : title);
  var b = String(brand || '').trim();
  if (b) t = t.replace(new RegExp('\\b' + b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'ig'), ' ');
  t = t.replace(/\b(electric|bicycle|bikes?|e[\s-]?bikes?)\b/ig, ' ');
  return _impNormName_(t);
}

/** Every spelling of one product we are willing to treat as the same bike. */
function _impTitleKeys_(title, brand) {
  var stripped = _impStripBrand_(title, brand);
  var keys = [_impNormName_(title), stripped, _impSquash_(title), _impSquash_(stripped)];
  var out = [];
  keys.forEach(function (k) { if (k && out.indexOf(k) === -1) out.push(k); });
  return out;
}

/**
 * Is this vendor product already a row in the sheet?
 *
 * This has to be forgiving, because the sheet's names are what a human typed
 * and the feed's are marketing copy: "Hero" in the sheet is "Heybike Hero
 * Electric Bike" in the feed, and "Mars 2.0" is "Mars 2.0 Folding Electric
 * Bike". An exact comparison says "new" to both and the import quietly adds a
 * second row for a bike already on the site — and because the id collides it
 * gets prefixed, so the duplicate does not even look like one.
 *
 * Exact on any spelling first, then containment, but only when exactly one
 * existing row is a candidate: "Hero" sits inside "Hero Hub", and treating
 * those as the same bike would silently skip importing a real model.
 */
function _impFindExisting_(index, title, brand) {
  var keys = _impTitleKeys_(title, brand);
  for (var i = 0; i < keys.length; i++) if (index[keys[i]]) return index[keys[i]];

  var hits = [];
  Object.keys(index).forEach(function (k) {
    var match = keys.some(function (want) {
      return want.length > 2 && (k.indexOf(want) !== -1 || want.indexOf(k) !== -1);
    });
    if (match && hits.indexOf(index[k]) === -1) hits.push(index[k]);
  });
  return hits.length === 1 ? hits[0] : null;
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
  // Names are indexed per brand under every spelling we are willing to treat
  // as the same bike, so a feed title that is wordier than the sheet's name
  // still recognises the row that is already there.
  var existingIds = {}, nameIndex = {}, maxOrder = 0;
  for (var r = 1; r < data.length; r++) {
    var eid = String(data[r][col.id] || '').trim().toLowerCase();
    if (eid) existingIds[eid] = true;

    var en = String(data[r][col.name] || '').trim();
    var eb = String(data[r][col.brand] || '').trim();
    if (en && _impNormName_(eb) === _impNormName_(brandName)) {
      _impTitleKeys_(en, brandName).forEach(function (k) {
        if (!nameIndex[k]) nameIndex[k] = en;
      });
    }
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
  Logger.log('BrandImport.gs ' + IMP_VERSION);
  Logger.log('Fetched ' + products.length + ' product(s) from ' + baseUrl);

  var added = [], skipped = [], batchIds = {};

  products.forEach(function (p) {
    var title = String(p.title || '').trim();
    if (!title) return;

    if (_impIsAccessory_(title)) { skipped.push(title + '  (accessory)'); return; }

    var already = _impFindExisting_(nameIndex, title, brandName);
    if (already) {
      skipped.push(title + '  (already in sheet as "' + already + '")');
      return;
    }

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


// ── Runnable wrappers ────────────────────────────────────────────
// The Run button calls the selected function with no arguments, so
// importBrand('Mokwheel', ...) cannot be run from the dropdown directly.

/** Step 1 — list what would be added. Writes nothing. */
function step1_mokwheelImportDryRun() {
  return importBrand('Mokwheel', 'https://mokwheel.com');
}

/** Step 2 — add the rows, every one hidden until its specs are filled in. */
function step2_mokwheelImportApply() {
  return importBrand('Mokwheel', 'https://mokwheel.com', true);
}

// ── The four established brands ──────────────────────────────────
// These sheets already have rows, so the dry run matters more here than it did
// for Mokwheel: read the "already in sheet as ..." lines and make sure each one
// names the row you expect. A wrong match there means a real new model is
// skipped; a missed match means a duplicate row for a bike already on the site.
//
// Everything added lands with discontinued = "Yes" and empty Specs, so nothing
// reaches the public site until you fill it in and clear the flag. Follow an
// import with the specs pass and then BrandImages.gs for that brand.

/** Heybike — dry run. */
function step1_heybikeImportDryRun()  { return importBrand('Heybike',  'https://www.heybike.com'); }
/** Heybike — add the rows, hidden. */
function step2_heybikeImportApply()   { return importBrand('Heybike',  'https://www.heybike.com', true); }

/** Velotric — dry run. */
function step1_velotricImportDryRun() { return importBrand('Velotric', 'https://www.velotricbike.com'); }
/** Velotric — add the rows, hidden. */
function step2_velotricImportApply()  { return importBrand('Velotric', 'https://www.velotricbike.com', true); }

/** Jasion — dry run. */
function step1_jasionImportDryRun()   { return importBrand('Jasion',   'https://www.jasionbike.com'); }
/** Jasion — add the rows, hidden. */
function step2_jasionImportApply()    { return importBrand('Jasion',   'https://www.jasionbike.com', true); }

/** Mooncool — dry run. */
function step1_mooncoolImportDryRun() { return importBrand('Mooncool', 'https://www.mooncool.com'); }
/** Mooncool — add the rows, hidden. */
function step2_mooncoolImportApply()  { return importBrand('Mooncool', 'https://www.mooncool.com', true); }

/**
 * Heybike Sports — a SEPARATE Shopify store.
 *
 * The Villain dirt bike is not in www.heybike.com's 131 products because it is
 * not sold there; sports.heybike.com is its own storefront. A brand with two
 * stores needs two imports, and nothing in the first run's log hints that the
 * second exists — the model simply never appears.
 */
function step1_heybikeSportsImportDryRun() { return importBrand('Heybike', 'https://sports.heybike.com'); }
function step2_heybikeSportsImportApply()  { return importBrand('Heybike', 'https://sports.heybike.com', true); }
