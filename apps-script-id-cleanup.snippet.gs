/**
 * PASTE TARGET: the INVENTORY Apps Script project (deployment AKfycbyxVMuF… —
 * the one that owns getBikeInventory and reads the bike inventory spreadsheet).
 *
 * This file is NOT executed from the repo — Apps Script source lives only in
 * the Apps Script editor. Paste it as a new script file, then run
 * cleanupBikeIds() from the editor.
 *
 * WHAT IT DOES
 *   Normalizes the ID column to lowercase-hyphen slugs. Hand-typed ids like
 *   "Thunder pro", "Thunder prost" and "eb5 roamer" become "thunder-pro",
 *   "thunder-pro-st" and "eb5-roamer".
 *
 * WHY IT MATTERS
 *   The id is a join key. Stock counts and the ?bike= deep link from
 *   shop.html both resolve through it. Nothing is broken today — the site
 *   escapes ids properly — but a key that a human retypes is a key that can
 *   silently stop matching.
 *
 * WHAT IT DOES *NOT* NEED TO DO
 *   Stock does not need migrating. getStock builds its response as
 *   result[row.id] = <that row's stock column>, so the counts live in the row
 *   and follow the rename automatically. Write-back handlers (setDiscontinued,
 *   updatePrice, saveColors) address rows by rowIndex, not id, so salespro is
 *   unaffected.
 *
 * SAFE BY DEFAULT
 *   Dry run unless you pass true. Nothing is written until you have read the
 *   log and agree with every rename. Re-running after an apply is a no-op.
 *
 * HOW TO RUN
 *   1. cleanupBikeIds()      -> dry run. Read the execution log.
 *   2. cleanupBikeIds(true)  -> applies the renames, writes an ID_Migration_Log
 *                               tab, and returns the mapping.
 *
 *   After applying, trigger a sync (edit any inventory cell, or run the
 *   sync-inventory GitHub Action manually) so data/inventory.json picks up the
 *   new ids.
 */

// The tab holding the bike rows. Matches INV_TAB_NAME in InventoryHandlers.gs —
// if you renamed the tab, change it in both places.
var IDC_TAB_NAME = 'Inventory';

// Header aliases. The sheet's header row says "ID"; older docs say "id".
// Matching is case- and punctuation-insensitive so either works.
var IDC_ID_HEADERS = ['id', 'bike id', 'bike_id', 'slug'];


/**
 * Turns a hand-typed id into a stable slug.
 *   "Thunder pro"   -> "thunder-pro"
 *   "Thunder prost" -> "thunder-pro-st"   (see IDC_SPECIAL_CASES)
 *   "tk2 Pro"       -> "tk2-pro"
 *   "discoverM"     -> "discover-m"
 */
function idcSlugify_(raw) {
  var s = String(raw == null ? '' : raw).trim();
  if (!s) return '';

  var special = IDC_SPECIAL_CASES[s];
  if (special) return special;

  return s
    // discoverM -> discover M, EB5Roamer -> EB5 Roamer
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')   // any run of punctuation/space becomes one hyphen
    .replace(/^-+|-+$/g, '');      // trim leading/trailing hyphens
}

/**
 * Ids that slugify cannot infer, because the original lost information.
 * "Thunder prost" is "Thunder pro ST" with the separator dropped — no rule
 * recovers that, so it is stated explicitly. Add a line here rather than
 * making the regex cleverer.
 */
var IDC_SPECIAL_CASES = {
  'Thunder prost': 'thunder-pro-st',
  'eb5roamerst':   'eb5-roamer-st',
};


/** Finds the 0-based index of the id column, tolerant of header spelling. */
function idcFindIdColumn_(headers) {
  var norm = function (h) {
    return String(h == null ? '' : h).toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
  };
  for (var i = 0; i < headers.length; i++) {
    var h = norm(headers[i]);
    for (var j = 0; j < IDC_ID_HEADERS.length; j++) {
      if (h === norm(IDC_ID_HEADERS[j])) return i;
    }
  }
  return -1;
}


/**
 * @param {boolean} apply  false/omitted = dry run. true = write the changes.
 * @return {Object} { ok, applied, changes:[{row, from, to}], skipped, error }
 */
function cleanupBikeIds(apply) {
  apply = (apply === true);

  var ss = SpreadsheetApp.openById(INV_SHEET_ID);   // from InventoryHandlers.gs
  var sh = ss.getSheetByName(IDC_TAB_NAME);
  if (!sh) {
    var names = ss.getSheets().map(function (s) { return s.getName(); });
    var msg = 'Tab "' + IDC_TAB_NAME + '" not found. Tabs present: ' + names.join(', ');
    Logger.log(msg);
    return { ok: false, error: msg, tabs: names };
  }

  var data = sh.getDataRange().getValues();
  if (data.length < 2) {
    Logger.log('No data rows.');
    return { ok: true, applied: false, changes: [] };
  }

  var headers = data[0];
  var idCol   = idcFindIdColumn_(headers);
  if (idCol === -1) {
    var m = 'No id column found. Headers: ' + headers.join(' | ');
    Logger.log(m);
    return { ok: false, error: m };
  }
  Logger.log('Using column ' + (idCol + 1) + ' ("' + headers[idCol] + '") as the id column.');

  // Pass 1 — work out every rename, and refuse to proceed on a collision.
  var changes   = [];
  var unchanged = 0;
  var seen      = {};   // proposed id -> row number that claims it
  var collisions = [];

  for (var i = 1; i < data.length; i++) {
    var rowNum = i + 1;
    var oldId  = String(data[i][idCol] == null ? '' : data[i][idCol]).trim();
    if (!oldId) continue;                       // blank row, leave it alone

    var newId = idcSlugify_(oldId);
    if (!newId) {
      Logger.log('Row ' + rowNum + ': id ' + JSON.stringify(oldId) + ' slugifies to empty — skipped.');
      continue;
    }

    if (seen[newId] != null) {
      collisions.push('"' + newId + '" claimed by both row ' + seen[newId] + ' and row ' + rowNum);
    } else {
      seen[newId] = rowNum;
    }

    if (newId === oldId) { unchanged++; continue; }
    changes.push({ row: rowNum, from: oldId, to: newId });
  }

  // A collision would silently merge two bikes into one key. Never write.
  if (collisions.length) {
    Logger.log('ABORTED — id collisions detected:\n  ' + collisions.join('\n  '));
    Logger.log('Resolve these by hand (or add entries to IDC_SPECIAL_CASES) and re-run.');
    return { ok: false, error: 'id collision', collisions: collisions };
  }

  if (!changes.length) {
    Logger.log('Nothing to do — all ' + unchanged + ' ids are already clean slugs.');
    return { ok: true, applied: false, changes: [], skipped: unchanged };
  }

  Logger.log((apply ? 'APPLYING ' : 'DRY RUN — would change ') + changes.length +
             ' id(s); ' + unchanged + ' already clean:');
  changes.forEach(function (c) {
    Logger.log('  row ' + c.row + ':  ' + c.from + '  ->  ' + c.to);
  });

  if (!apply) {
    Logger.log('\nNothing was written. Re-run as cleanupBikeIds(true) to apply.');
    return { ok: true, applied: false, changes: changes, skipped: unchanged };
  }

  // Pass 2 — write. One setValue per changed row; the sheet is ~41 rows so
  // batching would add risk without saving meaningful time.
  changes.forEach(function (c) {
    sh.getRange(c.row, idCol + 1).setValue(c.to);
  });
  SpreadsheetApp.flush();

  // Record the mapping. Old ?bike= links still point at the old ids, so keep
  // this — it is the only record of what the old id used to be.
  var log = ss.getSheetByName('ID_Migration_Log');
  if (!log) {
    log = ss.insertSheet('ID_Migration_Log');
    log.appendRow(['timestamp', 'row', 'old_id', 'new_id']);
    log.getRange(1, 1, 1, 4).setFontWeight('bold');
    log.setFrozenRows(1);
  }
  var stamp = new Date();
  changes.forEach(function (c) { log.appendRow([stamp, c.row, c.from, c.to]); });

  Logger.log('\nDone. ' + changes.length + ' id(s) renamed, logged to ID_Migration_Log.');
  Logger.log('Now trigger a sync so data/inventory.json picks up the new ids.');
  return { ok: true, applied: true, changes: changes, skipped: unchanged };
}
