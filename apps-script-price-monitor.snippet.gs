// ============================================================
// Cruise the Creek — Price Monitor
// FILE: PriceMonitor.gs  (new file in the existing project)
//
// HOW TO USE:
//   1. In Apps Script editor, click + -> Script -> name it "PriceMonitor"
//   2. Paste this entire file into it.
//   3. Run setupPriceMonitorTrigger() ONCE from the editor to schedule
//      daily automatic runs.
//   4. Run runPriceMonitor() any time to trigger it manually.
//
// WHAT IT DOES:
//   - Fetches the full product catalog from each brand's Shopify store
//     (/products.json endpoint, paginated).
//   - For each product, decides if it is a bike, accessory, or bundle.
//   - Looks up bikes in our Inventory tab by name (fuzzy match).
//   - Compares their price to our price.
//   - Appends results to the "Price Monitor" tab in the inventory sheet.
//   - Sends an email summary if any bikes are priced lower than ours.
//
// COLUMNS WRITTEN TO "Price Monitor" tab:
//   Timestamp | Brand | Model | Their Price | Our Price |
//   Difference | Status | URL
// ============================================================


// -- INVENTORY SHEET COORDINATES ----------------------------
// These must match your actual Google Sheet ID and tab name.
// Keep in sync with InventoryHandlers.gs if you have both files.
var INV_SHEET_ID = '1R3pDFG_sO81bKS6dEAa-k5F-OdD5OAbe4hQ-Oc0_T-E';
var INV_TAB_NAME = 'Inventory';


// -- BRAND SHOPIFY BASE URLS --------------------------------
var PM_BRANDS = {
  'Heybike':  'https://heybike.com',
  'Jasion':   'https://www.jasionbike.com',
  'Velotric': 'https://www.velotricbike.com',
  'Mooncool': 'https://www.mooncool.com',
};

// -- KEYWORDS THAT IDENTIFY ACCESSORIES (not bikes) --------
// If a product title contains ANY of these words, it is skipped
// as an accessory. Keep lowercase -- matching is case-insensitive.
var PM_ACCESSORY_WORDS = [
  'battery', 'charger', 'tire', 'inner tube', 'cable', 'rack',
  'basket', 'bag', 'pedal', 'grip', 'brake', 'fender', 'lock',
  'light', 'display', 'sensor', 'throttle', 'saddle', 'seatpost',
  'seat pad', 'rear seat', 'front fork', 'fork', 'wheel', 'chain',
  'derailleur', 'shifter', 'mirror', 'bell', 'pump', 'mount',
  'holder', 'kickstand', 'cover', 'protector', 'plug', 'head tube',
  'headset', 'crank', 'freewheel', 'caliper', 'rotor', 'brake pad',
  't-shirt', 'shirt', 'hat', 'polo', 'gloves', 'helmet', 'glasses',
  'sunglasses', 'balaclava', 'mask', 'earbuds', 'speaker',
  'warranty', 'protection plan', 'sim card', 'data plan',
  'gift card', 'sticker', 'goggles', 'subscription', 'coupler',
  'trailer', 'pannier', 'saddlebag', 'controller', 'cap',
  'handlebar', 'stem', 'adapter', 'handrail', 'foot rest',
  'membership', 'e-bike rack', 'bike rack', 'power station',
  'lumos', 'rockbros', 'bikase', 'hoto', 'ecoflow', 'jackery',
  'bracelet', 'shipping', 'spare', 'replacement', 'fender pack',
  'wheel guard', 'pegs', 'pannier bag', 'rack bag', 'rack top',
  'rack battery', 'folding lock', 'water bottle', 'hydrate',
  'luggage', 'side rack', 'rear light', 'tail light', 'front light',
  'horn', 'rear derailleur', 'gear shifter', 'brake lever',
  'outer tire', 'disc brake', 'seatpost clamp', 'battery lock',
  'hydraulic brake', 'speed sensor', 'pedal assist', 'main cable',
  'headset', 'suspension seatpost', 'adjustable stem', 'bar end',
  'half twist', 'esim', 'care plan', 'front rack', 'alloy',
  'connect 4g', 'modular rear rack', 'rear rack pannier',
  'passenger handrail', 'passenger kit', 'passenger foot',
  'pet cover', 'pet basket', 'mik trunk', 'ore basket',
  'dairyman', 'harvest hosts', 'comfort saddle', 'comfortmax',
  'folding lock', 'battery terminal', 'battery connector',
  'kit', 'gift box', 'gift pack', 'gift set', 'anniversary gift',
  'not for sale', 'non-delivery', 'pet carrier', 'protection plan',
  'product protection',
  // Subscription / service plans
  '1-year', '2-year', 'year plan', 'monthly plan',
  // Parts and hardware that don't have a catch-all yet
  'motor for', 'motor for mc', '24-inch motor', 'set package',
  'trike seat', 'wide seat', 'adjustable wide', 'seat with backrest',
  'mc adjustable',
];

// -- KEYWORDS THAT IDENTIFY BUNDLES / COMBOS ---------------
// If a product title contains ANY of these, it is skipped as a bundle.
var PM_BUNDLE_WORDS = [
  '*2', 'combo', 'bundle', '2-pack', '(2-pack)', 'refurbished',
  'long range', 'lr combo', 'vip only',
  // Two models joined by + are always a multi-bike bundle
  // (detected dynamically in runPriceMonitor below)
];

// -- MATCH THRESHOLD ----------------------------------------
// Minimum ratio (0-1) of characters that must match for a fuzzy hit.
// 0.75 means 75% of the shorter title must appear in the longer one.
var PM_MATCH_THRESHOLD = 0.70;


// ============================================================
// MAIN ENTRY POINT
// ============================================================
function runPriceMonitor() {
  var timestamp = new Date().toISOString();
  var allRows   = [];
  var alerts    = []; // bikes where their price < ours

  // Purge rows older than 14 days before writing new data
  cleanPriceMonitor(14);

  // Load OUR inventory for price lookup
  var ourBikes = _pmLoadOurInventory_();

  Object.keys(PM_BRANDS).forEach(function(brand) {
    var baseUrl  = PM_BRANDS[brand];
    var products = _pmFetchShopifyProducts_(brand, baseUrl);

    products.forEach(function(p) {
      var title    = String(p.title || '').trim();
      var handle   = String(p.handle || '').trim();
      var url      = baseUrl + '/products/' + handle;
      var theirPriceNum = _pmMinPrice_(p);
      var theirPriceStr = theirPriceNum != null ? '$' + _pmFmt_(theirPriceNum) : '—';

      // -- Skip free / test / placeholder products ($0 price)
      if (theirPriceNum === null || theirPriceNum === 0) return;

      // -- Skip bundles / combos first
      // Also treat any title containing "+" as a multi-bike bundle
      if (_pmIsBundle_(title) || title.indexOf('+') !== -1) {
        allRows.push([timestamp, brand, title, theirPriceStr, '—', '—', '📦 Bundle/Combo — skipped', url]);
        return;
      }

      // -- Skip accessories
      if (_pmIsAccessory_(title)) {
        allRows.push([timestamp, brand, title, theirPriceStr, '—', '—', '🔧 Accessory — skipped', url]);
        return;
      }

      // -- Try to match against our inventory
      var match = _pmFindOurBike_(title, brand, ourBikes);
      if (!match) {
        allRows.push([timestamp, brand, title, theirPriceStr, '—', '—', '⚪ Not in our inventory', url]);
        return;
      }

      var ourPriceNum  = match.price;
      var ourPriceStr  = '$' + _pmFmt_(ourPriceNum);
      var diff         = theirPriceNum != null ? theirPriceNum - ourPriceNum : null;
      var diffStr      = diff != null ? (diff >= 0 ? '+$' + _pmFmt_(Math.abs(diff)) : '-$' + _pmFmt_(Math.abs(diff))) : '—';
      var status;

      if (diff == null) {
        status = '❓ Could not compare';
      } else if (Math.abs(diff) < 1) {
        status = '✅ Match';
      } else if (diff < 0) {
        // Their price is LOWER than ours — alert!
        status = '🔴 THEIR PRICE LOWER by $' + _pmFmt_(Math.abs(diff));
        alerts.push({ brand: brand, model: title, theirPrice: theirPriceStr, ourPrice: ourPriceStr, diff: Math.abs(diff), url: url });
      } else {
        // Our price is lower — good news
        status = '🟢 Our price lower by $' + _pmFmt_(diff);
      }

      allRows.push([timestamp, brand, title, theirPriceStr, ourPriceStr, diffStr, status, url]);
    });

    // Be polite between brands
    Utilities.sleep(500);
  });

  // Write to Price Monitor tab
  _pmWriteResults_(allRows);

  // Email alert if any bikes are priced lower by the brands
  if (alerts.length > 0) {
    _pmSendAlert_(alerts, timestamp);
  }

  console.log('Price Monitor complete. ' + allRows.length + ' rows written. ' + alerts.length + ' pricing alerts.');
}


// ============================================================
// TRIGGER SETUP — run once from the editor
// ============================================================
/**
 * Installs a daily time-based trigger so runPriceMonitor() fires
 * automatically each morning. Run this once from the editor.
 * Safe to re-run — removes any existing PM trigger first.
 */
function setupPriceMonitorTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'runPriceMonitor') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runPriceMonitor')
    .timeBased()
    .everyDays(1)
    .atHour(7) // 7 AM UTC = ~3 AM Eastern
    .create();
  console.log('Price Monitor trigger installed — runs daily at 7 AM UTC.');
}

/**
 * Removes the daily trigger (if you want to pause monitoring).
 */
function removePriceMonitorTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'runPriceMonitor') ScriptApp.deleteTrigger(t);
  });
  console.log('Price Monitor trigger removed.');
}


// ============================================================
// HELPERS
// ============================================================

/**
 * Loads all active bikes from the Inventory tab.
 * Self-contained — does NOT depend on InventoryHandlers.gs.
 * Falls back gracefully to an empty array and logs the error.
 */
function _pmLoadOurInventory_() {
  try {
    var ss = SpreadsheetApp.openById(INV_SHEET_ID);
    var sh = ss.getSheetByName(INV_TAB_NAME);
    if (!sh) {
      console.error('_pmLoadOurInventory_: tab "' + INV_TAB_NAME + '" not found.');
      return [];
    }
    var data = sh.getDataRange().getValues();
    if (data.length < 2) return [];
    var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
    var bikes = [];
    for (var i = 1; i < data.length; i++) {
      var row = {};
      headers.forEach(function(h, j) { row[h] = data[i][j]; });
      var id   = String(row.id   || '').trim();
      var name = String(row.name || '').trim();
      if (!id && !name) continue; // blank row
      var disc = String(row.discontinued || '').trim().toLowerCase();
      if (disc === 'yes' || disc === 'true') continue;
      bikes.push({
        id:    id,
        name:  name,
        brand: String(row.brand || '').trim(),
        price: parseFloat(row.price) || 0,
      });
    }
    console.log('_pmLoadOurInventory_: loaded ' + bikes.length + ' active bikes.');
    return bikes;
  } catch (e) {
    console.error('_pmLoadOurInventory_ failed: ' + e);
    return [];
  }
}

/**
 * Fetches all products from a Shopify store's /products.json endpoint.
 * Handles pagination automatically (limit=250 per page).
 * Retries up to 3 times with exponential backoff on HTTP 429 (rate-limit).
 * On a persistent rate-limit the LAST CACHED catalog is used as a fallback,
 * so Mooncool data is never silently dropped just because they throttled us.
 */
function _pmFetchShopifyProducts_(brand, baseUrl) {
  var cacheKey = 'PM_PRODUCTS_' + brand.toUpperCase().replace(/\s+/g, '_');
  var props     = PropertiesService.getScriptProperties();
  var products  = [];
  var page      = 1;
  var limit     = 250;
  var maxRetry  = 3;
  var rateLimited = false;

  while (true) {
    var url = baseUrl + '/products.json?limit=' + limit + '&page=' + page;
    var code = 0;
    var resp;

    // Retry loop for 429
    for (var attempt = 0; attempt < maxRetry; attempt++) {
      try {
        resp = UrlFetchApp.fetch(url, {
          muteHttpExceptions: true,
          headers: { 'User-Agent': 'CTC-PriceMonitor/1.0' },
          followRedirects: true,
        });
        code = resp.getResponseCode();
        if (code !== 429) break; // non-rate-limit response — exit retry loop
        var wait = 5000 * Math.pow(2, attempt); // 5s, 10s, 20s
        console.warn(brand + ' HTTP 429 on page ' + page + ', waiting ' + (wait / 1000) + 's (attempt ' + (attempt + 1) + '/' + maxRetry + ')');
        Utilities.sleep(wait);
      } catch (e) {
        console.error(brand + ' fetch failed on page ' + page + ': ' + e);
        rateLimited = true;
        break;
      }
    }

    if (code === 429) {
      console.warn(brand + ' still rate-limited after ' + maxRetry + ' retries.');
      rateLimited = true;
      break;
    }
    if (rateLimited || code !== 200) {
      if (!rateLimited) console.warn(brand + ' products.json returned HTTP ' + code + ' on page ' + page);
      break;
    }

    var data  = JSON.parse(resp.getContentText());
    var batch = data.products || [];
    if (batch.length === 0) break;
    batch.forEach(function(p) { products.push(p); });
    if (batch.length < limit) break; // last page
    page++;
    Utilities.sleep(1000); // 1s between pages to stay polite
  }

  // If we got a full catalog, update the persistent cache.
  if (products.length > 0) {
    try {
      props.setProperty(cacheKey,          JSON.stringify(products));
      props.setProperty(cacheKey + '_TS',  String(Date.now()));
    } catch (e) { /* ScriptProperties full or other write error — non-fatal */ }
    console.log(brand + ': fetched ' + products.length + ' products (cache updated).');
  } else {
    // Use the cached version from the last successful run.
    var cached = props.getProperty(cacheKey);
    if (cached) {
      try {
        products = JSON.parse(cached);
        var ts   = parseInt(props.getProperty(cacheKey + '_TS') || '0', 10);
        var ageH = ts ? Math.round((Date.now() - ts) / 3600000) : '?';
        console.log(brand + ': using cached catalog (' + products.length + ' products, ' + ageH + 'h old) because live fetch failed.');
      } catch (e) {
        console.warn(brand + ': cached catalog corrupt — ' + e);
        products = [];
      }
    } else {
      console.log(brand + ': fetched 0 products and no cache available.');
    }
  }

  return products;
}

/**
 * Returns the minimum variant price for a Shopify product, or null.
 */
function _pmMinPrice_(product) {
  var variants = product.variants || [];
  if (!variants.length) return null;
  var prices = variants.map(function(v) { return parseFloat(v.price || '0'); }).filter(function(p) { return !isNaN(p); });
  if (!prices.length) return null;
  return Math.min.apply(null, prices);
}

/**
 * Returns true if the product title looks like an accessory.
 */
function _pmIsAccessory_(title) {
  var lower = title.toLowerCase();
  return PM_ACCESSORY_WORDS.some(function(kw) { return lower.indexOf(kw) !== -1; });
}

/**
 * Returns true if the product title looks like a bundle/combo.
 */
function _pmIsBundle_(title) {
  var lower = title.toLowerCase();
  return PM_BUNDLE_WORDS.some(function(kw) { return lower.indexOf(kw) !== -1; });
}

/**
 * Attempts to find a matching bike in our inventory for a Shopify product title.
 *
 * Cleaning steps applied before matching:
 *   1. Strip brand prefixes ("Heybike", "Velotric", "JasioBike", etc.)
 *   2. Strip marketing/deal suffixes ("for Spur fans", "(Special Offer)", "Deal", wattage)
 *   3. Strip generic product-type suffixes ("Ebike", "Electric Trike", "Electric Bike", etc.)
 *   4. Exact match (case-insensitive), then substring match (same brand)
 */
function _pmFindOurBike_(shopifyTitle, brand, ourBikes) {
  var clean = shopifyTitle;

  // 1. Strip known brand prefixes
  ['Heybike', 'JasioBike', 'Jasionbike', 'Jasion', 'Velotric', 'Mooncool', 'Jasion®', 'Velotric®'].forEach(function(prefix) {
    var re = new RegExp('^' + prefix.replace(/[®]/g, '\\u00ae') + '[\\s®]*', 'i');
    clean = clean.replace(re, '').trim();
  });

  // 2. Strip marketing / deal suffixes (full-width and ASCII brackets)
  [
    /\s+for\s+spur\s+fans\s*$/i,
    /\s*[（(][^)）]*[)）]\s*$/,              // anything in (parens) or （parens）at end
    /\s+deal\s*$/i,
    /\s+special\s+offer\s*$/i,
    /\s*\d+\s*[Ww]\s*\/\s*\d+\s*[Ww]\s*$/, // 750W/1000W
    /\s+\d+\s*[Ww]\s*$/,                     // 750W or 1000W alone
  ].forEach(function(re) { clean = clean.replace(re, '').trim(); });

  // 3. Strip generic product-type suffixes at the END of the title
  [
    /\s+electric\s+tricycle\s*$/i,
    /\s+electric\s+trike\s*$/i,
    /\s+electric\s+bicycle\s*$/i,
    /\s+electric\s+bike\s*$/i,
    /\s+cruiser\s+e[-\s]?bike\s*$/i,
    /\s+fat\s+tire\s+e[-\s]?bike\s*$/i,
    /\s+folding\s+e[-\s]?bike\s*$/i,
    /\s+e[-\s]?bikes?\s*$/i,
    /\s+ebike\s*$/i,
  ].forEach(function(re) { clean = clean.replace(re, '').trim(); });

  // 4. Strip "Ebike" / "E-Bike" if it appears at the START
  clean = clean.replace(/^e[-\s]?bike\s+/i, '').trim();

  // Exact match (case-insensitive)
  var cleanLower = clean.toLowerCase();
  for (var i = 0; i < ourBikes.length; i++) {
    var bike = ourBikes[i];
    if (bike.name.toLowerCase() === cleanLower) return bike;
  }

  // Fuzzy: our bike name appears in the cleaned title or vice versa (same brand)
  for (var j = 0; j < ourBikes.length; j++) {
    var b = ourBikes[j];
    if (brand && b.brand && b.brand.toLowerCase() !== brand.toLowerCase()) continue;
    var bLower = b.name.toLowerCase();
    if (cleanLower.indexOf(bLower) !== -1 || bLower.indexOf(cleanLower) !== -1) {
      return b;
    }
  }

  return null;
}

/**
 * Formats a number as a price string (e.g. 1199.00 -> "1,199").
 */
function _pmFmt_(num) {
  if (num == null || isNaN(num)) return '?';
  return Number(num).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/**
 * Appends rows to the "Price Monitor" tab, creating it if it doesn't exist.
 */
function _pmWriteResults_(rows) {
  if (!rows.length) return;
  var ss = SpreadsheetApp.openById(INV_SHEET_ID);
  var sh = ss.getSheetByName('Price Monitor');
  if (!sh) {
    sh = ss.insertSheet('Price Monitor');
    var hdr = ['Timestamp', 'Brand', 'Model', 'Their Price', 'Our Price', 'Difference', 'Status', 'URL'];
    sh.appendRow(hdr);
    sh.getRange(1, 1, 1, hdr.length).setFontWeight('bold').setBackground('#1a2d1a').setFontColor('white');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 160);
    sh.setColumnWidth(3, 260);
    sh.setColumnWidth(7, 280);
    sh.setColumnWidth(8, 400);
  }
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, 8).setValues(rows);
  console.log('Price Monitor: wrote ' + rows.length + ' rows.');
}

/**
 * Deletes rows from the Price Monitor tab that are older than `days` days.
 * Defaults to 14 days. Keeps the header row (row 1).
 * Called automatically at the start of each runPriceMonitor() run.
 * Safe to call manually from the editor any time.
 *
 * @param {number} [days=14] - Rows with a Timestamp older than this are deleted.
 */
function cleanPriceMonitor(days) {
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (days || 14));

  var ss = SpreadsheetApp.openById(INV_SHEET_ID);
  var sh = ss.getSheetByName('Price Monitor');
  if (!sh || sh.getLastRow() < 2) return;

  // Read all timestamp values in column A (starting from row 2).
  var lastRow = sh.getLastRow();
  var tsValues = sh.getRange(2, 1, lastRow - 1, 1).getValues(); // [[ts], [ts], ...]

  // Collect the row numbers to delete (iterate from bottom to top
  // so deleting one row doesn't shift indices for rows above it).
  var toDelete = [];
  for (var i = tsValues.length - 1; i >= 0; i--) {
    var cell = tsValues[i][0];
    var rowDate = cell instanceof Date ? cell : new Date(String(cell));
    if (isNaN(rowDate.getTime()) || rowDate < cutoff) {
      toDelete.push(i + 2); // +2 because array is 0-indexed and row 1 is the header
    }
  }

  // Delete in runs to minimize API calls.
  if (!toDelete.length) {
    console.log('Price Monitor: no rows older than ' + (days || 14) + ' days to delete.');
    return;
  }

  // Group consecutive rows and delete as batches (bottom-up).
  var start = toDelete[0], end = toDelete[0], deleted = 0;
  for (var j = 1; j < toDelete.length; j++) {
    if (toDelete[j] === start - 1) {
      start = toDelete[j];
    } else {
      sh.deleteRows(start, end - start + 1);
      deleted += end - start + 1;
      start = toDelete[j];
      end   = toDelete[j];
    }
  }
  sh.deleteRows(start, end - start + 1);
  deleted += end - start + 1;
  console.log('Price Monitor: deleted ' + deleted + ' rows older than ' + (days || 14) + ' days.');
}

/**
 * Sends an email alert listing bikes where a brand's price is lower than ours.
 */
function _pmSendAlert_(alerts, timestamp) {
  try {
    var lines = [
      'Price Monitor alert — ' + new Date(timestamp).toLocaleString('en-US', { timeZone: 'America/New_York' }),
      '',
      alerts.length + ' bike(s) found where the brand website price is LOWER than ours:',
      '',
    ];
    alerts.forEach(function(a) {
      lines.push('• ' + a.brand + ' ' + a.model);
      lines.push('  Their price: ' + a.theirPrice + '   Our price: ' + a.ourPrice + '   Difference: -$' + _pmFmt_(a.diff));
      lines.push('  ' + a.url);
      lines.push('');
    });
    lines.push('Review and adjust prices in salespro.html or directly in the Inventory sheet.');

    MailApp.sendEmail({
      to:      'info@cruisethecreek.com',
      subject: '🔴 Price Monitor — ' + alerts.length + ' bike(s) priced lower on brand site',
      body:    lines.join('\n'),
    });
  } catch (e) {
    console.warn('Price Monitor alert email failed: ' + e);
  }
}
