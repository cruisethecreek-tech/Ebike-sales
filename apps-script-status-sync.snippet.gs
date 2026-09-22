// ============================================================
// Cruise the Creek — One-shot: write portal invoice statuses to the Sheet
// FILE: StatusSync.gs  (new file in the CMS Apps Script project)
//
// WHY
//   The portal's "Re-sync all" button makes one web request per invoice. At
//   55 invoices that is 55 Apps Script cold starts, and 16 of them exceeded
//   the client's timeout — which says the answer never came back, NOT that
//   the write failed. Leaving the Sheet in a state nobody can describe is the
//   worst of the three outcomes.
//
//   This does the whole job inside ONE execution: read the tab once, decide
//   every change in memory, write each column back in a single setValues.
//   Seconds instead of minutes, and one clear report at the end.
//
// HOW
//   1. Paste into the CMS Apps Script project as a new file.
//   2. Run syncStatusesFromPortal.  NO DEPLOYMENT NEEDED — Run executes the
//      code saved in the editor.
//   3. Read the log.
//
//   Run it as often as you like: rows already correct are left untouched and
//   counted separately, so a second run should report 0 changed.
//
//   Rows NOT in the map below — the 13 invoices that exist only in the Sheet —
//   are never modified.
// ============================================================

var SS_SHEET_ID = '1R3pDFG_sO81bKS6dEAa-k5F-OdD5OAbe4hQ-Oc0_T-E';
var SS_TAB      = 'Invoices';

/** invoiceNumber -> status, exactly as the customer portal holds it. */
var PORTAL_STATUS = {
  'CTR-001': 'pending',
  'CTR-002': 'pending',
  'CTR-003': 'paid',
  'CTR-004': 'paid',
  'CTR-005': 'pending',
  'CTR-006': 'pending',
  'CTR-007': 'pending',
  'CTR-008': 'pending',
  'CTR-010': 'pending',
  'CTR-011': 'pending',
  'CTR-012': 'paid',
  'CTR-013': 'pending',
  'CTR-014': 'pending',
  'CTR-015': 'pending',
  'CTR-017': 'pending',
  'CTR-018': 'pending',
  'CTR-020': 'pending',
  'CTR-021': 'pending',
  'CTR-023': 'pending',
  'CTR-024': 'pending',
  'CTR-025': 'pending',
  'CTR-026': 'pending',
  'CTR-027': 'pending',
  'CTR-028': 'pending',
  'CTR-029': 'pending',
  'CTR-031': 'pending',
  'CTR-032': 'pending',
  'CTR-033': 'pending',
  'CTR-034': 'pending',
  'CTR-036': 'pending',
  'CTR-037': 'pending',
  'CTR-038': 'pending',
  'CTR-039': 'pending',
  'CTR-040': 'pending',
  'CTR-041': 'pending',
  'CTR-042': 'pending',
  'CTR-044': 'pending',
  'CTR-045': 'pending',
  'CTR-046': 'pending',
  'CTR-047': 'pending',
  'CTR-048': 'pending',
  'CTR-049': 'pending',
  'CTR-050': 'pending',
  'CTR-051': 'pending',
  'CTR-052': 'pending',
  'CTR-053': 'paid',
  'CTR-054': 'paid',
  'CTR-055': 'pending',
  'CTR-056': 'paid',
  'CTR-057': 'paid',
  'CTR-060': 'paid',
  'CTR-063': 'paid',
  'CTR-064': 'paid',
  'CTR-065': 'paid',
  'CTR-068': 'paid'
};

function _ssCol_(hdr, aliases) {
  var norm = function (s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, ''); };
  for (var a = 0; a < aliases.length; a++) {
    var want = norm(aliases[a]);
    for (var i = 0; i < hdr.length; i++) if (norm(hdr[i]) === want) return i;
  }
  return -1;
}

function syncStatusesFromPortal() {
  var sh = SpreadsheetApp.openById(SS_SHEET_ID).getSheetByName(SS_TAB);
  if (!sh) { Logger.log('Tab "' + SS_TAB + '" not found.'); return; }

  var rows = sh.getDataRange().getValues();
  if (rows.length < 2) { Logger.log('No invoice rows.'); return; }

  var hdr     = rows[0];
  var cNum    = _ssCol_(hdr, ['invoiceNumber', 'invoice number', 'invoice #']);
  var cStatus = _ssCol_(hdr, ['status']);
  var cBal    = _ssCol_(hdr, ['balanceDue', 'balance due', 'balance']);
  var cNotes  = _ssCol_(hdr, ['paymentNotes', 'payment notes', 'notes']);

  if (cNum === -1 || cStatus === -1) {
    Logger.log('Missing columns. invoiceNumber=' + cNum + ' status=' + cStatus +
               '. Headers: ' + hdr.join(' | '));
    return;
  }

  var n = rows.length - 1;
  // Read each column once, edit in memory, write once. Per-cell setValue is
  // what makes a script like this take minutes.
  var statusCol = [], balCol = [], notesCol = [];
  for (var r = 1; r <= n; r++) {
    statusCol.push([rows[r][cStatus]]);
    if (cBal   !== -1) balCol.push([rows[r][cBal]]);
    if (cNotes !== -1) notesCol.push([rows[r][cNotes]]);
  }

  var when = new Date().toISOString().slice(0, 10);
  var changed = [], already = 0, notInPortal = 0, blank = 0;

  for (var r = 1; r <= n; r++) {
    var num = String(rows[r][cNum] || '').trim();
    if (!num) { blank++; continue; }

    var want = PORTAL_STATUS[num];
    if (!want) { notInPortal++; continue; }

    var have = String(rows[r][cStatus] || '').trim().toLowerCase();
    if (have === want) { already++; continue; }

    var i = r - 1;
    statusCol[i] = [want];
    if (want === 'paid' && cBal !== -1) balCol[i] = [0];
    if (cNotes !== -1) {
      var prev = String(notesCol[i][0] || '').trim();
      var note = 'Status \u2192 ' + want + ' (portal audit) on ' + when;
      notesCol[i] = [prev ? (prev + ' | ' + note) : note];
    }
    changed.push(num + ': ' + (have || '(blank)') + ' \u2192 ' + want);
  }

  if (changed.length) {
    sh.getRange(2, cStatus + 1, n, 1).setValues(statusCol);
    if (cBal   !== -1) sh.getRange(2, cBal + 1,   n, 1).setValues(balCol);
    if (cNotes !== -1) sh.getRange(2, cNotes + 1, n, 1).setValues(notesCol);
    SpreadsheetApp.flush();
  }

  Logger.log('Rows read: ' + n);
  Logger.log('Changed: ' + changed.length +
             '  ·  already correct: ' + already +
             '  ·  not in the portal (left alone): ' + notInPortal +
             '  ·  blank rows skipped: ' + blank);
  if (!changed.length) {
    Logger.log('Nothing to do — the Sheet already matches the portal.');
  } else {
    for (var c = 0; c < changed.length; c++) Logger.log('  ' + changed[c]);
  }
}
