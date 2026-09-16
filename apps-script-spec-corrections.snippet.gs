/**
 * SpecFixes.gs — corrections to specific Specs (JSON) cells.
 *
 * Paste as a new file in the "Pricing and Orders" Apps Script project, then:
 *
 *   fixSpecsDryRun()    // prints before/after, writes nothing
 *   fixSpecsApply()     // writes
 *
 * WHY THIS IS SEPARATE FROM MokwheelSpecs.gs
 *
 * That file only ever fills an EMPTY cell, so it can never correct a value
 * already in the sheet. Every entry below is a cell that has a value and the
 * value is wrong or incomplete. Overwriting is the whole point, which is why
 * it is a short, explicit, hand-written list rather than anything automatic:
 * each row names the cell, the reason, and the vendor page it came from.
 *
 * Remove an entry once its row is right. Do not grow this into a bulk
 * rewriter — the sheet is where hand-entered work lives.
 */

var FIX_VERSION = '2026-09-16b';

var SPEC_FIXES = [

  // ── Rows the brand imports added with empty Specs ──────────────────────
  // Seven of these reuse figures already vetted in salespro rather than being
  // re-derived; the rest come from the vendor's own product pages. Anything a
  // vendor does not publish is left out entirely rather than estimated, which
  // is why several carry no Top Speed.

  { brand: 'Velotric', name: 'Velotric Discover 2 Ebike',
    why: 'imported empty. Figures already vetted in salespro.',
    src: 'https://www.velotricbike.com/products/velotric-discover-2',
    specs: { 'Range': '75 mi', 'Top Speed': '28 mph', 'Motor': '750W / 1200W peak',
             'Battery': '706WH', 'Torque': '75 NM', 'Weight': '68 lbs' } },

  { brand: 'Velotric', name: 'Velotric Go 1 Ebike',
    why: 'imported empty. Figures already vetted in salespro.',
    src: 'https://www.velotricbike.com/products/velotric-go-1',
    specs: { 'Range': '55 mi', 'Top Speed': '20 mph', 'Motor': '500W / 900W peak',
             'Battery': '691.2WH', 'Torque': '65 NM', 'Weight': '65 lbs' } },

  { brand: 'Velotric', name: 'Velotric Packer 1 Ebike',
    why: 'imported empty. Figures already vetted in salespro.',
    src: 'https://www.velotricbike.com/products/velotric-packer-1',
    specs: { 'Range': '52 mi', 'Top Speed': '20 mph', 'Motor': '750W / 1200W peak',
             'Battery': '804WH', 'Torque': '75 NM', 'Weight': '75 lbs' } },

  { brand: 'Velotric', name: 'Velotric Nomad 1 Plus Ebike',
    why: 'imported empty. Figures already vetted in salespro.',
    src: 'https://www.velotricbike.com/products/velotric-nomad-1',
    specs: { 'Range': '55 mi', 'Top Speed': '28 mph', 'Motor': '750W / 1200W peak',
             'Battery': '691.2WH', 'Torque': '75 NM', 'Weight': '73 lbs' } },

  { brand: 'Velotric', name: 'Velotric Discover 1 Plus Ebike',
    why: 'imported empty. Figures already vetted in salespro.',
    src: 'https://www.velotricbike.com/products/velotric-discover-1',
    specs: { 'Range': '65 mi', 'Top Speed': '28 mph', 'Motor': '500W / 900W peak',
             'Battery': '691WH', 'Torque': '65 NM', 'Weight': '60 lbs' } },

  { brand: 'Velotric', name: 'Velotric T1 Ebike',
    why: 'imported empty. 36V x 9.8Ah = 352.8Wh. Velotric publishes a top speed '
       + 'for the T1 ST Plus but not for the base T1, so this row carries none '
       + 'rather than borrowing the other model\'s number.',
    src: 'https://www.velotricbike.com/products/velotric-t1-ebike',
    specs: { 'Range': '70 mi', 'Motor': '350W / 600W peak', 'Battery': '352.8WH',
             'Torque': '45 NM', 'Weight': '36 lbs' } },

  { brand: 'Heybike', name: 'Cityscape 2.0',
    why: 'imported empty. Figures already vetted in salespro.',
    src: 'https://www.heybike.com/products/cityscape',
    specs: { 'Range': '50 mi', 'Top Speed': '20 mph', 'Motor': '500W / 800W peak',
             'Battery': '360WH', 'Torque': '65 NM', 'Weight': '61.7 lbs' } },

  { brand: 'Heybike', name: 'Mars 2.5',
    why: 'imported empty. Heybike states 750W/1000W peak, 85Nm, a 600Wh UL pack '
       + 'and 45 miles, but no top speed on the product page — so none is given.',
    src: 'https://www.heybike.com/products/mars-2-5',
    specs: { 'Range': '45 mi', 'Motor': '750W / 1000W peak', 'Battery': '600WH',
             'Torque': '85 NM' } },

  { brand: 'Jasion', name: 'X-Hunter ST Ebike',
    why: 'imported empty. Figures already vetted in salespro.',
    src: 'https://www.jasionbike.com/products/x-hunter-st',
    specs: { 'Range': '70 mi', 'Top Speed': '28 mph', 'Motor': '750W / 1400W peak',
             'Battery': '624WH', 'Torque': '85 NM', 'Weight': '70 lbs' } },

  { brand: 'Jasion', name: 'Kago Ebike',
    why: 'imported empty. Cargo bike on a DUAL 52V x 20Ah pack = 2080Wh, which is '
       + 'where the 120-mile figure comes from. Jasion publishes peak watts only, '
       + 'so the motor reads as peak rather than inventing a rated number.',
    src: 'https://www.jasionbike.com/products/kago',
    specs: { 'Range': '120 mi', 'Motor': '1200W peak', 'Battery': '2080WH',
             'Torque': '80 NM' } },

  { brand: 'Jasion', name: 'JT18 eTrike',
    why: 'imported empty. Jasion publishes motor, range, speed and a 300 lb '
       + 'capacity but not the pack size, so Battery is absent rather than guessed.',
    src: 'https://www.jasionbike.com/products/jt18',
    specs: { 'Range': '60 mi', 'Top Speed': '16 mph', 'Motor': '1200W peak' } },

  { brand: 'Jasion', name: 'RetroVolt Max Ebike',
    why: 'imported empty. 52V x 20Ah x2 = 2080Wh. NOT A CLASS 3 E-BIKE: 35 mph is '
       + 'above the 28 mph ceiling, so in Ohio this is a motor vehicle, not a '
       + 'bicycle. The number is recorded as published — do not quietly print 28.',
    src: 'https://www.jasionbike.com/products/retrovolt-max',
    specs: { 'Range': '150 mi', 'Top Speed': '35 mph', 'Motor': '2000W peak',
             'Battery': '2080WH', 'Torque': '99 NM' } },

  { brand: 'Jasion', name: 'Patrol Ebike',
    why: 'imported empty. 4000W, 145Nm, 52V x 30Ah = 1560Wh. THROTTLE ONLY — '
       + 'Jasion states it has no pedal assist at all, which puts it outside every '
       + 'e-bike class; it is an electric dirt bike. Jasion publishes 0-20 mph in '
       + '3.5s but no top speed, so none is given.',
    src: 'https://www.jasionbike.com/products/patrol-52',
    specs: { 'Range': '50 mi', 'Motor': '4000W', 'Battery': '1560WH',
             'Torque': '145 NM' } },

  { brand: 'Mooncool', name: 'POP Folding Electric Bike',
    why: 'imported empty. 48V x 20Ah = 960Wh, 450 lb capacity. Mooncool publishes '
       + 'no top speed for the POP.',
    src: 'https://www.mooncool.com/products/pop-folding-electric-bike',
    specs: { 'Range': '45-65 mi', 'Motor': '750W', 'Battery': '960WH' } },

  {
    brand: 'Mooncool', name: 'TK2Pro',
    why: 'row carried a copy of the TK1 specs — 500W / 696WH / 70 mi / 16 mph. '
       + 'The TK2 PRO is a 750W helical-gear drive (1310W peak, 90Nm) on a '
       + '48V 20Ah pack = 960Wh, 45-75 mi, 15.5 mph. Weight is dropped rather '
       + 'than kept: the 89 lbs in the cell was the TK1 figure too, and Mooncool '
       + 'does not publish one for this model.',
    src: 'https://www.mooncool.com/products/tk2-pro-electric-trike',
    specs: {
      'Range': '45-75 mi', 'Top Speed': '15 mph',
      'Motor': '750W / 1310W peak', 'Battery': '960WH', 'Torque': '90 NM'
    }
  },
  {
    brand: 'Mooncool', name: 'CD1 Youth Trike',
    why: 'battery read 696WH, which is the TK1 pack. The CD1 runs 24V x 10.4Ah '
       + '= 249.6Wh — the cell overstated a childrens trike by nearly 3x. '
       + 'Everything else on the row matches Mooncool and is kept.',
    src: 'https://www.mooncool.com/products/cd1-electric-youth-trike',
    specs: {
      'Range': '35 mi', 'Top Speed': '12 mph',
      'Motor': '250W', 'Battery': '249.6WH', 'Weight': '55 lbs'
    }
  },
  {
    brand: 'Heybike', name: 'Saturn',
    why: 'imported with empty Specs, so it cannot be published. Figures are for '
       + 'the SINGLE-battery Saturn, which is what this row is: 52V x 18.4Ah = '
       + '956.8Wh. The dual-battery version is a separate listing and roughly '
       + 'doubles both the pack and the range. Top speed is the 28 mph it ships '
       + 'at; Heybike advertises unlocking to 40 mph, which is not a Class 3 '
       + 'figure and should not be quoted as the bike\'s speed.',
    src: 'https://www.heybike.com/products/saturn',
    specs: {
      'Range': '30-50 mi', 'Top Speed': '28 mph', 'Motor': '1000W / 1800W peak',
      'Battery': '956.8WH', 'Torque': '95 NM', 'Weight': '103 lbs'
    }
  },
  {
    brand: 'Heybike', name: 'Titan',
    why: 'imported with empty Specs. Single-battery figures: 48V x 15Ah = 720Wh, '
       + 'up to 40 miles. The dual-battery build is 1440Wh and up to 80 miles. '
       + 'It SHIPS Class 2 at 20 mph and is raised to 28 through the Heybike app, '
       + 'so 20 is the honest number on the tag.',
    src: 'https://www.heybike.com/products/titan',
    specs: {
      'Range': '40 mi', 'Top Speed': '20 mph', 'Motor': '750W / 1500W peak',
      'Battery': '720WH', 'Torque': '65 NM'
    }
  },
  {
    brand: 'Heybike', name: 'Hybrid',
    why: 'the only row on the site with no Top Speed. Heybike publishes 28 mph. '
       + 'Existing values are kept as they are.',
    src: 'https://www.heybike.com/products/hybrid',
    specs: {
      'Range': '100 mi', 'Top Speed': '28 mph', 'Motor': '750W',
      'Battery': '864WH', 'Torque': '75 NM', 'Weight': '69 lbs'
    }
  }
];

/** Same tolerance as salespro: the sheet's Name may carry an "Ebike" suffix. */
function _fixNorm_(n) {
  return String(n || '').toLowerCase()
    .replace(/\s*e[\s-]?bike\s*$/, '').replace(/\s+/g, ' ').trim();
}

function fixSpecs(apply) {
  apply = apply === true;

  var sh = SpreadsheetApp.openById(INV_SHEET_ID).getSheetByName(INV_TAB_NAME);
  if (!sh) {
    Logger.log('Tab "' + INV_TAB_NAME + '" not found in ' + INV_SHEET_ID + '.');
    return { ok: false };
  }

  var data = sh.getDataRange().getValues();
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

  Logger.log('=== Spec corrections  (SpecFixes.gs ' + FIX_VERSION + ') ===\n');

  var applied = [], notFound = [];

  SPEC_FIXES.forEach(function (fix) {
    var rowIndex = -1;
    for (var r = 1; r < data.length; r++) {
      if (_fixNorm_(data[r][col.brand]) === _fixNorm_(fix.brand) &&
          _fixNorm_(data[r][col.name])  === _fixNorm_(fix.name)) { rowIndex = r; break; }
    }
    if (rowIndex === -1) { notFound.push(fix.brand + ' ' + fix.name); return; }

    var before = String(data[rowIndex][col.specs] || '').trim();
    var after  = JSON.stringify(fix.specs);

    Logger.log(fix.brand + ' ' + fix.name + '  (row ' + (rowIndex + 1) + ')');
    Logger.log('   why:    ' + fix.why);
    Logger.log('   src:    ' + fix.src);
    Logger.log('   before: ' + (before || '(empty)'));
    Logger.log('   after:  ' + after);
    if (before === after) { Logger.log('   -> already correct, skipping\n'); return; }
    Logger.log('');

    if (apply) sh.getRange(rowIndex + 1, col.specs + 1).setValue(after);
    applied.push(fix.brand + ' ' + fix.name);
  });

  if (notFound.length) {
    Logger.log('NOT FOUND in the sheet (' + notFound.length + ') — renamed?');
    notFound.forEach(function (t) { Logger.log('  ' + t); });
  }

  if (!apply) {
    Logger.log('\nDry run. Nothing written. ' + applied.length + ' row(s) would change.');
    return { ok: true, applied: false, rows: applied, notFound: notFound };
  }

  SpreadsheetApp.flush();
  Logger.log('\nWrote ' + applied.length + ' row(s).');
  Logger.log('Run the sync-inventory GitHub Action afterwards, or the site keeps');
  Logger.log('serving the old numbers until 6 AM UTC.');
  return { ok: true, applied: true, rows: applied, notFound: notFound };
}

/** Read the log, change nothing. */
function fixSpecsDryRun() { return fixSpecs(false); }

/** Write the corrections. */
function fixSpecsApply()  { return fixSpecs(true); }
