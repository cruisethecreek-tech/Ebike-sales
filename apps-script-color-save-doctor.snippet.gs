/**
 * ColorDoctor.gs — find out why a colour save is not sticking, and fix a row.
 *
 * Paste as a new file in the "Pricing and Orders" project. Needs nothing from
 * the other snippets except INV_SHEET_ID / INV_TAB_NAME.
 *
 *   diagnoseColorSave('Venus')     // read-only: shows the row and the cell
 *   fixVenusColors()               // writes the corrected swatches
 *   setColorsFor('Venus', '<json>')// any bike, any JSON
 *
 * WHY THIS EXISTS
 *
 * Sales Pro's swatch editor said "synced" and the edit was gone on reload.
 * Its writes go out as mode:'no-cors', so the browser cannot read the reply
 * and the page reported success whether or not the sheet took anything. That
 * half is now fixed in salespro.html, which reads the row back and tells the
 * truth. This is the other half: running here, in the editor, executes the
 * code as SAVED rather than as DEPLOYED, so it works even when /exec is
 * serving an older version — which is the most common reason the write fails.
 *
 * If diagnoseColorSave reports the row and the cell correctly but the same
 * save through Sales Pro does not stick, the deployment is stale:
 *   Deploy > Manage deployments > pencil > New version > Deploy.
 * "New deployment" is the wrong button; it mints a second URL and the site
 * keeps reading the old one.
 */

var DOC_VERSION = '2026-09-21a';

/** The sheet row for a bike, by name. Returns null and logs if not found. */
function _docFindRow_(bikeName) {
  var want = String(bikeName || '').toLowerCase().trim();
  var sh = SpreadsheetApp.openById(INV_SHEET_ID).getSheetByName(INV_TAB_NAME);
  if (!sh) { Logger.log('Tab "' + INV_TAB_NAME + '" not found.'); return null; }

  var data = sh.getDataRange().getValues();
  var headers = data[0] || [];
  var col = {};
  headers.forEach(function (h, i) {
    var k = String(h || '').toLowerCase().replace(/\s*\(json\)/, '').replace(/[^a-z]/g, '');
    if (k) col[k] = i;
  });
  if (col.name == null || col.colors == null) {
    Logger.log('Sheet needs Name and Colors columns. Found: ' + headers.join(' | '));
    Logger.log('NOTE: the header is "Colors (JSON)", so anything matching on the');
    Logger.log('exact string "colors" will miss it. That is what breaks a stale');
    Logger.log('deployment of handleSaveColors.');
    return null;
  }

  for (var r = 1; r < data.length; r++) {
    if (String(data[r][col.name] || '').toLowerCase().trim() === want) {
      return { sheet: sh, rowIndex: r + 1, colorsCol: col.colors + 1,
               brand: col.brand == null ? '' : data[r][col.brand],
               name: data[r][col.name], current: String(data[r][col.colors] || '') };
    }
  }
  Logger.log('No row named "' + bikeName + '".');
  return null;
}

/** Read-only. Shows exactly what Sales Pro would be writing against. */
function diagnoseColorSave(bikeName) {
  Logger.log('=== Colour save check  (ColorDoctor.gs ' + DOC_VERSION + ') ===\n');
  var hit = _docFindRow_(bikeName);
  if (!hit) return { ok: false };

  Logger.log('bike        : ' + hit.brand + ' ' + hit.name);
  Logger.log('sheet row   : ' + hit.rowIndex + '   <- this is the rowIndex Sales Pro sends');
  Logger.log('Colors col  : ' + hit.colorsCol);
  Logger.log('cell length : ' + hit.current.length + ' chars');

  var parsed = null;
  try { parsed = JSON.parse(hit.current); Logger.log('cell parses : yes'); }
  catch (e) { Logger.log('cell parses : NO — ' + e); }

  if (parsed) {
    Logger.log('\nswatches, in order (the first one is the listing photo):');
    Object.keys(parsed).forEach(function (style) {
      var g = parsed[style];
      var lists = Array.isArray(g) ? { '': g } : g;
      Object.keys(lists).forEach(function (size) {
        (lists[size] || []).forEach(function (sw, i) {
          Logger.log('  ' + (i + 1) + '. ' + (sw.name || '(unnamed)') + '  ->  ' + (sw.img || '(no image)'));
        });
      });
    });
  }
  Logger.log('\nRead-only. Nothing was written.');
  return { ok: true, rowIndex: hit.rowIndex };
}

/** Write a Colors JSON string to a bike's row, then read it back. */
function setColorsFor(bikeName, json) {
  Logger.log('=== Set colours: ' + bikeName + '  (ColorDoctor.gs ' + DOC_VERSION + ') ===\n');
  try { JSON.parse(json); }
  catch (e) { Logger.log('Refusing to write — that is not valid JSON: ' + e); return { ok: false }; }

  var hit = _docFindRow_(bikeName);
  if (!hit) return { ok: false };

  Logger.log('row ' + hit.rowIndex + ', column ' + hit.colorsCol);
  Logger.log('before: ' + (hit.current.slice(0, 120) || '(empty)') + (hit.current.length > 120 ? '…' : ''));

  hit.sheet.getRange(hit.rowIndex, hit.colorsCol).setValue(json);
  SpreadsheetApp.flush();

  // Read it back from the sheet rather than trusting the write.
  var after = String(hit.sheet.getRange(hit.rowIndex, hit.colorsCol).getValue() || '');
  Logger.log('after : ' + after.slice(0, 120) + (after.length > 120 ? '…' : ''));

  if (after === json) {
    Logger.log('\nCONFIRMED — the sheet holds exactly what was written.');
    Logger.log('Now run the sync-inventory Action to put it on the site.');
    return { ok: true, rowIndex: hit.rowIndex };
  }
  Logger.log('\nMISMATCH — the cell does not hold what was written. Is the cell or');
  Logger.log('sheet protected, or is something else writing to this row?');
  return { ok: false, rowIndex: hit.rowIndex };
}

/**
 * Venus: Blue first so the teal photo on white becomes the listing image,
 * Pink repointed at the white-background file, White unchanged.
 * images/Venus Pink Badge Black.png was deleted from the repo, so the old
 * value 404s on the live site.
 */
function fixVenusColors() {
  return setColorsFor('Venus', JSON.stringify({
    'Step-Thru': {
      'One Size': [
        { name: 'Blue',  hex: '#9ECAD6', img: 'images/Venus Blue.png' },
        { name: 'Pink',  hex: '#FFDCDC', img: 'images/Pink.png' },
        { name: 'White', hex: '#F8F8F8', img: 'https://cdn.shopify.com/s/files/1/0516/9804/1009/files/VENUS_a0c9d8a6-1906-466d-86df-3dd67ef10717.png?v=1782386322' }
      ]
    }
  }));
}
