// ============================================================
// Cruise the Creek — Bike Inventory Handlers
// FILE: InventoryHandlers.gs  (new file in the existing project)
//
// HOW TO USE:
//   1. In Apps Script editor, click + -> Script -> name it "InventoryHandlers"
//   2. Paste this entire file into it.
//   3. Set INV_SHEET_ID below to your bike inventory spreadsheet ID
//      (the long string in the sheet URL between /d/ and /edit).
//   4. In the EXISTING .gs file, add these 7 lines inside doGet(),
//      right after the line that reads the action:
//
//        if (action === 'getBikeInventory')    return handleGetBikeInventory(e);
//        if (action === 'getSidebarInventory') return handleGetSidebarInventory(e);
//        if (action === 'setDiscontinued')     return handleSetDiscontinued(e);
//        if (action === 'updatePrice')         return handleUpdatePrice(e);
//        if (action === 'saveColors')          return handleSaveColors(e);
//        if (action === 'saveSizeGuide')       return handleSaveSizeGuide(e);
//        if (action === 'getStock')            return handleGetStock(e);
//
//   5. Deploy -> Manage deployments -> Edit -> New version -> Deploy.
//
// SHEET STRUCTURE (tab named "Direct_Inventory"):
//   id           stable slug, e.g. "rangers"
//   order        number -- lower = first (use gaps of 10)
//   brand        "Heybike" | "Velotric" | "Jasion" | "Mooncool"
//   name         display name, e.g. "Ranger S"
//   subtitle     short descriptor, e.g. "Folding Fat Tire Step-Thru"
//   price        number only, no $
//   testRide     e.g. "Test Ride Available" or blank
//   styles       comma-separated, e.g. "750W,1000W"
//   sizes        comma-separated, e.g. "One Size" or "S,M,L,XL"
//   specs        JSON: {"Range":"55 mi","Top Speed":"28 mph","Motor":"750W","Battery":"692Wh"}
//   colors       JSON -- nested color/swatch data (see structure in comments below)
//   sizeGuide    JSON -- optional size chart per style
//   discontinued "Yes" to hide from public pages; blank = active
//   categories   comma-separated filter tags, e.g. "fat-tire,folding"
//   stock        JSON -- per-color stock counts, e.g. {"Merlot Red": 2}
//
// COLORS JSON STRUCTURE:
//   {
//     "750W": {
//       "One Size": [
//         { "name": "Merlot Red", "hex": "#8B0000",
//           "img": "images/Ranger S Melot Black.png", "price": 999, "soldOut": true }
//       ],
//       "disabled": true
//     },
//     "1000W": {
//       "One Size": [
//         { "name": "Merlot Red", "hex": "#8B0000",
//           "img": "images/Ranger S Melot Black.png", "price": 1199 }
//       ]
//     }
//   }
// ============================================================


// -- CONFIG -------------------------------------------------
// Replace with the ID from your bike inventory sheet URL.
// Find it between /d/ and /edit in the spreadsheet URL.
var INV_SHEET_ID = '1R3pDFG_sO61bKS6dEAa-k5F-OdD5OAbe4hQ-Oc0_T-E';
var INV_TAB_NAME = 'Inventory';


// -- HELPERS ------------------------------------------------

/**
 * Opens the inventory sheet and returns all rows as objects.
 * Each row also gets a rowIndex (1-based) for write-back actions.
 */
function _openInventorySheet_() {
  var ss = SpreadsheetApp.openById(INV_SHEET_ID);
  var sh = ss.getSheetByName(INV_TAB_NAME);
  if (!sh) throw new Error('Sheet tab "' + INV_TAB_NAME + '" not found in spreadsheet ' + INV_SHEET_ID + '.');
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return { sheet: sh, rows: [], headers: [] };
  var headers = data[0].map(function(h) { return String(h).trim(); });
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = {};
    headers.forEach(function(h, j) { row[h] = data[i][j]; });
    row.rowIndex = i + 1;
    rows.push(row);
  }
  return { sheet: sh, rows: rows, headers: headers };
}

/** Safely parses a JSON string from a sheet cell. */
function _parseJson_(cell, defaultVal) {
  var s = String(cell || '').trim();
  if (!s || s === '{}' || s === '[]') return defaultVal;
  try { return JSON.parse(s); } catch (e) { return defaultVal; }
}

/** Parses a comma-separated sheet cell into a trimmed string array. */
function _parseList_(cell) {
  var s = String(cell || '').trim();
  if (!s) return [];
  return s.split(',').map(function(x) { return x.trim(); }).filter(Boolean);
}

/** Converts a sheet row into a public bike object. */
function _rowToBike_(row) {
  var colors = _parseJson_(row.colors,    {});
  var specs  = _parseJson_(row.specs,     {});
  var guide  = _parseJson_(row.sizeGuide, {});
  var styles = _parseList_(row.styles);
  var sizes  = _parseList_(row.sizes);
  if (!styles.length) styles = ['Standard'];
  if (!sizes.length)  sizes  = ['One Size'];

  // Detect nested vs flat color structure
  var colorsNested = false;
  var firstKey = Object.keys(colors)[0];
  if (firstKey) {
    var firstVal = colors[firstKey];
    if (firstVal && typeof firstVal === 'object' && !Array.isArray(firstVal)) {
      var innerKey = Object.keys(firstVal)[0];
      if (innerKey) {
        var innerVal = firstVal[innerKey];
        if (Array.isArray(innerVal) ||
            (innerVal && typeof innerVal === 'object' && !innerVal.hex)) {
          colorsNested = true;
        }
      }
    }
  }

  return {
    brand:        String(row.brand    || ''),
    id:           String(row.id       || ''),
    name:         String(row.name     || ''),
    subtitle:     String(row.subtitle || ''),
    price:        Number(row.price)   || 0,
    testRide:     String(row.testRide || ''),
    styles:       styles,
    sizes:        sizes,
    specs:        specs,
    colors:       colors,
    colorsNested: colorsNested,
    sizeGuide:    guide,
  };
}

/** Returns true if a row is blank (no id or name). */
function _isBlankRow_(row) {
  return !String(row.id || '').trim() && !String(row.name || '').trim();
}

/** Returns true if a row is marked discontinued. */
function _isDiscontinued_(row) {
  var d = String(row.discontinued || '').trim().toLowerCase();
  return d === 'yes' || d === 'true';
}


// -- PUBLIC HANDLER: getBikeInventory -----------------------
/**
 * Returns the full public bike catalog as a JSON array.
 * Excludes discontinued bikes and blank rows. Sorted by "order" column.
 *
 * Called by: shop.html, quiz.html, heybike/velotric/jasion/mooncool.html,
 *            api/chat.js, repair-intake.html, GitHub Actions sync workflow.
 *
 * GET ?action=getBikeInventory
 */
function handleGetBikeInventory(e) {
  try {
    var inv = _openInventorySheet_();
    var bikes = inv.rows
      .filter(function(row) { return !_isBlankRow_(row) && !_isDiscontinued_(row); })
      .sort(function(a, b) { return (Number(a.order) || 999) - (Number(b.order) || 999); })
      .map(_rowToBike_);

    return ContentService
      .createTextOutput(JSON.stringify(bikes))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


// -- ADMIN HANDLER: getSidebarInventory ---------------------
/**
 * Like getBikeInventory but includes ALL bikes (even discontinued)
 * plus rowIndex, discontinued status, categories, and stock counts
 * so salespro.html can write updates back to the sheet.
 *
 * GET ?action=getSidebarInventory
 */
function handleGetSidebarInventory(e) {
  try {
    var inv = _openInventorySheet_();
    var bikes = inv.rows
      .filter(function(row) { return !_isBlankRow_(row); })
      .sort(function(a, b) { return (Number(a.order) || 999) - (Number(b.order) || 999); })
      .map(function(row) {
        var bike = _rowToBike_(row);
        bike.rowIndex     = row.rowIndex;
        bike.discontinued = String(row.discontinued || '').trim();
        bike.categories   = String(row.categories   || '').trim();
        bike.stock        = _parseJson_(row.stock, {});
        return bike;
      });

    return ContentService
      .createTextOutput(JSON.stringify(bikes))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


// -- ADMIN HANDLER: setDiscontinued -------------------------
/**
 * Sets or clears the discontinued flag on a bike row.
 *
 * GET ?action=setDiscontinued&rowIndex=<n>&discontinued=Yes   -> mark
 * GET ?action=setDiscontinued&rowIndex=<n>&discontinued=      -> clear
 */
function handleSetDiscontinued(e) {
  try {
    var p        = (e && e.parameter) || {};
    var rowIndex = parseInt(p.rowIndex, 10);
    var value    = String(p.discontinued || '').trim();
    if (!rowIndex || rowIndex < 2) throw new Error('Invalid rowIndex: ' + p.rowIndex);

    var inv = _openInventorySheet_();
    var col = inv.headers.indexOf('discontinued');
    if (col === -1) throw new Error('"discontinued" column not found.');

    inv.sheet.getRange(rowIndex, col + 1).setValue(value);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, rowIndex: rowIndex, discontinued: value }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


// -- ADMIN HANDLER: updatePrice -----------------------------
/**
 * Writes a new base price to a bike row.
 *
 * GET ?action=updatePrice&rowIndex=<n>&price=<number>
 */
function handleUpdatePrice(e) {
  try {
    var p        = (e && e.parameter) || {};
    var rowIndex = parseInt(p.rowIndex, 10);
    var price    = parseFloat(p.price);
    if (!rowIndex || rowIndex < 2) throw new Error('Invalid rowIndex: ' + p.rowIndex);
    if (isNaN(price) || price < 0)  throw new Error('Invalid price: ' + p.price);

    var inv = _openInventorySheet_();
    var col = inv.headers.indexOf('price');
    if (col === -1) throw new Error('"price" column not found.');

    inv.sheet.getRange(rowIndex, col + 1).setValue(price);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, rowIndex: rowIndex, price: price }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


// -- ADMIN HANDLER: saveColors ------------------------------
/**
 * Writes the full colors JSON blob back to a bike row.
 *
 * GET ?action=saveColors&rowIndex=<n>&json=<URL-encoded JSON>
 */
function handleSaveColors(e) {
  try {
    var p        = (e && e.parameter) || {};
    var rowIndex = parseInt(p.rowIndex, 10);
    var json     = String(p.json || '').trim();
    if (!rowIndex || rowIndex < 2) throw new Error('Invalid rowIndex: ' + p.rowIndex);
    JSON.parse(json); // validate before writing

    var inv = _openInventorySheet_();
    var col = inv.headers.indexOf('colors');
    if (col === -1) throw new Error('"colors" column not found.');

    inv.sheet.getRange(rowIndex, col + 1).setValue(json);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, rowIndex: rowIndex }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


// -- ADMIN HANDLER: saveSizeGuide ---------------------------
/**
 * Writes the size guide JSON blob back to a bike row.
 *
 * GET ?action=saveSizeGuide&rowIndex=<n>&json=<URL-encoded JSON>
 */
function handleSaveSizeGuide(e) {
  try {
    var p        = (e && e.parameter) || {};
    var rowIndex = parseInt(p.rowIndex, 10);
    var json     = String(p.json || '').trim();
    if (!rowIndex || rowIndex < 2) throw new Error('Invalid rowIndex: ' + p.rowIndex);
    JSON.parse(json); // validate before writing

    var inv = _openInventorySheet_();
    var col = inv.headers.indexOf('sizeGuide');
    if (col === -1) throw new Error('"sizeGuide" column not found.');

    inv.sheet.getRange(rowIndex, col + 1).setValue(json);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, rowIndex: rowIndex }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


// -- ADMIN HANDLER: getStock --------------------------------
/**
 * Returns per-bike stock counts keyed by bike id.
 * The "stock" column holds JSON: { colorName: quantity }
 *
 * GET ?action=getStock
 * Response: { "rangers": { "Merlot Red": 2, "Stone Blue": 0 }, ... }
 */
function handleGetStock(e) {
  try {
    var inv    = _openInventorySheet_();
    var result = {};
    inv.rows.forEach(function(row) {
      var id = String(row.id || '').trim();
      if (id) result[id] = _parseJson_(row.stock, {});
    });
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


// -- WEBHOOK: onInventoryEdit -------------------------------
/**
 * Fires when Pat edits the Direct_Inventory tab.
 * Triggers the GitHub Action that commits updated data/inventory.json
 * to the repo so Cloudflare Pages auto-rebuilds (~30s later).
 *
 * ONE-TIME SETUP:
 *   Step 1 -- Add your GitHub token as a Script Property:
 *     Project Settings (gear icon) -> Script Properties -> Add property
 *     Name:  GITHUB_PAT
 *     Value: <your GitHub personal access token with "repo" scope>
 *     (Create one at: github.com/settings/tokens -> Generate new token (classic)
 *      -> check "repo" -> Generate. Copy it -- you only see it once.)
 *
 *   Step 2 -- Register this as an installable On Edit trigger:
 *     Triggers (clock icon) -> + Add Trigger
 *     Function to run:    onInventoryEdit
 *     Event source:       From spreadsheet
 *     Event type:         On edit
 *     -> Save (approve permissions when prompted)
 */
function onInventoryEdit(e) {
  var sheet = e && e.range && e.range.getSheet();
  if (!sheet) return;
  if (sheet.getName() !== INV_TAB_NAME) return;

  var pat = PropertiesService.getScriptProperties().getProperty('GITHUB_PAT');
  if (!pat) {
    console.warn('GITHUB_PAT not set -- inventory sync skipped. See setup instructions in InventoryHandlers.gs.');
    return;
  }

  var payload = JSON.stringify({
    event_type: 'sync-inventory',
    client_payload: {
      triggered_by: 'apps-script-on-edit',
      tab:          INV_TAB_NAME,
      timestamp:    new Date().toISOString()
    }
  });

  var options = {
    method:      'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'token ' + pat,
      'Accept':        'application/vnd.github.v3+json',
      'User-Agent':    'CTC-Apps-Script'
    },
    payload:            payload,
    muteHttpExceptions: true
  };

  try {
    var resp = UrlFetchApp.fetch(
      'https://api.github.com/repos/cruisethecreek-tech/Ebike-sales/dispatches',
      options
    );
    console.log('GitHub inventory sync triggered. HTTP status:', resp.getResponseCode());
  } catch (err) {
    console.error('GitHub sync failed:', err);
  }
}
