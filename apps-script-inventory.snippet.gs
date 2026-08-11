/**
 * ============================================================
 * Cruise the Creek — Bike Inventory Apps Script
 * ============================================================
 *
 * This file contains the reconstructed handlers for the
 * separate "inventory" Apps Script project (deployment
 * AKfycbyxVMuF...). Paste ALL of this into that project's
 * code editor (or into a new file within it), then deploy
 * a new version as a Web App (Execute as: Me, Access: Anyone).
 *
 * ALTERNATIVELY: paste into apps-script.gs (the main project)
 * and add the dispatcher lines into _doGetInner(). The comment
 * at line 16 of apps-script.gs already calls this out as the
 * right long-term move.
 *
 * ── Handlers owned by this file ──────────────────────────
 *   getBikeInventory    → all public bike data (shop, quiz, brand pages, chat AI)
 *   getSidebarInventory → admin-only, includes rowIndex for write-back
 *   setDiscontinued     → marks/unmarks a bike as discontinued in the sheet
 *   updatePrice         → writes a new price to a bike row
 *   saveColors          → writes the full colors JSON blob to a bike row
 *   saveSizeGuide       → writes the size guide JSON blob to a bike row
 *   getStock            → returns per-bike stock/quantity data
 *
 * ── Sheet structure expected ──────────────────────────────
 * One sheet tab named "Direct_Inventory" with these columns
 * (header row 1, one bike per row):
 *
 *   id            stable slug, e.g. "rangers" — used as the JS id field
 *   order         number; lower = first in results (use gaps of 10)
 *   brand         "Heybike" | "Velotric" | "Jasion" | "Mooncool"
 *   name          display name, e.g. "Ranger S"
 *   subtitle      short descriptor, e.g. "Folding Fat Tire Step-Thru"
 *   price         number only, no $ — the base/displayed price
 *   testRide      free text, e.g. "Test Ride Available" or blank
 *   styles        comma-separated list, e.g. "750W,1000W" — maps to color groups
 *   sizes         comma-separated list, e.g. "One Size" or "S,M,L,XL"
 *   specs         JSON string: {"Range":"55 mi","Top Speed":"28 mph","Motor":"750W","Battery":"692Wh"}
 *                 Supported keys: Range, Top Speed, Motor, Battery, Torque, Weight
 *   colors        JSON string — full nested color/swatch data (see structure below)
 *   sizeGuide     JSON string — optional size chart data per style
 *   discontinued  "Yes" to hide from public pages; blank = active
 *   categories    comma-separated filter tags for shop.html, e.g. "fat-tire,folding"
 *   stock         JSON string — per-color stock counts, e.g. {"Merlot Red": 2}
 *
 * ── colors JSON structure ─────────────────────────────────
 * Nested (colorsNested: true) — one level per style, then per size:
 * {
 *   "750W": {
 *     "One Size": [
 *       { "name": "Merlot Red", "hex": "#8B0000", "img": "images/Ranger S Melot Black.png",
 *         "price": 999, "soldOut": true }
 *     ],
 *     "disabled": true          // optional: grays out this style tab
 *   },
 *   "1000W": {
 *     "One Size": [
 *       { "name": "Merlot Red", "hex": "#8B0000", "img": "images/Ranger S Melot Black.png",
 *         "price": 1199 }
 *     ]
 *   }
 * }
 *
 * ── CORS note ────────────────────────────────────────────
 * Apps Script web apps return a redirect before serving JSON.
 * Browser fetch() blocks cross-origin redirects (CORS), which
 * is why getBikeInventory stopped working on the front-end.
 * The site now reads from /data/inventory.json (same-origin)
 * instead. These handlers are only called server-side:
 *   - GitHub Actions sync-inventory.yml (curl, no CORS)
 *   - salespro.html write-back actions (mode:'no-cors' fire-and-forget)
 * ============================================================
 */

// ── CONSTANTS ──────────────────────────────────────────────
// Update SHEET_ID to the ID of the Google Sheet that holds Direct_Inventory.
// Find it in the Sheet URL: docs.google.com/spreadsheets/d/<SHEET_ID>/edit
var INV_SHEET_ID  = 'YOUR_SHEET_ID_HERE';   // ← paste your Sheet ID
var INV_TAB_NAME  = 'Direct_Inventory';

// ── ENTRY POINT (if used as a standalone project) ──────────
// If you paste this into the main apps-script.gs instead,
// delete this doGet and add the dispatcher lines (below) into
// _doGetInner() instead.
function doGet(e) {
  var action = String((e && e.parameter && e.parameter.action) || '').trim();
  if (action === 'getBikeInventory')    return handleGetBikeInventory(e);
  if (action === 'getSidebarInventory') return handleGetSidebarInventory(e);
  if (action === 'setDiscontinued')     return handleSetDiscontinued(e);
  if (action === 'updatePrice')         return handleUpdatePrice(e);
  if (action === 'saveColors')          return handleSaveColors(e);
  if (action === 'saveSizeGuide')       return handleSaveSizeGuide(e);
  if (action === 'getStock')            return handleGetStock(e);
  // Unknown action — return empty array so callers don't break
  return ContentService
    .createTextOutput('[]')
    .setMimeType(ContentService.MimeType.JSON);
}

// ── DISPATCHER LINES for apps-script.gs _doGetInner() ─────
// If consolidating into the main project, add these lines at
// the top of _doGetInner(), then delete the doGet() above:
//
//   if (action === 'getBikeInventory')    return handleGetBikeInventory(e);
//   if (action === 'getSidebarInventory') return handleGetSidebarInventory(e);
//   if (action === 'setDiscontinued')     return handleSetDiscontinued(e);
//   if (action === 'updatePrice')         return handleUpdatePrice(e);
//   if (action === 'saveColors')          return handleSaveColors(e);
//   if (action === 'saveSizeGuide')       return handleSaveSizeGuide(e);
//   if (action === 'getStock')            return handleGetStock(e);

// ── HELPERS ────────────────────────────────────────────────

/**
 * Opens the inventory sheet and returns all rows with headers
 * as an array of {rowIndex, ...columns} objects.
 * rowIndex is 1-based (row 1 = header, row 2 = first data row).
 */
function _openInventorySheet_() {
  var ss = SpreadsheetApp.openById(INV_SHEET_ID);
  var sh = ss.getSheetByName(INV_TAB_NAME);
  if (!sh) throw new Error('Sheet tab "' + INV_TAB_NAME + '" not found.');
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return { sheet: sh, rows: [], headers: [] };
  var headers = data[0].map(function(h) { return String(h).trim(); });
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = {};
    headers.forEach(function(h, j) { row[h] = data[i][j]; });
    row.rowIndex = i + 1;  // 1-based sheet row number
    rows.push(row);
  }
  return { sheet: sh, rows: rows, headers: headers };
}

/**
 * Safely parse a JSON string stored in a sheet cell.
 * Returns defaultVal if the cell is blank or malformed.
 */
function _parseJson_(cell, defaultVal) {
  var s = String(cell || '').trim();
  if (!s || s === '{}' || s === '[]') return defaultVal;
  try { return JSON.parse(s); } catch (e) { return defaultVal; }
}

/**
 * Parse a comma-separated sheet cell into a trimmed string array.
 * Returns [] if blank.
 */
function _parseList_(cell) {
  var s = String(cell || '').trim();
  if (!s) return [];
  return s.split(',').map(function(x) { return x.trim(); }).filter(Boolean);
}

/**
 * Build a public bike object from a sheet row.
 * This is the shape returned by getBikeInventory and consumed by
 * shop.html, quiz.html, heybike/velotric/jasion/mooncool.html, and api/chat.js.
 */
function _rowToBike_(row) {
  var colors  = _parseJson_(row.colors,    {});
  var specs   = _parseJson_(row.specs,     {});
  var guide   = _parseJson_(row.sizeGuide, {});
  var styles  = _parseList_(row.styles);
  var sizes   = _parseList_(row.sizes);
  if (!styles.length) styles = ['Standard'];
  if (!sizes.length)  sizes  = ['One Size'];

  // Detect nested vs flat colors.
  // Nested = { styleName: { sizeName: [swatches] } }
  // Flat   = { colorName: { hex, img, price } }
  // The live data uses nested exclusively, but we handle flat gracefully.
  var colorsNested = false;
  var firstVal = colors[Object.keys(colors)[0]];
  if (firstVal && typeof firstVal === 'object' && !Array.isArray(firstVal)) {
    var innerVal = firstVal[Object.keys(firstVal)[0]];
    if (Array.isArray(innerVal) ||
        (typeof innerVal === 'object' && innerVal !== null && !innerVal.hex)) {
      colorsNested = true;
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

// ── PUBLIC HANDLER: getBikeInventory ───────────────────────
/**
 * Returns the full public bike catalog as a JSON array.
 * Excludes rows where discontinued = "Yes" (case-insensitive).
 * Called by: shop.html, quiz.html, heybike/velotric/jasion/mooncool.html,
 *            api/chat.js, repair-intake.html, GitHub Actions sync workflow.
 *
 * GET ?action=getBikeInventory
 * Response: [ { brand, id, name, subtitle, price, testRide, styles,
 *               sizes, specs, colors, colorsNested, sizeGuide }, ... ]
 */
function handleGetBikeInventory(e) {
  try {
    var inv = _openInventorySheet_();
    var bikes = inv.rows
      .filter(function(row) {
        // Skip discontinued rows
        var disc = String(row.discontinued || '').trim().toLowerCase();
        if (disc === 'yes' || disc === 'true') return false;
        // Skip rows with no id or name (blank / spacer rows)
        if (!String(row.id || '').trim() && !String(row.name || '').trim()) return false;
        return true;
      })
      .sort(function(a, b) {
        return (Number(a.order) || 999) - (Number(b.order) || 999);
      })
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

// ── ADMIN HANDLER: getSidebarInventory ─────────────────────
/**
 * Like getBikeInventory but INCLUDES discontinued bikes and adds
 * rowIndex so salespro.html can write updates back to the sheet.
 * Also includes categories and stock for the admin UI.
 *
 * GET ?action=getSidebarInventory
 * Response: [ { ...bike fields, rowIndex, discontinued, categories, stock }, ... ]
 */
function handleGetSidebarInventory(e) {
  try {
    var inv = _openInventorySheet_();
    var bikes = inv.rows
      .filter(function(row) {
        return String(row.id || '').trim() || String(row.name || '').trim();
      })
      .sort(function(a, b) {
        return (Number(a.order) || 999) - (Number(b.order) || 999);
      })
      .map(function(row) {
        var bike = _rowToBike_(row);
        bike.rowIndex    = row.rowIndex;
        bike.discontinued = String(row.discontinued || '').trim();
        bike.categories  = String(row.categories || '').trim();
        bike.stock       = _parseJson_(row.stock, {});
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

// ── ADMIN HANDLER: setDiscontinued ─────────────────────────
/**
 * Sets (or clears) the "discontinued" flag on a bike row.
 * Called by salespro.html when an admin marks a bike as discontinued.
 *
 * GET ?action=setDiscontinued&rowIndex=<n>&discontinued=Yes   → mark discontinued
 * GET ?action=setDiscontinued&rowIndex=<n>&discontinued=      → clear (re-activate)
 */
function handleSetDiscontinued(e) {
  try {
    var p = e && e.parameter || {};
    var rowIndex = parseInt(p.rowIndex, 10);
    var value    = String(p.discontinued || '').trim();
    if (!rowIndex || rowIndex < 2) throw new Error('Invalid rowIndex: ' + p.rowIndex);

    var inv = _openInventorySheet_();
    var headers = inv.headers;
    var col = headers.indexOf('discontinued');
    if (col === -1) throw new Error('"discontinued" column not found in sheet header.');

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

// ── ADMIN HANDLER: updatePrice ─────────────────────────────
/**
 * Writes a new base price to a bike row.
 * Called by salespro.html when an admin edits a bike's price.
 *
 * GET ?action=updatePrice&rowIndex=<n>&price=<number>
 */
function handleUpdatePrice(e) {
  try {
    var p = e && e.parameter || {};
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

// ── ADMIN HANDLER: saveColors ──────────────────────────────
/**
 * Writes the full colors JSON blob back to a bike row.
 * Called by salespro.html's color editor when an admin updates swatches.
 *
 * GET ?action=saveColors&rowIndex=<n>&json=<URL-encoded JSON string>
 */
function handleSaveColors(e) {
  try {
    var p = e && e.parameter || {};
    var rowIndex = parseInt(p.rowIndex, 10);
    var json     = String(p.json || '').trim();
    if (!rowIndex || rowIndex < 2) throw new Error('Invalid rowIndex: ' + p.rowIndex);
    // Validate it's parseable JSON before writing
    JSON.parse(json);

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

// ── ADMIN HANDLER: saveSizeGuide ───────────────────────────
/**
 * Writes the size guide JSON blob back to a bike row.
 * Called by salespro.html's size guide editor.
 *
 * GET ?action=saveSizeGuide&rowIndex=<n>&json=<URL-encoded JSON string>
 */
function handleSaveSizeGuide(e) {
  try {
    var p = e && e.parameter || {};
    var rowIndex = parseInt(p.rowIndex, 10);
    var json     = String(p.json || '').trim();
    if (!rowIndex || rowIndex < 2) throw new Error('Invalid rowIndex: ' + p.rowIndex);
    JSON.parse(json);

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

// ── ADMIN HANDLER: getStock ────────────────────────────────
/**
 * Returns per-bike stock counts keyed by bike id.
 * The "stock" column holds a JSON string of { colorName: quantity }.
 *
 * GET ?action=getStock
 * Response: { "rangers": { "Merlot Red": 2, "Stone Blue": 0 }, ... }
 */
function handleGetStock(e) {
  try {
    var inv = _openInventorySheet_();
    var result = {};
    inv.rows.forEach(function(row) {
      var id = String(row.id || '').trim();
      if (!id) return;
      result[id] = _parseJson_(row.stock, {});
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

// ── WEBHOOK: onInventoryEdit ───────────────────────────────
/**
 * Fires when someone edits the Direct_Inventory tab.
 * Triggers the GitHub Action that commits updated data/inventory.json.
 *
 * SETUP:
 * 1. Add script property GITHUB_PAT (a GitHub personal access token with repo scope).
 *    Project Settings → Script Properties → Add property.
 * 2. Register this as an installable onEdit trigger:
 *    Triggers (clock icon) → Add Trigger → onInventoryEdit → On edit → From spreadsheet.
 *
 * See INVENTORY_SYNC_SETUP.md in the repo for full setup instructions.
 */
function onInventoryEdit(e) {
  var sheet = e && e.range && e.range.getSheet();
  if (!sheet) return;
  if (sheet.getName() !== INV_TAB_NAME) return;

  var pat = PropertiesService.getScriptProperties().getProperty('GITHUB_PAT');
  if (!pat) { console.warn('GITHUB_PAT not set — inventory sync skipped'); return; }

  var payload = JSON.stringify({
    event_type: 'sync-inventory',
    client_payload: {
      triggered_by: 'apps-script-on-edit',
      tab: INV_TAB_NAME,
      timestamp: new Date().toISOString()
    }
  });

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'token ' + pat,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'CTC-Apps-Script'
    },
    payload: payload,
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
