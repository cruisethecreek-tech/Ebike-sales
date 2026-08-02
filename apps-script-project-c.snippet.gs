/**
 * PASTE TARGET: Apps Script "Project C" — the project that owns the invoice
 * endpoints (getInvoice / addOrder / getNextInvoiceNumber / getOpenBalances /
 * getInvoiceCatalog). It is bound to the Off Trail / listings sheet but reaches
 * the ebike Invoices tab cross-sheet via SpreadsheetApp.openById(INVOICES_SHEET_ID).
 *
 * This file is NOT executed from the repo — Project C's source lives only in the
 * Google Apps Script editor. Add the two dispatcher lines + the two functions
 * below, save, then Deploy → Manage deployments → Edit → New version. The
 * deployment URL stays the same (invoice.html's AS_URL is unchanged).
 *
 * What this enables (the "Invoice Manager" in invoice.html):
 *   • searchInvoices    — the "Find an Existing Invoice" box (name / email /
 *                         phone / invoice #). Returns the newest 25 matches.
 *   • setInvoiceStatus  — the Paid / Unpaid / Deposit / Refunded / Void dropdown.
 *                         Updates the row in place; "paid" also zeroes balanceDue
 *                         so it drops off balance.html's open list.
 *
 * Both are called over JSONP (browser <script> with &callback=), matching the
 * existing getInvoice/getNextInvoiceNumber pattern. They reuse Project C's own
 * INVOICES_SHEET_ID + INVOICES_TAB constants and header-name column lookup, so
 * they stay aligned with addOrder's schema.
 */

// ─────────────────────────────────────────────────────────────
// 1. Add these two cases to doGet(), next to the getInvoice line:
// ─────────────────────────────────────────────────────────────
//
//   if (action === 'searchInvoices')       return searchInvoices(e);
//   if (action === 'setInvoiceStatus')     return setInvoiceStatus(e);
//
// ─────────────────────────────────────────────────────────────
// 2. Paste these two functions at the bottom of the file:
// ─────────────────────────────────────────────────────────────

// JSONP for invoice.html — search invoices by name / email / phone / number.
function searchInvoices(e) {
  var cb = (e && e.parameter && e.parameter.callback) || 'callback';
  function jsonp(obj) {
    return ContentService.createTextOutput(cb + '(' + JSON.stringify(obj) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  try {
    var q = String((e && e.parameter && e.parameter.q) || '').trim().toLowerCase();
    if (!q) return jsonp({ status: 'ok', invoices: [] });

    var ss = SpreadsheetApp.openById(INVOICES_SHEET_ID);
    var sh = ss.getSheetByName(INVOICES_TAB);
    if (!sh || sh.getLastRow() < 2) return jsonp({ status: 'ok', invoices: [] });

    var rows = sh.getDataRange().getValues();
    var hdr  = rows[0].map(String);
    function col(n) { return hdr.indexOf(n); }
    var cNum = col('invoiceNumber'), cName = col('customerName'),
        cEmail = col('customerEmail'), cPhone = col('customerPhone'),
        cTotal = col('total'), cStatus = col('status'),
        cBal = col('balanceDue'), cDate = col('invoiceDate');

    var out = [];
    for (var r = rows.length - 1; r >= 1 && out.length < 25; r--) {
      var hay = [
        cNum >= 0 ? rows[r][cNum] : '', cName >= 0 ? rows[r][cName] : '',
        cEmail >= 0 ? rows[r][cEmail] : '', cPhone >= 0 ? rows[r][cPhone] : ''
      ].join(' ').toLowerCase();
      if (hay.indexOf(q) === -1) continue;
      out.push({
        invoiceNumber: cNum >= 0 ? rows[r][cNum] : '',
        customerName:  cName >= 0 ? rows[r][cName] : '',
        customerEmail: cEmail >= 0 ? rows[r][cEmail] : '',
        total:         cTotal >= 0 ? Number(rows[r][cTotal]) || 0 : 0,
        status:        cStatus >= 0 ? (rows[r][cStatus] || 'open') : 'open',
        balanceDue:    cBal >= 0 ? Number(rows[r][cBal]) || 0 : 0,
        invoiceDate:   cDate >= 0 ? rows[r][cDate] : ''
      });
    }
    return jsonp({ status: 'ok', invoices: out });
  } catch (err) {
    return jsonp({ status: 'error', message: String(err) });
  }
}

// JSONP for invoice.html — set an invoice's status in place.
// "paid" also zeroes the balance so it drops off balance.html.
function setInvoiceStatus(e) {
  var cb = (e && e.parameter && e.parameter.callback) || 'callback';
  function jsonp(obj) {
    return ContentService.createTextOutput(cb + '(' + JSON.stringify(obj) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  try {
    var num    = String((e && e.parameter && e.parameter.invoiceNumber) || '').trim();
    var status = String((e && e.parameter && e.parameter.status) || '').trim().toLowerCase();
    var method = String((e && e.parameter && e.parameter.method) || '').trim();
    if (!num)    return jsonp({ status: 'error', message: 'invoiceNumber required' });
    if (!status) return jsonp({ status: 'error', message: 'status required' });

    var ss = SpreadsheetApp.openById(INVOICES_SHEET_ID);
    var sh = ss.getSheetByName(INVOICES_TAB);
    if (!sh || sh.getLastRow() < 2) return jsonp({ status: 'error', message: 'Invoices tab empty' });

    var rows = sh.getDataRange().getValues();
    var hdr  = rows[0].map(String);
    function col(n) { return hdr.indexOf(n); }
    var cNum = col('invoiceNumber');
    if (cNum === -1) return jsonp({ status: 'error', message: 'no invoiceNumber column' });

    var target = -1;
    for (var r = rows.length - 1; r >= 1; r--) {
      if (String(rows[r][cNum]).trim() === num) { target = r + 1; break; }
    }
    if (target < 0) return jsonp({ status: 'error', message: 'Invoice ' + num + ' not found' });

    function setIf(n, v) { var c = col(n); if (c >= 0) sh.getRange(target, c + 1).setValue(v); }
    var when = new Date().toISOString();
    var cNotes = col('paymentNotes');
    var existing = cNotes >= 0 ? String(sh.getRange(target, cNotes + 1).getValue() || '').trim() : '';
    var note = 'Status → ' + status + (method ? ' (' + method + ')' : '') + ' on ' + when;

    setIf('status', status);
    if (status === 'paid') setIf('balanceDue', 0);
    setIf('paymentNotes', existing ? (existing + ' | ' + note) : note);

    return jsonp({ status: 'ok', invoiceNumber: num, newStatus: status, row: target });
  } catch (err) {
    return jsonp({ status: 'error', message: String(err) });
  }
}
