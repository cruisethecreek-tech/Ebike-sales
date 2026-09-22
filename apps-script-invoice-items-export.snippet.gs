// ============================================================
// Cruise the Creek — One-time export of invoice line items
// FILE: InvoiceItemsExport.gs  (new file in the CMS project)
//
// WHY THIS EXISTS
//   The customer portal only started storing invoice line items recently.
//   The portal's sync endpoint had always RECEIVED them — it reads them to
//   work out which bikes to register — and then discarded them, so the admin
//   invoice list could show a customer and an amount and nothing about what
//   was actually sold. 57 invoices predate the fix.
//
//   The Sheet kept them the whole time, in the Invoices tab's lineItems
//   column, so they can be recovered rather than re-typed.
//
// HOW TO USE
//   1. Paste this file into the CMS Apps Script project.
//   2. Select exportInvoiceItems in the function dropdown and press Run.
//      NO DEPLOYMENT IS NEEDED — Run executes the code saved in the editor,
//      unlike the /exec URL, which serves the last deployed version.
//   3. Open the execution log and copy every ITEMS> line.
//
//   The output is chunked across several log lines on purpose: the execution
//   log truncates a single very long entry, and a silently truncated backfill
//   is worse than no backfill.
//
//   This function only READS. It writes nothing, anywhere.
// ============================================================

var IIE_SHEET_ID = '1R3pDFG_sO81bKS6dEAa-k5F-OdD5OAbe4hQ-Oc0_T-E';
var IIE_TAB      = 'Invoices';
var IIE_CHUNK    = 6;   // invoices per log line

/** Column index for a header, tolerant of case, spaces and punctuation. */
function _iieCol_(hdr, aliases) {
  var norm = function (s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
  };
  for (var a = 0; a < aliases.length; a++) {
    var want = norm(aliases[a]);
    for (var i = 0; i < hdr.length; i++) {
      if (norm(hdr[i]) === want) return i;
    }
  }
  return -1;
}

/**
 * Read the Invoices tab and log every invoice that has line items.
 *
 * Output shape, one JSON object per ITEMS> line:
 *   ITEMS> [{"n":"CTR-068","i":[{"description":"…","qty":1,"price":1999}]}, …]
 *
 * Keys are short because the log line length is the binding constraint.
 */
function exportInvoiceItems() {
  var sh = SpreadsheetApp.openById(IIE_SHEET_ID).getSheetByName(IIE_TAB);
  if (!sh) {
    Logger.log('Tab "' + IIE_TAB + '" not found in ' + IIE_SHEET_ID + '.');
    return;
  }

  var rows = sh.getDataRange().getValues();
  if (rows.length < 2) { Logger.log('No invoice rows.'); return; }

  var hdr    = rows[0];
  var cNum   = _iieCol_(hdr, ['invoiceNumber', 'invoice number', 'invoice #']);
  var cItems = _iieCol_(hdr, ['lineItems', 'line items', 'items']);

  if (cNum === -1 || cItems === -1) {
    // Say which headers were actually read. A renamed column is the one
    // failure mode that would otherwise look like "there is no data".
    Logger.log('Could not find the columns. invoiceNumber=' + cNum +
               ' lineItems=' + cItems + '. Headers: ' + hdr.join(' | '));
    return;
  }

  var out = [], skippedBlank = 0, skippedBad = 0;
  for (var r = 1; r < rows.length; r++) {
    var num = String(rows[r][cNum] || '').trim();
    var raw = String(rows[r][cItems] || '').trim();
    if (!num) continue;
    if (!raw || raw === '[]') { skippedBlank++; continue; }

    var parsed;
    try { parsed = JSON.parse(raw); } catch (e) { skippedBad++; continue; }
    if (!Array.isArray(parsed) || !parsed.length) { skippedBlank++; continue; }

    // Normalise to the shape the portal stores. The Sheet has accumulated a
    // few spellings over time (name/title/model for the description), so map
    // them here rather than teaching the portal about every variant.
    var items = [];
    for (var i = 0; i < parsed.length; i++) {
      var it = parsed[i] || {};
      var desc = String(it.description || it.name || it.title || it.model || '').trim();
      if (!desc) continue;
      items.push({
        description: desc,
        qty: Number(it.qty || it.quantity) || 1,
        price: Number(it.price || it.amount) || 0
      });
    }
    if (!items.length) { skippedBlank++; continue; }
    out.push({ n: num, i: items });
  }

  Logger.log('Invoices with line items: ' + out.length +
             '  ·  no items: ' + skippedBlank +
             '  ·  unparseable: ' + skippedBad +
             '  ·  rows read: ' + (rows.length - 1));

  if (!out.length) {
    Logger.log('Nothing to export.');
    return;
  }

  for (var s = 0; s < out.length; s += IIE_CHUNK) {
    Logger.log('ITEMS> ' + JSON.stringify(out.slice(s, s + IIE_CHUNK)));
  }
  Logger.log('END> ' + out.length + ' invoices in ' +
             Math.ceil(out.length / IIE_CHUNK) + ' ITEMS> lines. Copy them all.');
}
