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
//        if (action === 'inventoryVersion')    return handleInventoryVersion(e);
//
//   5. Deploy -> Manage deployments -> pencil -> New version -> Deploy.
//      NOT "New deployment" — that mints a second /exec URL and leaves the
//      one the site uses untouched.
//
// IF A SAVE STILL DOES NOT STICK AFTER DEPLOYING:
//   a. Open <your /exec URL>?action=inventoryVersion in a browser.
//      - "version" must equal INV_HANDLERS_VERSION below. If it is older or
//        the response is an error page, the deployment did not take: repeat
//        step 5 and make sure you picked New version, not New deployment.
//      - "writesWillWork" must be true. If "missingColumns" lists anything,
//        the sheet's headers were renamed and the handlers cannot find them.
//      - "handlersAreCurrent" must be true. If it is false, "staleHandlers"
//        names the ones still running old code -- see (b).
//   b. Apps Script evaluates every .gs file in the project into ONE global
//      scope. Two files that both declare handleSaveColors do not conflict:
//      the last one evaluated simply wins, silently. So pasting this file in
//      as a NEW file while the old one survives changes NOTHING, and looks
//      identical to a successful fix -- the endpoint above will even report
//      the right version and the right column indexes, because the new file
//      really is deployed. Only the handler body lost.
//      That is what "handlersAreCurrent": false means. Search the project for
//      the handler it names and delete every copy but this one. Redeploying
//      will not help: the project is already deployed correctly.
//
// SHEET STRUCTURE (tab named "Inventory" — see INV_TAB_NAME below):
//   id           stable slug, e.g. "rangers"
//   order        number -- lower = first (use gaps of 10)
//   brand        "Heybike" | "Velotric" | "Jasion" | "Mooncool" | "Mokwheel"
//   name         display name, e.g. "Ranger S"
//   subtitle     short descriptor, e.g. "Folding Fat Tire Step-Thru"
//   price        number only, no $
//   testRide     STATUS only, free text shown beside the bike.
//                e.g. "Test Ride Available", "Class 4 Needs Registration",
//                "Test Ride March 30th", or blank.
//   testRideLoc  WHICH SHOP the bike can be demoed at. This is what puts it on
//                test-ride.html, so a bike with a status but no location will
//                not appear there. Accepted: "Kirk Road", "Bears Den", "Both",
//                or a list ("Kirk Road, Bears Den"). Blank = not offered.
//                Name the column exactly "testRideLoc" (or "testRideLocation",
//                "Test Ride Location", "Test Ride Loc" — all are accepted).
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
var INV_SHEET_ID = '1R3pDFG_sO81bKS6dEAa-k5F-OdD5OAbe4hQ-Oc0_T-E';
var INV_TAB_NAME = 'Inventory';

// Bump this string whenever you paste a new copy of this file into the editor.
// ?action=inventoryVersion echoes it back, so you can tell at a glance whether
// the /exec URL is serving the code you just saved or an older deployment.
var INV_HANDLERS_VERSION = '2026-09-21b';


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

/**
 * Read a field from a row whatever case its header happens to use.
 *
 * _openInventorySheet_ keys each row by the header cell VERBATIM, so
 * row.discontinued only resolves when the header is spelled exactly
 * "discontinued". This sheet's header is "Discontinued", so the lookup
 * returned undefined, _isDiscontinued_ saw an empty string, and nine rows
 * marked yes were published anyway. Nothing anywhere reported it — the value
 * was right there in the cell, and the reader simply never found it.
 *
 * Exact match first, so nothing that works today changes. Then a match that
 * ignores case, punctuation and a parenthesised suffix, because this sheet's
 * headers read "Specs (JSON)", "Colors (JSON)" and "SizeGuide (JSON)".
 * Dropping only case and punctuation was not enough: those normalise to
 * "specsjson" and "colorsjson", which match nothing, and a deploy in that
 * state would have emptied the specs and colour swatches on every bike while
 * fixing the discontinued flag.
 *
 * A one-character difference in a header should not be able to put a retired
 * bike back on the shop, or take the photos off a live one.
 */
function _rowNormKey_(k) {
  return String(k == null ? '' : k)
    .replace(/\([^)]*\)/g, '')   // drop "(JSON)" and anything else parenthesised
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Column index for a header, tolerant of case and a "(JSON)" suffix.
 *
 * The four admin write handlers used headers.indexOf('colors') and friends.
 * Against this sheet every one of them returned -1 and threw "column not
 * found", because the headers read "Colors (JSON)", "Price", "SizeGuide
 * (JSON)" and "Discontinued". So salespro's colour editor, price editor, size
 * guide and discontinue toggle have all been failing — the same single cause
 * as the read path, on the side that writes.
 */
function _headerIndex_(headers, key) {
  var exact = headers.indexOf(key);
  if (exact !== -1) return exact;
  var want = _rowNormKey_(key);
  for (var i = 0; i < headers.length; i++) {
    if (_rowNormKey_(headers[i]) === want) return i;
  }
  return -1;
}

function _rowGet_(row, key) {
  if (row == null) return undefined;
  if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  var want = _rowNormKey_(key);
  if (!want) return undefined;
  var keys = Object.keys(row);
  for (var i = 0; i < keys.length; i++) {
    if (_rowNormKey_(keys[i]) === want) return row[keys[i]];
  }
  return undefined;
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
  var colors = _parseJson_(_rowGet_(row, 'colors'),    {});
  var specs  = _parseJson_(_rowGet_(row, 'specs'),     {});
  var guide  = _parseJson_(_rowGet_(row, 'sizeGuide'), {});
  var styles = _parseList_(_rowGet_(row, 'styles'));
  var sizes  = _parseList_(_rowGet_(row, 'sizes'));
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
    brand:        String(_rowGet_(row, 'brand')    || ''),
    id:           String(_rowGet_(row, 'id')       || ''),
    name:         String(_rowGet_(row, 'name')     || ''),
    subtitle:     String(_rowGet_(row, 'subtitle') || ''),
    price:        Number(_rowGet_(row, 'price'))   || 0,
    testRide:     String(_rowGet_(row, 'testRide') || ''),
    // Kept separate from testRide deliberately: one column said both where a
    // bike could be ridden and what the caveat was, so neither could be read
    // reliably. Location decides whether it appears on test-ride.html;
    // testRide is the note shown next to it.
    // _openInventorySheet_ uses the header cell verbatim as the key, so the
    // column has to be named one of these. Several spellings are accepted
    // because a header typo would otherwise fail silently — the field would
    // just be empty and every bike would quietly vanish from test-ride.html.
    testRideLoc:  String(
                    row.testRideLoc || row.testRideLocation ||
                    row['Test Ride Location'] || row['Test Ride Loc'] || ''
                  ),
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
  return !String(_rowGet_(row, 'id') || '').trim() && !String(_rowGet_(row, 'name') || '').trim();
}

/** Returns true if a row is marked discontinued. */
function _isDiscontinued_(row) {
  var d = String(_rowGet_(row, 'discontinued') || '').trim().toLowerCase();
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
        bike.discontinued = String(_rowGet_(row, 'discontinued') || '').trim();
        bike.categories   = String(_rowGet_(row, 'categories')   || '').trim();
        bike.stock        = _parseJson_(_rowGet_(row, 'stock'), {});
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
    var col = _headerIndex_(inv.headers, 'discontinued');
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
    var col = _headerIndex_(inv.headers, 'price');
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
    var col = _headerIndex_(inv.headers, 'colors');
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
    var col = _headerIndex_(inv.headers, 'sizeGuide');
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


// -- DIAGNOSTIC HANDLER: inventoryVersion -------------------
/**
 * Reports which copy of this file the /exec URL is actually running.
 *
 * Apps Script serves the DEPLOYED version, not whatever is saved in the
 * editor, and every write handler here used to fail silently because the
 * front end sent its saves with mode:'no-cors' — an opaque response looks
 * identical whether the server accepted the write or threw. So "I saved it"
 * and "I deployed it" were both unfalsifiable from the browser.
 *
 * This endpoint makes them falsifiable. It needs no arguments, writes
 * nothing, and answers the two questions that actually matter:
 *
 *   version      — the INV_HANDLERS_VERSION baked into the DEPLOYED code.
 *                  If this is not the string at the top of the file you just
 *                  pasted, you are looking at an older deployment: go to
 *                  Deploy -> Manage deployments -> pencil -> New version.
 *   colorsColumn — the resolved column index for the colours blob. Anything
 *                  other than -1 means saveColors can find its column. -1 is
 *                  the bug that ate every colour save: the real header reads
 *                  "Colors (JSON)", so a bare headers.indexOf('colors')
 *                  misses it and the handler throws.
 *
 * GET ?action=inventoryVersion
 */
/**
 * Describe the function body that actually won the global namespace.
 *
 * Apps Script evaluates every .gs file in the project into ONE global scope,
 * so two files that both declare handleSaveColors do not conflict — the last
 * one evaluated simply wins, silently. Pasting the fixed code into a NEW file
 * while the old file still exists therefore changes nothing, and looks
 * identical to a successful fix from every angle except the actual result.
 *
 * Function.prototype.toString returns the source of whichever body won, so
 * this reports the truth rather than what the project is supposed to contain.
 */
function _handlerReport_(fn) {
  if (typeof fn !== 'function') return { present: false };
  var src = String(fn);
  return {
    present: true,
    // The fix: a lookup tolerant of "Colors (JSON)" and friends.
    usesHeaderIndex: src.indexOf('_headerIndex_') !== -1,
    // The bug: an exact match that returns -1 against this sheet's headers.
    usesBareIndexOf: /headers\s*\.\s*indexOf\s*\(/.test(src),
    length: src.length
  };
}

function handleInventoryVersion(e) {
  var out = {
    ok: true,
    version: INV_HANDLERS_VERSION,
    hasHeaderIndex: (typeof _headerIndex_ === 'function')
  };

  // Which copy of each write handler is the one that will actually run?
  // hasHeaderIndex above only says the helper EXISTS somewhere in the
  // project; it says nothing about whether the handlers call it.
  out.handlers = {
    saveColors:     _handlerReport_(typeof handleSaveColors     === 'function' ? handleSaveColors     : null),
    updatePrice:    _handlerReport_(typeof handleUpdatePrice    === 'function' ? handleUpdatePrice    : null),
    setDiscontinued:_handlerReport_(typeof handleSetDiscontinued=== 'function' ? handleSetDiscontinued: null),
    saveSizeGuide:  _handlerReport_(typeof handleSaveSizeGuide  === 'function' ? handleSaveSizeGuide  : null)
  };
  var stale = [];
  for (var h in out.handlers) {
    var r = out.handlers[h];
    if (r.present && !r.usesHeaderIndex) stale.push(h);
  }
  out.staleHandlers = stale;
  // The headline. False means an older copy of one of these handlers is
  // shadowing the fixed one — find it and delete it; a redeploy will not
  // help, because the project really is deployed.
  out.handlersAreCurrent = (stale.length === 0);
  try {
    var inv = _openInventorySheet_();
    out.headers = inv.headers;
    out.rowCount = inv.rows.length;
    out.columns = {
      colors:        _headerIndex_(inv.headers, 'colors'),
      price:         _headerIndex_(inv.headers, 'price'),
      sizeGuide:     _headerIndex_(inv.headers, 'sizeGuide'),
      discontinued:  _headerIndex_(inv.headers, 'discontinued')
    };
    var missing = [];
    for (var k in out.columns) {
      if (out.columns[k] === -1) missing.push(k);
    }
    out.missingColumns = missing;
    // Both halves have to hold: the columns must resolve AND the handlers
    // doing the resolving must be the fixed ones. Reporting only the first
    // is what let a stale handler hide behind a healthy-looking sheet.
    out.writesWillWork = (missing.length === 0) && out.handlersAreCurrent;
  } catch (err) {
    out.ok = false;
    out.error = String(err);
  }
  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
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
      var id = String(_rowGet_(row, 'id') || '').trim();
      if (id) result[id] = _parseJson_(_rowGet_(row, 'stock'), {});
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
 * Fires when Pat edits the Inventory tab.
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

/**
 * testGithubSyncTrigger — check the auto-sync setup without touching the sheet.
 *
 * Run this from the editor dropdown. It reports, in order, the three things
 * that have to be true, and stops at the first one that is not:
 *
 *   1. GITHUB_PAT exists in Script Properties
 *   2. this project is allowed to read it (the script.storage OAuth scope)
 *   3. GitHub accepts the dispatch (HTTP 204)
 *
 * The on-edit trigger swallows all of this: onInventoryEdit logs a warning and
 * returns when the token is missing, and an installable trigger's log is not
 * the one you are looking at. That is why the sync has never fired and nothing
 * ever said so.
 *
 * A successful run DOES start a real sync — that is the point, it proves the
 * whole path works end to end.
 */
function testGithubSyncTrigger() {
  var pat;
  try {
    pat = PropertiesService.getScriptProperties().getProperty('GITHUB_PAT');
  } catch (err) {
    Logger.log('FAILED at step 2: this project cannot read Script Properties.');
    Logger.log('  ' + err);
    Logger.log('  Add this to appsscript.json under oauthScopes, then re-authorise:');
    Logger.log('    https://www.googleapis.com/auth/script.storage');
    return { ok: false, step: 'scope' };
  }

  if (!pat) {
    Logger.log('FAILED at step 1: no GITHUB_PAT in Script Properties.');

    // Print the keys that DO exist. "Not saved yet", "typed the name wrong" and
    // "added it to the other Apps Script project" all look identical otherwise,
    // and the last one is easy to do when two projects are open in two tabs.
    var keys = PropertiesService.getScriptProperties().getKeys();
    if (!keys.length) {
      Logger.log('  This project has NO script properties at all.');
      Logger.log('  If you did add one, check you added it to "Pricing and Orders"');
      Logger.log('  and not the other Apps Script project.');
    } else {
      Logger.log('  Properties this project does have (names only, no values):');
      keys.forEach(function (k) {
        Logger.log('    "' + k + '"' + (k !== k.trim() ? '   <- has a stray space' : ''));
      });
      Logger.log('  The name must be exactly GITHUB_PAT — capitals, underscore, no spaces.');
    }
    Logger.log('  Project Settings -> Script Properties -> Add script property');
    Logger.log('  Property: GITHUB_PAT     Value: the token');
    Logger.log('  Then press the Save button under the table — the row does not');
    Logger.log('  save on its own when you click away.');
    return { ok: false, step: 'token', keys: keys };
  }
  Logger.log('1. GITHUB_PAT found (' + pat.length + ' chars, starts "' +
             pat.slice(0, 4) + '...")  — the value itself is never logged.');
  Logger.log('2. Script Properties readable — the script.storage scope is present.');

  var resp = UrlFetchApp.fetch(
    'https://api.github.com/repos/cruisethecreek-tech/Ebike-sales/dispatches', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': 'token ' + pat,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'CTC-Apps-Script'
      },
      payload: JSON.stringify({
        event_type: 'sync-inventory',
        client_payload: { triggered_by: 'testGithubSyncTrigger' }
      }),
      muteHttpExceptions: true
    });

  var code = resp.getResponseCode();
  Logger.log('3. GitHub replied HTTP ' + code);

  if (code === 204) {
    Logger.log('\nWorking. A sync is running now — check the Actions tab, the run');
    Logger.log('will say "repository_dispatch" instead of "Scheduled".');
    Logger.log('Now add the On edit trigger so this happens by itself:');
    Logger.log('  Triggers (clock icon) -> Add Trigger -> onInventoryEdit,');
    Logger.log('  Head, From spreadsheet, On edit.');
    return { ok: true };
  }

  if (code === 401) Logger.log('  401 — the token is wrong, revoked, or expired.');
  if (code === 403) Logger.log('  403 — the token lacks Contents: Read and write on this repo.');
  if (code === 404) Logger.log('  404 — the token cannot see the repo. On a fine-grained');
  if (code === 404) Logger.log('        token, check it lists Ebike-sales under Repository access.');
  Logger.log('  Body: ' + resp.getContentText().slice(0, 300));
  return { ok: false, step: 'github', code: code };
}

/**
 * setGithubPatOnce — write GITHUB_PAT from code, because the Script Properties
 * UI drops rows.
 *
 * The Project Settings table looks like it saved, and the value is gone on the
 * next load. Writing the property from code is the same storage, without that
 * screen in the way.
 *
 * HOW TO USE, AND THEN UNDO
 *
 *   1. Paste your token between the quotes below, replacing PASTE_TOKEN_HERE.
 *   2. Save (Ctrl+S), then Run this function once. It prints a confirmation.
 *   3. DELETE THE TOKEN from the line below, leaving PASTE_TOKEN_HERE, and save
 *      again. The property is already stored — the code does not need to keep
 *      holding it.
 *
 * WHY STEP 3 MATTERS
 *
 * Anything typed into this editor is readable by anyone with access to the
 * project, shows up in its version history, and travels with the file if it is
 * ever copied, pasted into a chat, or committed. The stored property is not in
 * any of those places. Leaving the token in the code turns a private credential
 * into part of the source. It can write to your repository.
 *
 * If the token ever does get out, revoke it at
 * https://github.com/settings/tokens?type=beta and issue a new one.
 */
function setGithubPatOnce() {
  var TOKEN = 'PASTE_TOKEN_HERE';

  if (!TOKEN || TOKEN === 'PASTE_TOKEN_HERE') {
    Logger.log('Nothing to do — replace PASTE_TOKEN_HERE with the token first.');
    return { ok: false, reason: 'placeholder' };
  }
  if (TOKEN !== TOKEN.trim()) {
    Logger.log('The token has a space or newline around it. Copy it again cleanly.');
    return { ok: false, reason: 'whitespace' };
  }

  try {
    PropertiesService.getScriptProperties().setProperty('GITHUB_PAT', TOKEN);
  } catch (err) {
    Logger.log('Could not write the property: ' + err);
    Logger.log('That usually means this account cannot edit this project.');
    return { ok: false, reason: 'write failed' };
  }

  var back = PropertiesService.getScriptProperties().getProperty('GITHUB_PAT');
  if (back !== TOKEN) {
    Logger.log('Wrote it, but reading it back gave something different. Stop here.');
    return { ok: false, reason: 'readback mismatch' };
  }

  Logger.log('Stored. GITHUB_PAT is ' + back.length + ' chars, starts "' +
             back.slice(0, 4) + '..." — the value itself is never logged.');
  Logger.log('');
  Logger.log('NOW DELETE THE TOKEN from the TOKEN line above and save. The');
  Logger.log('property is stored; the code does not need to keep a copy.');
  Logger.log('Then run testGithubSyncTrigger — you want HTTP 204.');
  return { ok: true };
}

/** Names of the script properties this project holds. Never prints a value. */
function showScriptPropertyNames() {
  var keys = PropertiesService.getScriptProperties().getKeys();
  Logger.log(keys.length ? 'Script properties here: ' + keys.map(function (k) {
    return '"' + k + '"';
  }).join(', ') : 'This project has no script properties.');
  return keys;
}

/**
 * diagnoseInventoryFilter — decide, in one run, WHERE the discontinued filter
 * is being lost.
 *
 * Three different failures look identical from the website, and guessing
 * between them costs a deploy and a sync each time:
 *
 *   A. the new code is not in this project at all (paste went elsewhere, or
 *      an older copy in another .gs file defines the same function name and
 *      wins — Apps Script keeps the LAST definition loaded, not the one you
 *      are looking at)
 *   B. the code is here and correct, but /exec still serves an older
 *      deployment, so the website sees the old logic
 *   C. both are current and the sheet genuinely has fewer rows marked than
 *      you think
 *
 * This runs against the real sheet using whatever definitions this project
 * currently has, and prints the number the code computes right now. Compare it
 * with what the /exec URL returns:
 *
 *   this says 73, /exec returns 82  -> B, redeploy (Manage deployments ->
 *                                      pencil -> New version)
 *   this says 82                    -> A or C, and the detail below says which
 */
function diagnoseInventoryFilter() {
  Logger.log('=== Inventory filter diagnosis ===\n');

  // A: is the current code even loaded? _rowGet_ arrived with the fix, so its
  // absence means this project is running an older copy of this file.
  var hasRowGet = (typeof _rowGet_ === 'function');
  Logger.log('_rowGet_ present in this project : ' + hasRowGet);
  if (!hasRowGet) {
    Logger.log('  -> The fix is NOT loaded. Either the paste did not land in this');
    Logger.log('     project, or another .gs file here defines these functions too');
    Logger.log('     and its copy wins. Search the project for "_isDiscontinued_";');
    Logger.log('     there must be exactly one.');
    return { ok: false, reason: 'old code' };
  }

  var inv = _openInventorySheet_();
  Logger.log('Headers, exactly as the sheet spells them:');
  Logger.log('  ' + inv.headers.map(function (h) { return JSON.stringify(h); }).join(', '));

  var total = inv.rows.length, blank = 0, disc = 0, published = 0;
  var sample = [];
  inv.rows.forEach(function (row) {
    if (_isBlankRow_(row)) { blank++; return; }
    var raw = _rowGet_(row, 'discontinued');
    if (_isDiscontinued_(row)) {
      disc++;
      if (sample.length < 4) {
        sample.push(String(_rowGet_(row, 'name') || '?') + '  cell=' + JSON.stringify(raw));
      }
    } else {
      published++;
    }
  });

  Logger.log('\nRows in the tab        : ' + total);
  Logger.log('  blank                : ' + blank);
  Logger.log('  discontinued         : ' + disc);
  Logger.log('  WOULD BE PUBLISHED   : ' + published);

  if (sample.length) {
    Logger.log('\nExamples this code hides:');
    sample.forEach(function (s) { Logger.log('  ' + s); });
  }

  Logger.log('\nNow open the /exec URL with ?action=getBikeInventory and count.');
  Logger.log('If it returns more than ' + published + ', the code here is right and the');
  Logger.log('DEPLOYMENT is stale: Deploy -> Manage deployments -> pencil ->');
  Logger.log('Version: New version -> Deploy. Do not use "New deployment" —');
  Logger.log('that makes a second URL and every page points at the current one.');

  return { ok: true, total: total, blank: blank, discontinued: disc, published: published };
}
