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
// 1. Add these three cases to doGet(), next to the getInvoice line:
// ─────────────────────────────────────────────────────────────
//
//   if (action === 'searchInvoices')       return searchInvoices(e);
//   if (action === 'setInvoiceStatus')     return setInvoiceStatus(e);
//   if (action === 'listInvoices')         return listInvoices(e);
//
// ─────────────────────────────────────────────────────────────
// 2. Paste these three functions at the bottom of the file:
//    (searchInvoices powers the search box; listInvoices powers the
//    Recent / Open / Paid browse buttons; setInvoiceStatus the dropdown.)
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// Shared header helper — resolve a column by ANY of several header
// name aliases, with an optional positional fallback. This is what
// makes the browse/search rows bulletproof: even if the deployed sheet
// ever labels the invoice-number column "invoice #" or the name column
// "customer" / "Customer Name", these still find it instead of coming
// back blank. `fallbackIdx` is used only when no alias matches at all.
// ─────────────────────────────────────────────────────────────
function _invCol(hdr, aliases, fallbackIdx) {
  // Case-insensitive, whitespace/punctuation-insensitive match.
  var norm = function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ''); };
  var normHdr = hdr.map(norm);
  for (var a = 0; a < aliases.length; a++) {
    var idx = normHdr.indexOf(norm(aliases[a]));
    if (idx >= 0) return idx;
  }
  return (fallbackIdx === undefined) ? -1 : fallbackIdx;
}

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
    // invoiceNumber falls back to column 0 (it is always the first column);
    // customerName tries several common labels before giving up.
    var cNum   = _invCol(hdr, ['invoiceNumber', 'invoice #', 'invoice number', 'invoiceNo'], 0);
    var cName  = _invCol(hdr, ['customerName', 'customer name', 'customer', 'name']);
    var cEmail = _invCol(hdr, ['customerEmail', 'customer email', 'email']);
    var cPhone = _invCol(hdr, ['customerPhone', 'customer phone', 'phone']);
    var cTotal = _invCol(hdr, ['total', 'grandTotal', 'amount']);
    var cStatus = _invCol(hdr, ['status']);
    var cBal   = _invCol(hdr, ['balanceDue', 'balance due', 'balance']);
    var cDate  = _invCol(hdr, ['invoiceDate', 'invoice date', 'date']);

    var out = [];
    for (var r = rows.length - 1; r >= 1 && out.length < 25; r--) {
      var hay = [
        cNum >= 0 ? rows[r][cNum] : '', cName >= 0 ? rows[r][cName] : '',
        cEmail >= 0 ? rows[r][cEmail] : '', cPhone >= 0 ? rows[r][cPhone] : ''
      ].join(' ').toLowerCase();
      if (hay.indexOf(q) === -1) continue;
      out.push({
        invoiceNumber: cNum >= 0 ? String(rows[r][cNum] || '') : '',
        customerName:  cName >= 0 ? String(rows[r][cName] || '') : '',
        customerEmail: cEmail >= 0 ? String(rows[r][cEmail] || '') : '',
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

// JSONP for invoice.html — list recent invoices (newest first) for the
// browse buttons. filter: 'all' | 'open' | 'paid'. limit: max rows (default 50).
function listInvoices(e) {
  var cb = (e && e.parameter && e.parameter.callback) || 'callback';
  function jsonp(obj) {
    return ContentService.createTextOutput(cb + '(' + JSON.stringify(obj) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  try {
    var filter = String((e && e.parameter && e.parameter.filter) || 'all').trim().toLowerCase();
    var limit  = parseInt((e && e.parameter && e.parameter.limit), 10);
    if (!limit || limit < 1) limit = 50;

    var ss = SpreadsheetApp.openById(INVOICES_SHEET_ID);
    var sh = ss.getSheetByName(INVOICES_TAB);
    if (!sh || sh.getLastRow() < 2) return jsonp({ status: 'ok', invoices: [] });

    var rows = sh.getDataRange().getValues();
    var hdr  = rows[0].map(String);
    var cNum   = _invCol(hdr, ['invoiceNumber', 'invoice #', 'invoice number', 'invoiceNo'], 0);
    var cName  = _invCol(hdr, ['customerName', 'customer name', 'customer', 'name']);
    var cEmail = _invCol(hdr, ['customerEmail', 'customer email', 'email']);
    var cTotal = _invCol(hdr, ['total', 'grandTotal', 'amount']);
    var cStatus = _invCol(hdr, ['status']);
    var cBal   = _invCol(hdr, ['balanceDue', 'balance due', 'balance']);
    var cDate  = _invCol(hdr, ['invoiceDate', 'invoice date', 'date']);

    var out = [];
    for (var r = rows.length - 1; r >= 1 && out.length < limit; r--) {
      if (!(cNum >= 0 && String(rows[r][cNum]).trim())) continue; // skip blank rows
      var st  = cStatus >= 0 ? String(rows[r][cStatus] || 'open').toLowerCase() : 'open';
      var bal = cBal >= 0 ? Number(rows[r][cBal]) || 0 : 0;
      if (filter === 'paid' && st !== 'paid') continue;
      if (filter === 'open' && (st === 'paid' || st === 'cancelled' || bal <= 0)) continue;
      out.push({
        invoiceNumber: cNum >= 0 ? String(rows[r][cNum] || '') : '',
        customerName:  cName >= 0 ? String(rows[r][cName] || '') : '',
        customerEmail: cEmail >= 0 ? String(rows[r][cEmail] || '') : '',
        total:         cTotal >= 0 ? Number(rows[r][cTotal]) || 0 : 0,
        status:        cStatus >= 0 ? (rows[r][cStatus] || 'open') : 'open',
        balanceDue:    bal,
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
    function col(n) { return _invCol(hdr, [n]); }
    var cNum = _invCol(hdr, ['invoiceNumber', 'invoice #', 'invoice number', 'invoiceNo'], 0);
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
