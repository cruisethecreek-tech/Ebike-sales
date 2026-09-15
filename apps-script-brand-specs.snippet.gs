/**
 * fillBrandSpecs — second pass after importBrand().
 *
 * importBrand() deliberately leaves Specs (JSON) empty and marks every new row
 * discontinued = "Yes", because Shopify's product feed has no structured spec
 * fields. Somebody then has to fill Range / Top Speed / Motor / Battery by hand
 * for every model, which is slow and is exactly the kind of job where wrong
 * numbers get typed and then quoted to a customer.
 *
 * The specs are usually sitting in the product description (body_html) that
 * /products.json already returns — importBrand just throws it away. This reads
 * it, pulls the four values out of the manufacturer's own copy, and reports
 * exactly what it found and what it could not.
 *
 * It NEVER guesses — every value written was read from the vendor's own text.
 * It does write partial results: a row that yielded three of the four values
 * gets those three, and the dry-run log names what is still missing. Only a
 * key that parsed is stored, so a gap is an absent line rather than a blank
 * one. A row where nothing at all parsed is left untouched. Rows stay hidden
 * (discontinued = "Yes") either way, which is the safety posture importBrand
 * already takes.
 *
 * Run from the inventory Apps Script (the one bound to the bike sheet):
 *
 *   fillBrandSpecs('Mokwheel', 'https://mokwheel.com')          // dry run
 *   fillBrandSpecs('Mokwheel', 'https://mokwheel.com', true)    // write
 *
 * Read the dry-run log before applying. Spot-check two or three models against
 * the product page — vendors reword their descriptions and a pattern that
 * worked last season can quietly start matching the wrong number.
 */

/** Strip tags and decode the handful of entities that matter, so the text is scannable. */
/**
 * Printed at the top of every run. Apps Script executes the last SAVED version
 * of a file, so a paste that has not finished saving runs the old code and
 * produces an identical log — which is impossible to spot by eye. Bump this
 * whenever this file changes, and the log says which version actually ran.
 */
var FS_VERSION = '2026-09-15d';

function _fsText_(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, ' | ')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&rsquo;/gi, "'")
    .replace(/&ndash;|&mdash;/gi, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find a value near a label.
 *
 * Scanning the whole description for /\d+ mph/ finds the first number that
 * happens to carry that unit, which on these pages is often a comparison or a
 * different model. So: locate the label, then look only at the WINDOW
 * characters after it. Every label is tried, and the first hit wins.
 */
function _fsNear_(text, labels, valueRe, windowChars) {
  var win = windowChars || 90;
  var hay = String(text || '');
  for (var i = 0; i < labels.length; i++) {
    var labelRe = new RegExp(labels[i], 'gi');
    var m;
    while ((m = labelRe.exec(hay)) !== null) {
      var slice = hay.slice(m.index + m[0].length, m.index + m[0].length + win);
      var v = slice.match(valueRe);
      if (_fsCaptured_(v)) return v;
    }
  }
  return null;
}

/**
 * Find a value that appears BEFORE its label.
 *
 * Spec tables read "Motor: 750W", but prose reads "the 750W motor" and
 * "a removable 48V 19.6Ah battery" — the number comes first. Scanning only
 * forward from the label finds the wrong number in prose: for "the 750W motor
 * (up to 1100W peak)" it returns the peak as the nominal rating.
 */
function _fsBefore_(text, label, valueRe) {
  // The label is wrapped in a non-capturing group on purpose. 'battery|pack'
  // spliced in bare turned the whole pattern into
  //   (\d{3,4})\s*Wh\b[^|]{0,24}?battery  OR  pack
  // so any text containing the word "pack" matched with no capture group at
  // all, and the caller cheerfully wrote "undefinedWh" into the sheet.
  var re = new RegExp(valueRe.source + '[^|]{0,24}?(?:' + label + ')', 'i');
  var m = String(text || '').match(re);
  return _fsCaptured_(m) ? m : null;
}

/** A match whose capture groups are all undefined matched nothing useful. */
function _fsCaptured_(m) {
  if (!m) return false;
  for (var i = 1; i < m.length; i++) if (m[i] == null) return false;
  return m.length > 1;
}

/**
 * True when the number at idx is introduced as a peak/maximum figure.
 *
 * "1100W peak motor" put the peak rating where the nominal one belongs, which
 * is how a Basalt ended up claiming an 1100W motor. Reading backwards from the
 * number is the only way to tell the two apart.
 */
function _fsIsPeakContext_(text, idx) {
  var lead = String(text || '').slice(Math.max(0, idx - 30), idx);
  return /\b(?:peak|up to|max|maximum)\b[^|]{0,14}$/i.test(lead);
}

/** "55" or "60-80" → "55 mi" / "60-80 mi". */
function _fsRange_(text) {
  var labels = ['range', 'per charge', 'on a single charge'];
  var m = _fsNear_(text, labels, /(\d{2,3})\s*(?:-|–|to)\s*(\d{2,3})\s*(?:mi\b|miles)/i);
  if (m) return m[1] + '-' + m[2] + ' mi';
  m = _fsNear_(text, labels, /(\d{2,3})\s*(?:\+)?\s*(?:mi\b|miles)/i);
  return m ? m[1] + ' mi' : '';
}

/** "28 mph". */
function _fsSpeed_(text) {
  var m = _fsNear_(text, ['top speed', 'max speed', 'maximum speed', 'speed'],
                   /(\d{1,2})\s*mph/i);
  return m ? m[1] + ' mph' : '';
}

/**
 * "750W", or "750W / 1100W peak" when the page states a peak as well.
 *
 * Returns { value, note }. When the only wattage on the page reads as a peak
 * figure, value is empty and the note says so: a peak rating printed as the
 * motor spec overstates the bike, and this is a number staff quote to buyers.
 */
function _fsMotor_(text) {
  // "750W motor" first — in prose the nominal rating precedes the noun, and a
  // forward-only scan would pick up the peak in "750W motor (up to 1100W)".
  var m = _fsBefore_(text, 'motor', /(\d{3,4})\s*W\b/);
  if (!m) m = _fsNear_(text, ['motor', 'hub drive', 'mid drive'], /(\d{3,4})\s*W\b/i, 120);
  if (!m) return { value: '', note: '' };

  if (m.index != null && _fsIsPeakContext_(text, m.index)) {
    return { value: '', note: 'found ' + m[1] + 'W but the copy reads it as a peak/max ' +
                              'figure, not a nominal rating — motor left blank' };
  }

  var watts = m[1] + 'W';
  var peak = _fsNear_(text, ['peak', 'up to'], /(\d{3,4})\s*W\b/i, 40);
  if (peak && peak[1] !== m[1]) watts += ' / ' + peak[1] + 'W peak';
  return { value: watts, note: '' };
}

/**
 * Battery capacity. A stated Wh always wins. Failing that it is derived from
 * V x Ah, which is how most of these pages describe the pack ("48V 19.6Ah").
 *
 * Returns { value, derived } so the dry-run log can say which capacities were
 * computed rather than quoted. 48 x 19.6 is 940.8, and a vendor who writes
 * "940Wh" has truncated — a derived figure can sit a unit off the number on
 * their own page, and anyone checking the two deserves to know why.
 */
function _fsBattery_(text) {
  var m = _fsBefore_(text, 'battery|pack', /(\d{3,4})\s*Wh\b/);
  if (!m) m = _fsNear_(text, ['battery', 'pack'], /(\d{3,4})\s*Wh\b/i, 140);
  if (m) return { value: m[1] + 'Wh', derived: false };

  var re = /(\d{2})\s*V\b[^|]{0,24}?(\d{1,2}(?:\.\d)?)\s*Ah\b/;
  var va = _fsBefore_(text, 'battery|pack', re);
  if (!va) va = _fsNear_(text, ['battery', 'pack'], new RegExp(re.source, 'i'), 140);
  if (va) {
    return {
      value: String(Math.round(parseFloat(va[1]) * parseFloat(va[2]))) + 'Wh',
      derived: va[1] + 'V x ' + va[2] + 'Ah'
    };
  }
  return { value: '', derived: false };
}

/**
 * Pull all four out of one product's description.
 * Returns { specs, notes } — notes carry anything a human should look at.
 */
function fsExtractSpecs(bodyHtml, title) {
  var text = _fsText_(bodyHtml) + ' | ' + String(title || '');
  var batt  = _fsBattery_(text);
  var motor = _fsMotor_(text);
  var notes = [];
  if (batt.derived) notes.push('battery derived from ' + batt.derived + ' — vendor may state it rounded');
  if (motor.note) notes.push(motor.note);
  return {
    specs: {
      'Range':     _fsRange_(text),
      'Top Speed': _fsSpeed_(text),
      'Motor':     motor.value,
      'Battery':   batt.value
    },
    notes: notes
  };
}

function _fsNorm_(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function fillBrandSpecs(brandName, baseUrl, apply) {
  brandName = String(brandName || '').trim();
  baseUrl   = String(baseUrl || '').replace(/\/+$/, '');
  apply     = apply === true;

  if (!brandName || !baseUrl) {
    Logger.log('Usage: fillBrandSpecs("Mokwheel", "https://mokwheel.com" [, true])');
    return { ok: false };
  }

  // Pull the catalogue, keeping body_html this time.
  var products = [], page = 1;
  while (page <= 10) {
    var resp;
    try {
      resp = UrlFetchApp.fetch(baseUrl + '/products.json?limit=250&page=' + page, {
        muteHttpExceptions: true, followRedirects: true
      });
    } catch (e) {
      Logger.log('Fetch failed: ' + e);
      return { ok: false };
    }
    if (resp.getResponseCode() !== 200) {
      Logger.log('products.json returned HTTP ' + resp.getResponseCode());
      return { ok: false };
    }
    var batch = (JSON.parse(resp.getContentText()) || {}).products || [];
    if (!batch.length) break;
    products = products.concat(batch);
    page++;
  }
  if (!products.length) {
    Logger.log('No products returned from ' + baseUrl + ' — is this a Shopify store?');
    return { ok: false };
  }

  var byTitle = {};
  products.forEach(function (p) { byTitle[_fsNorm_(p.title)] = p; });

  // Same sheet and tab importBrand writes to. getActiveSpreadsheet() is wrong
  // here: this script is standalone, not container-bound, so it returns null —
  // and there is no tab called "Bikes" either. INV_SHEET_ID and INV_TAB_NAME
  // come from the inventory handlers file in the same Apps Script project.
  var ss      = SpreadsheetApp.openById(INV_SHEET_ID);
  var sh      = ss.getSheetByName(INV_TAB_NAME);
  if (!sh) {
    Logger.log('Tab "' + INV_TAB_NAME + '" not found in spreadsheet ' + INV_SHEET_ID + '.');
    return { ok: false };
  }
  var data    = sh.getDataRange().getValues();
  var headers = data[0] || [];
  var col = {};
  headers.forEach(function (h, i) {
    var k = String(h || '').toLowerCase().replace(/\s*\(json\)/, '').replace(/[^a-z]/g, '');
    if (k) col[k] = i;
  });
  if (col.brand == null || col.name == null || col.specs == null) {
    Logger.log('Sheet needs Brand, Name and Specs columns. Found: ' + headers.join(' | '));
    return { ok: false };
  }

  var filled = [], partial = [], empty = [], unmatched = [], already = [];

  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    if (_fsNorm_(row[col.brand]) !== _fsNorm_(brandName)) continue;

    var title = String(row[col.name] || '').trim();
    if (String(row[col.specs] || '').trim()) { already.push(title); continue; }

    var product = byTitle[_fsNorm_(title)];
    if (!product) { unmatched.push(title); continue; }

    var out     = fsExtractSpecs(product.body_html, product.title);
    var missing = Object.keys(out.specs).filter(function (k) { return !out.specs[k]; });

    // Keep only the values we actually found. A blank key renders as an empty
    // spec line on the site, which looks broken; an absent one just isn't shown.
    var specs = {};
    Object.keys(out.specs).forEach(function (k) { if (out.specs[k]) specs[k] = out.specs[k]; });

    var rec = { rowIndex: r + 1, title: title, specs: specs, missing: missing, notes: out.notes };

    // Three of four beats a blank cell. Only a row where nothing at all parsed
    // is left alone — writing "{}" would just make it look done when it isn't.
    if (!Object.keys(specs).length) empty.push(rec);
    else if (missing.length) partial.push(rec);
    else filled.push(rec);
  }

  Logger.log('=== ' + brandName + ' specs from ' + baseUrl +
             '  (BrandSpecs.gs ' + FS_VERSION + ') ===');
  Logger.log(products.length + ' products fetched, ' + (data.length - 1) + ' sheet rows scanned.\n');

  if (filled.length) {
    Logger.log('COMPLETE (' + filled.length + ') — all four values found in the vendor copy:');
    filled.forEach(function (f) {
      Logger.log('  ' + f.title);
      Logger.log('      ' + JSON.stringify(f.specs));
      (f.notes || []).forEach(function (n) { Logger.log('      note: ' + n); });
    });
  }
  if (partial.length) {
    Logger.log('\nPARTIAL (' + partial.length + ') — written, but finish these by hand:');
    partial.forEach(function (p) {
      Logger.log('  ' + p.title + '   still missing: ' + p.missing.join(', '));
      Logger.log('      ' + JSON.stringify(p.specs));
      (p.notes || []).forEach(function (n) { Logger.log('      note: ' + n); });
    });
  }
  if (empty.length) {
    Logger.log('\nNOTHING PARSED (' + empty.length + ') — left blank, type these in by hand:');
    empty.forEach(function (e) {
      Logger.log('  ' + e.title);
      (e.notes || []).forEach(function (n) { Logger.log('      note: ' + n); });
    });
    Logger.log('  The vendor keeps these specs outside body_html (a tab, a table');
    Logger.log('  image, or a metafield), so there is nothing here to read.');
  }
  if (unmatched.length) {
    Logger.log('\nNOT FOUND on the vendor site (' + unmatched.length + ') — renamed or discontinued?');
    unmatched.forEach(function (t) { Logger.log('  ' + t); });
  }
  if (already.length) {
    Logger.log('\nAlready had specs, untouched (' + already.length + ').');
  }

  if (!apply) {
    Logger.log('\nDry run. Nothing written. Re-run with true as the third argument to apply.');
    Logger.log('Check two or three against the product page first.');
    return { ok: true, applied: false, filled: filled, partial: partial,
             empty: empty, unmatched: unmatched };
  }

  var written = filled.concat(partial);
  written.forEach(function (f) {
    sh.getRange(f.rowIndex, col.specs + 1).setValue(JSON.stringify(f.specs));
  });
  SpreadsheetApp.flush();

  Logger.log('\nWrote specs for ' + written.length + ' row(s) (' + filled.length +
             ' complete, ' + partial.length + ' partial).');
  Logger.log('Rows stay hidden until you clear discontinued — the colour hex codes');
  Logger.log('still need a human, and a bike with no hexes renders with blank swatches.');

  return { ok: true, applied: true, filled: filled, partial: partial,
           empty: empty, unmatched: unmatched };
}


// ── Runnable wrappers ────────────────────────────────────────────
// The Apps Script editor's Run button calls the selected function with no
// arguments, so fillBrandSpecs('Mokwheel', ...) cannot be run directly from
// the dropdown. Pick one of these instead. Named in running order so the
// dropdown reads as a sequence.

/** Step 3 — read the log, change nothing. */
function step3_mokwheelSpecsDryRun() {
  return fillBrandSpecs('Mokwheel', 'https://mokwheel.com');
}

/** Step 4 — write every spec that parsed, complete or not. */
function step4_mokwheelSpecsApply() {
  return fillBrandSpecs('Mokwheel', 'https://mokwheel.com', true);
}
