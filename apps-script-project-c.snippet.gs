/**
 * PASTE TARGET: Apps Script Project C (deployment AKfycbxmz…)
 *
 * This file is NOT executed anywhere from the repo — Project C's source lives
 * only in the Google Apps Script editor, so changes have to be made by hand.
 * Paste the dispatcher line + the function below into Project C, save, then
 * create a NEW deployment version. The deployment URL stays the same.
 *
 * What this enables:
 *   When a customer pays a Stripe invoice (either online via the hosted
 *   invoice page, or in-person via Stripe Terminal), the api/stripe-webhook.js
 *   serverless function calls Project C with action=markInvoicePaid. This
 *   handler finds the matching row in the Invoices tab and flips it to paid
 *   so balance.html stops showing it as open and the row's audit trail
 *   records the Stripe settlement.
 *
 * Paired with:
 *   - api/create-stripe-invoice.js  (sets metadata.ourInvoiceNumber)
 *   - api/stripe-webhook.js          (verifies signature, forwards to here)
 */

// ─────────────────────────────────────────────────────────────
// 1. Add this case to your doGet() router (alongside the other actions):
// ─────────────────────────────────────────────────────────────
//
//   if (action === 'markInvoicePaid') return handleMarkInvoicePaid(p);
//
// ─────────────────────────────────────────────────────────────
// 2. Paste this function at the bottom of the file:
// ─────────────────────────────────────────────────────────────

function handleMarkInvoicePaid(p) {
  const num = String(p.invoiceNumber || '').trim();
  if (!num) return json({ ok: false, error: 'missing invoiceNumber' });

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('Invoices');
  if (!sh) return json({ ok: false, error: 'no Invoices tab' });

  const lastCol = sh.getLastColumn();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return json({ ok: false, error: 'Invoices tab is empty' });

  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0]
                    .map(function(h){ return String(h || '').trim(); });
  const colInv = headers.indexOf('invoiceNumber');
  if (colInv < 0) return json({ ok: false, error: 'no invoiceNumber column' });

  // Find the matching row. Iterate from the bottom so duplicates (which
  // shouldn't exist but defensively) resolve to the most recent entry.
  const invCol = sh.getRange(2, colInv + 1, lastRow - 1, 1).getValues();
  let rowIdx = -1;
  for (let i = invCol.length - 1; i >= 0; i--) {
    if (String(invCol[i][0]).trim() === num) { rowIdx = i + 2; break; }
  }
  if (rowIdx < 0) return json({ ok: false, error: 'invoice not found: ' + num });

  // Updates: minimal but enough that balance.html drops the row from "open"
  // and Pat can see the Stripe trail. Keep paymentMode unchanged — that
  // field records intent at invoice creation time, not settlement reality.
  const stripeId       = String(p.stripeInvoiceId || '').trim();
  const stripeInvoiceNumber = String(p.stripeInvoiceNumber || '').trim();
  const amountPaid     = String(p.amountPaid || '').trim();
  const paidAt         = String(p.paidAt || new Date().toISOString()).trim();
  const noteSuffix     = 'Paid via Stripe (' +
                         (stripeInvoiceNumber || stripeId.slice(-8) || 'unknown') +
                         ') on ' + paidAt +
                         (amountPaid ? ' — $' + amountPaid : '');

  const setIf = function(headerName, value) {
    const c = headers.indexOf(headerName);
    if (c >= 0) sh.getRange(rowIdx, c + 1).setValue(value);
  };

  // Read existing paymentNotes so we append rather than overwrite.
  const notesCol = headers.indexOf('paymentNotes');
  let existingNotes = '';
  if (notesCol >= 0) {
    existingNotes = String(sh.getRange(rowIdx, notesCol + 1).getValue() || '').trim();
  }

  setIf('status',          'paid');
  setIf('balanceDue',      '0.00');
  setIf('stripeInvoiceId', stripeId);          // no-op if column doesn't exist
  setIf('paidAt',          paidAt);            // no-op if column doesn't exist
  setIf('paymentNotes',    existingNotes ? (existingNotes + ' | ' + noteSuffix) : noteSuffix);

  return json({ ok: true, invoiceNumber: num, row: rowIdx });
}

// ─────────────────────────────────────────────────────────────
// 3. Optional (recommended): add a `stripeInvoiceId` column to the Invoices
//    tab so the Stripe ID is preserved alongside the row. The setIf helper
//    above no-ops gracefully if the column is missing, so this is safe to
//    skip for an initial deploy.
// ─────────────────────────────────────────────────────────────


// ═════════════════════════════════════════════════════════════
// INVOICE MANAGER — search existing invoices + change status
//   Powers the "Find an Existing Invoice" + "Invoice Status" panels in
//   invoice.html. Both are called over JSONP (browser <script> with a
//   &callback= param), so the responses go through _invJsonpOut() below,
//   which wraps the JSON in the callback when one is present.
//
//   Add these two cases to your doGet() router (alongside markInvoicePaid):
//
//     if (action === 'searchInvoices')   return handleSearchInvoices(p);
//     if (action === 'setInvoiceStatus') return handleSetInvoiceStatus(p);
//
//   Then paste the three functions below and cut a NEW deployment version.
// ═════════════════════════════════════════════════════════════

// JSONP-aware output: wraps in the &callback= function when the browser
// asks for it (searchInvoices / setInvoiceStatus), else returns plain JSON.
function _invJsonpOut(p, obj) {
  var body = JSON.stringify(obj);
  var cb = p && p.callback ? String(p.callback) : '';
  if (cb) {
    return ContentService.createTextOutput(cb + '(' + body + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(body)
    .setMimeType(ContentService.MimeType.JSON);
}

// Search the Invoices tab by customer name / email / phone / invoice number.
// Returns the newest 25 matches. Case-insensitive substring match.
function handleSearchInvoices(p) {
  var q = String(p.q || '').trim().toLowerCase();
  if (!q) return _invJsonpOut(p, { status: 'ok', invoices: [] });

  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Invoices');
  if (!sh) return _invJsonpOut(p, { status: 'error', message: 'no Invoices tab' });
  var lastCol = sh.getLastColumn(), lastRow = sh.getLastRow();
  if (lastRow < 2) return _invJsonpOut(p, { status: 'ok', invoices: [] });

  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0]
                  .map(function (h) { return String(h || '').trim(); });
  var idx = function (name) { return headers.indexOf(name); };
  var cNum = idx('invoiceNumber'), cName = idx('customerName'), cEmail = idx('customerEmail'),
      cPhone = idx('customerPhone'), cTotal = idx('total'), cStatus = idx('status'),
      cBal = idx('balanceDue'), cDate = idx('invoiceDate');

  var rows = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var out = [];
  for (var i = rows.length - 1; i >= 0 && out.length < 25; i--) {
    var r = rows[i];
    var hay = [
      cNum >= 0 ? r[cNum] : '', cName >= 0 ? r[cName] : '',
      cEmail >= 0 ? r[cEmail] : '', cPhone >= 0 ? r[cPhone] : ''
    ].join(' ').toLowerCase();
    if (hay.indexOf(q) === -1) continue;
    out.push({
      invoiceNumber: cNum >= 0 ? String(r[cNum] || '') : '',
      customerName:  cName >= 0 ? String(r[cName] || '') : '',
      customerEmail: cEmail >= 0 ? String(r[cEmail] || '') : '',
      total:         cTotal >= 0 ? r[cTotal] : '',
      status:        cStatus >= 0 ? String(r[cStatus] || 'open') : 'open',
      balanceDue:    cBal >= 0 ? r[cBal] : '',
      invoiceDate:   cDate >= 0 ? String(r[cDate] || '') : ''
    });
  }
  return _invJsonpOut(p, { status: 'ok', invoices: out });
}

// Set an invoice's status in place (paid / unpaid / deposit / refunded / void).
// "paid" also zeroes balanceDue and stamps paidAt. Appends an audit note.
function handleSetInvoiceStatus(p) {
  var num = String(p.invoiceNumber || '').trim();
  var status = String(p.status || '').trim().toLowerCase();
  if (!num)    return _invJsonpOut(p, { status: 'error', message: 'missing invoiceNumber' });
  if (!status) return _invJsonpOut(p, { status: 'error', message: 'missing status' });

  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Invoices');
  if (!sh) return _invJsonpOut(p, { status: 'error', message: 'no Invoices tab' });
  var lastCol = sh.getLastColumn(), lastRow = sh.getLastRow();
  if (lastRow < 2) return _invJsonpOut(p, { status: 'error', message: 'Invoices tab empty' });

  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0]
                  .map(function (h) { return String(h || '').trim(); });
  var cInv = headers.indexOf('invoiceNumber');
  if (cInv < 0) return _invJsonpOut(p, { status: 'error', message: 'no invoiceNumber column' });

  var invCol = sh.getRange(2, cInv + 1, lastRow - 1, 1).getValues();
  var rowIdx = -1;
  for (var i = invCol.length - 1; i >= 0; i--) {
    if (String(invCol[i][0]).trim() === num) { rowIdx = i + 2; break; }
  }
  if (rowIdx < 0) return _invJsonpOut(p, { status: 'error', message: 'invoice not found: ' + num });

  var setIf = function (h, v) { var c = headers.indexOf(h); if (c >= 0) sh.getRange(rowIdx, c + 1).setValue(v); };
  var method = String(p.method || '').trim();
  var when = new Date().toISOString();
  var notesCol = headers.indexOf('paymentNotes');
  var existing = notesCol >= 0 ? String(sh.getRange(rowIdx, notesCol + 1).getValue() || '').trim() : '';
  var note = 'Status set to ' + status + (method ? ' (' + method + ')' : '') + ' on ' + when + ' via invoice.html';

  setIf('status', status);
  if (status === 'paid') { setIf('balanceDue', '0.00'); setIf('paidAt', when); }
  setIf('paymentNotes', existing ? (existing + ' | ' + note) : note);

  return _invJsonpOut(p, { status: 'ok', invoiceNumber: num, newStatus: status, row: rowIdx });
}
