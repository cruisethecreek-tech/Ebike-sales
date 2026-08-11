/**
 * PASTE TARGET: your MAIN CMS Apps Script project — the one with doGet/doPost
 * that already powers the website forms + poles (deployment AKfycbwXv6r6…).
 *
 * WHY: this consolidates the ebike INVOICE + CATALOG endpoints out of the
 * separate "Project C" script and into your CMS project, so everything you
 * actually edit (poles, invoices, forms) lives in ONE project with ONE
 * deployment URL. The Off Trail / adventure-map half stays in Project C,
 * untouched, so that separate app keeps working.
 *
 * These functions all reach their spreadsheets BY ID (openById), so they run
 * correctly from inside the CMS project even though it is bound to a different
 * workbook. No getActiveSpreadsheet() here.
 *
 * ── HOW TO INSTALL ────────────────────────────────────────────────────────
 * 1. Add these router lines to your CMS doGet(), next to the existing
 *    `if (action === '…')` lines:
 *
 *      if (action === 'getInvoiceCatalog')    return getInvoiceCatalog(e);
 *      if (action === 'addOrder')             return addOrder(e);
 *      if (action === 'getOpenBalances')      return getOpenBalances(e);
 *      if (action === 'getNextInvoiceNumber') return getNextInvoiceNumber(e);
 *      if (action === 'getInvoice')           return getInvoice(e);
 *      if (action === 'searchInvoices')       return searchInvoices(e);
 *      if (action === 'listInvoices')         return listInvoices(e);
 *      if (action === 'setInvoiceStatus')     return setInvoiceStatus(e);
 *      if (action === 'getInvoiceMeta')       return getInvoiceMeta(e);
 *      if (action === 'setInvoiceMeta')       return setInvoiceMeta(e);
 *      if (action === 'markInvoicePaid')      return markInvoicePaid(e);
 *
 * 2. Paste EVERYTHING below this comment block at the bottom of the file.
 *
 * 3. Authorize cross-sheet access ONCE: in the editor's function dropdown,
 *    pick `getNextInvoiceNumber` and click Run. Approve the "access another
 *    Google Spreadsheet" prompt (that's the ebike Inventory/Invoices sheet).
 *
 * 4. Deploy → Manage deployments → Edit (pencil) → Version: New version →
 *    Deploy. The URL stays the same.
 *
 * 5. DO NOT touch Project C. Its old invoice functions become dead code (the
 *    website no longer calls them) and can be cleaned up later; leaving them
 *    means zero risk to the adventure-map app right now.
 * ──────────────────────────────────────────────────────────────────────────
 */

// ── EBIKE INVOICES / CATALOG — cross-sheet via openById ──────────────
// Invoices + inventory live in the ebike Inventory Sheet (1R3pDFG…),
// a different spreadsheet than this CMS project is bound to.
const INVOICES_SHEET_ID = '1R3pDFG_sO81bKS6dEAa-k5F-OdD5OAbe4hQ-Oc0_T-E';
const INVOICES_TAB      = 'Invoices';

function _ensureInvoicesTab(ss) {
  var EXPECTED = [
    'invoiceNumber','invoiceDate','dueDate',
    'customerName','customerEmail','customerPhone','customerAddress',
    'lineItems',
    'subtotal','discountPct','discountAmt','tax','total','deposit','balanceDue',
    'paymentMode','depositMethod','depositRef','paymentNotes',
    'paymentLink',
    'createdAt','status'
  ];
  var sh = ss.getSheetByName(INVOICES_TAB);
  if (!sh) {
    sh = ss.insertSheet(INVOICES_TAB);
    sh.appendRow(EXPECTED);
    sh.setFrozenRows(1);
    return sh;
  }
  var firstCell = String(sh.getRange(1, 1).getValue()).trim();
  if (firstCell !== EXPECTED[0]) {
    sh.getRange(1, 1, 1, EXPECTED.length).setValues([EXPECTED]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function addOrder(e) {
  var p = (e && e.parameter) || {};
  var cb = p.callback;
  function respond(obj) {
    if (cb) {
      return ContentService.createTextOutput(cb + '(' + JSON.stringify(obj) + ');')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(JSON.stringify(obj))
      .setMimeType(ContentService.MimeType.JSON);
  }
  try {
    var ss = SpreadsheetApp.openById(INVOICES_SHEET_ID);
    var sh = _ensureInvoicesTab(ss);
    var balance = parseFloat(p.balanceDue) || 0;
    var row = [
      p.invoiceNumber   || '',
      p.invoiceDate     || '',
      p.dueDate         || '',
      p.customerName    || '',
      p.customerEmail   || '',
      p.customerPhone   || '',
      p.customerAddress || '',
      p.lineItems       || '',
      parseFloat(p.subtotal)    || 0,
      parseFloat(p.discountPct) || 0,
      parseFloat(p.discountAmt) || 0,
      parseFloat(p.tax)         || 0,
      parseFloat(p.total)       || 0,
      parseFloat(p.deposit)     || 0,
      balance,
      p.paymentMode     || '',
      p.depositMethod   || '',
      p.depositRef      || '',
      p.paymentNotes    || '',
      p.paymentLink     || '',
      new Date().toISOString(),
      balance > 0 ? 'sent' : 'paid'
    ];
    var lastRow = sh.getLastRow();
    var targetRow = -1;
    if (lastRow > 1 && p.invoiceNumber) {
      var nums = sh.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < nums.length; i++) {
        if (String(nums[i][0]).trim() === String(p.invoiceNumber).trim()) {
          targetRow = i + 2;
          break;
        }
      }
    }
    if (targetRow > 0) {
      sh.getRange(targetRow, 1, 1, row.length).setValues([row]);
    } else {
      sh.appendRow(row);
    }
    return respond({ ok: true, invoiceNumber: p.invoiceNumber, updated: targetRow > 0 });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

function getOpenBalances(e) {
  var cb = (e && e.parameter && e.parameter.callback) || 'callback';
  function jsonp(obj) {
    return ContentService.createTextOutput(cb + '(' + JSON.stringify(obj) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  try {
    var ss = SpreadsheetApp.openById(INVOICES_SHEET_ID);
    var sh = ss.getSheetByName(INVOICES_TAB);
    if (!sh || sh.getLastRow() < 2) return jsonp({ status: 'ok', invoices: [] });

    var rows = sh.getDataRange().getValues();
    var hdr  = rows[0].map(String);
    function col(name) { return hdr.indexOf(name); }
    var invoices = [];
    for (var r = 1; r < rows.length; r++) {
      var balance = Number(rows[r][col('balanceDue')]) || 0;
      var status  = String(rows[r][col('status')] || '').toLowerCase();
      if (balance <= 0) continue;
      if (status === 'paid' || status === 'cancelled') continue;
      invoices.push({
        invoiceNumber:  rows[r][col('invoiceNumber')],
        invoiceDate:    rows[r][col('invoiceDate')],
        dueDate:        rows[r][col('dueDate')],
        customerName:   rows[r][col('customerName')],
        customerEmail:  rows[r][col('customerEmail')],
        customerPhone:  rows[r][col('customerPhone')],
        total:          Number(rows[r][col('total')]) || 0,
        deposit:        Number(rows[r][col('deposit')]) || 0,
        balanceDue:     balance,
        paymentLink:    rows[r][col('paymentLink')] || '',
        status:         rows[r][col('status')] || 'sent'
      });
    }
    return jsonp({ status: 'ok', invoices: invoices });
  } catch (err) {
    return jsonp({ status: 'error', message: String(err) });
  }
}

function getNextInvoiceNumber(e) {
  var cb = (e && e.parameter && e.parameter.callback) || 'callback';
  function jsonp(obj) {
    return ContentService.createTextOutput(cb + '(' + JSON.stringify(obj) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  try {
    var ss = SpreadsheetApp.openById(INVOICES_SHEET_ID);
    var sh = ss.getSheetByName(INVOICES_TAB);
    if (!sh || sh.getLastRow() < 2) return jsonp({ status: 'ok', invoiceNumber: 'CTR-001' });

    var hdr    = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    var numCol = hdr.indexOf('invoiceNumber');
    if (numCol === -1) return jsonp({ status: 'ok', invoiceNumber: 'CTR-001' });

    var existing = sh.getRange(2, numCol + 1, sh.getLastRow() - 1, 1).getValues();
    var max = 0;
    existing.forEach(function(r) {
      var m = String(r[0] || '').match(/(\d+)\s*$/);
      if (m) {
        var v = parseInt(m[1], 10);
        if (v > max) max = v;
      }
    });
    var next = 'CTR-' + String(max + 1).padStart(3, '0');
    return jsonp({ status: 'ok', invoiceNumber: next });
  } catch (err) {
    return jsonp({ status: 'error', message: String(err) });
  }
}

function getInvoice(e) {
  var cb = (e && e.parameter && e.parameter.callback) || 'callback';
  function jsonp(obj) {
    return ContentService.createTextOutput(cb + '(' + JSON.stringify(obj) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  try {
    var wanted = String((e && e.parameter && e.parameter.invoiceNumber) || '').trim();
    if (!wanted) return jsonp({ status: 'error', message: 'invoiceNumber required' });

    var ss = SpreadsheetApp.openById(INVOICES_SHEET_ID);
    var sh = ss.getSheetByName(INVOICES_TAB);
    if (!sh || sh.getLastRow() < 2) {
      return jsonp({ status: 'error', message: 'Invoices tab empty' });
    }
    var rows = sh.getDataRange().getValues();
    var hdr  = rows[0].map(String);
    function col(name) { return hdr.indexOf(name); }

    for (var r = 1; r < rows.length; r++) {
      var n = String(rows[r][col('invoiceNumber')] || '').trim();
      if (n !== wanted) continue;
      return jsonp({
        status: 'ok',
        invoice: {
          invoiceNumber:   rows[r][col('invoiceNumber')]   || '',
          invoiceDate:     rows[r][col('invoiceDate')]     || '',
          dueDate:         rows[r][col('dueDate')]         || '',
          customerName:    rows[r][col('customerName')]    || '',
          customerEmail:   rows[r][col('customerEmail')]   || '',
          customerPhone:   rows[r][col('customerPhone')]   || '',
          customerAddress: rows[r][col('customerAddress')] || '',
          lineItems:       rows[r][col('lineItems')]       || '[]',
          subtotal:        Number(rows[r][col('subtotal')])    || 0,
          discountPct:     Number(rows[r][col('discountPct')]) || 0,
          discountAmt:     Number(rows[r][col('discountAmt')]) || 0,
          tax:             Number(rows[r][col('tax')])         || 0,
          total:           Number(rows[r][col('total')])       || 0,
          deposit:         Number(rows[r][col('deposit')])     || 0,
          balanceDue:      Number(rows[r][col('balanceDue')])  || 0,
          paymentMode:     rows[r][col('paymentMode')]   || 'full',
          depositMethod:   rows[r][col('depositMethod')] || '',
          depositRef:      rows[r][col('depositRef')]    || '',
          paymentNotes:    rows[r][col('paymentNotes')]  || '',
          paymentLink:     rows[r][col('paymentLink')]   || '',
          status:          rows[r][col('status')]        || ''
        }
      });
    }
    return jsonp({ status: 'error', message: 'Invoice ' + wanted + ' not found' });
  } catch (err) {
    return jsonp({ status: 'error', message: String(err) });
  }
}

// Shared header helper — resolve a column by ANY of several header name
// aliases, with an optional positional fallback.
function _invCol(hdr, aliases, fallbackIdx) {
  var norm = function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ''); };
  var normHdr = hdr.map(norm);
  for (var a = 0; a < aliases.length; a++) {
    var idx = normHdr.indexOf(norm(aliases[a]));
    if (idx >= 0) return idx;
  }
  return (fallbackIdx === undefined) ? -1 : fallbackIdx;
}

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
    var cNum   = _invCol(hdr, ['invoiceNumber', 'invoice #', 'invoice number', 'invoiceNo'], 0);
    var cName  = _invCol(hdr, ['customerName', 'customer name', 'customer', 'name']);
    var cEmail = _invCol(hdr, ['customerEmail', 'customer email', 'email']);
    var cPhone = _invCol(hdr, ['customerPhone', 'customer phone', 'phone']);
    var cTotal = _invCol(hdr, ['total', 'grandTotal', 'amount']);
    var cStatus = _invCol(hdr, ['status']);
    var cBal   = _invCol(hdr, ['balanceDue', 'balance due', 'balance']);
    var cDate  = _invCol(hdr, ['invoiceDate', 'invoice date', 'date']);
    var cItems = _invCol(hdr, ['lineItems', 'line items', 'items']);

    var out = [];
    for (var r = rows.length - 1; r >= 1 && out.length < 25; r--) {
      var hay = [
        cNum >= 0 ? rows[r][cNum] : '', cName >= 0 ? rows[r][cName] : '',
        cEmail >= 0 ? rows[r][cEmail] : '', cPhone >= 0 ? rows[r][cPhone] : ''
      ].join(' ').toLowerCase();
      if (hay.indexOf(q) === -1) continue;

      var prodDesc = '';
      if (cItems >= 0 && rows[r][cItems]) {
        try {
          var parsedItems = JSON.parse(rows[r][cItems]);
          if (Array.isArray(parsedItems) && parsedItems.length > 0) {
            var first = parsedItems[0];
            prodDesc = first.name || first.description || first.title || first.model || '';
            if (parsedItems.length > 1) prodDesc += ' (+ ' + (parsedItems.length - 1) + ' more)';
          }
        } catch(e) {}
      }

      out.push({
        invoiceNumber: cNum >= 0 ? String(rows[r][cNum] || '') : '',
        customerName:  cName >= 0 ? String(rows[r][cName] || '') : '',
        customerEmail: cEmail >= 0 ? String(rows[r][cEmail] || '') : '',
        productDesc:   prodDesc,
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

    var cItems = _invCol(hdr, ['lineItems', 'line items', 'items']);

    var out = [];
    for (var r = rows.length - 1; r >= 1 && out.length < limit; r--) {
      if (!(cNum >= 0 && String(rows[r][cNum]).trim())) continue;
      var st  = cStatus >= 0 ? String(rows[r][cStatus] || 'open').toLowerCase() : 'open';
      var bal = cBal >= 0 ? Number(rows[r][cBal]) || 0 : 0;
      if (filter === 'paid' && st !== 'paid') continue;
      if (filter === 'open' && (st === 'paid' || st === 'cancelled' || bal <= 0)) continue;

      var prodDesc = '';
      if (cItems >= 0 && rows[r][cItems]) {
        try {
          var parsedItems = JSON.parse(rows[r][cItems]);
          if (Array.isArray(parsedItems) && parsedItems.length > 0) {
            var first = parsedItems[0];
            prodDesc = first.name || first.description || first.title || first.model || '';
            if (parsedItems.length > 1) prodDesc += ' (+ ' + (parsedItems.length - 1) + ' more)';
          }
        } catch(e) {}
      }

      out.push({
        invoiceNumber: cNum >= 0 ? String(rows[r][cNum] || '') : '',
        customerName:  cName >= 0 ? String(rows[r][cName] || '') : '',
        customerEmail: cEmail >= 0 ? String(rows[r][cEmail] || '') : '',
        productDesc:   prodDesc,
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

// INTERNAL supplier / warranty tracking URL (per invoice) — auto-creates
// the "supplierUrl" column on first save; used by invoice.html's staff-only
// field (hidden from the printed invoice).
function getInvoiceMeta(e) {
  var cb = (e && e.parameter && e.parameter.callback) || 'callback';
  function jsonp(obj) {
    return ContentService.createTextOutput(cb + '(' + JSON.stringify(obj) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  try {
    var num = String((e && e.parameter && e.parameter.invoiceNumber) || '').trim();
    if (!num) return jsonp({ status: 'error', message: 'invoiceNumber required' });

    var ss = SpreadsheetApp.openById(INVOICES_SHEET_ID);
    var sh = ss.getSheetByName(INVOICES_TAB);
    if (!sh || sh.getLastRow() < 2) return jsonp({ status: 'ok', supplierUrl: '' });

    var rows = sh.getDataRange().getValues();
    var hdr  = rows[0].map(String);
    var cNum = _invCol(hdr, ['invoiceNumber', 'invoice #', 'invoice number', 'invoiceNo'], 0);
    var cUrl = _invCol(hdr, ['supplierUrl', 'supplier url', 'trackingUrl', 'tracking url', 'shopUrl']);
    if (cUrl < 0) return jsonp({ status: 'ok', supplierUrl: '' });

    for (var r = rows.length - 1; r >= 1; r--) {
      if (String(rows[r][cNum]).trim() === num) {
        return jsonp({ status: 'ok', invoiceNumber: num, supplierUrl: String(rows[r][cUrl] || '') });
      }
    }
    return jsonp({ status: 'ok', supplierUrl: '' });
  } catch (err) {
    return jsonp({ status: 'error', message: String(err) });
  }
}

function setInvoiceMeta(e) {
  var cb = (e && e.parameter && e.parameter.callback) || 'callback';
  function jsonp(obj) {
    return ContentService.createTextOutput(cb + '(' + JSON.stringify(obj) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  try {
    var num = String((e && e.parameter && e.parameter.invoiceNumber) || '').trim();
    if (!num) return jsonp({ status: 'error', message: 'invoiceNumber required' });
    var url = String((e && e.parameter && e.parameter.supplierUrl) || '').trim();

    var ss = SpreadsheetApp.openById(INVOICES_SHEET_ID);
    var sh = ss.getSheetByName(INVOICES_TAB);
    if (!sh || sh.getLastRow() < 2) return jsonp({ status: 'error', message: 'Invoices tab empty' });

    var rows = sh.getDataRange().getValues();
    var hdr  = rows[0].map(String);
    var cNum = _invCol(hdr, ['invoiceNumber', 'invoice #', 'invoice number', 'invoiceNo'], 0);
    var cUrl = _invCol(hdr, ['supplierUrl', 'supplier url', 'trackingUrl', 'tracking url', 'shopUrl']);

    if (cUrl < 0) {
      cUrl = hdr.length;
      sh.getRange(1, cUrl + 1).setValue('supplierUrl');
    }

    var target = -1;
    for (var r = rows.length - 1; r >= 1; r--) {
      if (String(rows[r][cNum]).trim() === num) { target = r + 1; break; }
    }
    if (target < 0) return jsonp({ status: 'error', message: 'Invoice ' + num + ' not found' });

    sh.getRange(target, cUrl + 1).setValue(url);
    return jsonp({ status: 'ok', invoiceNumber: num, supplierUrl: url, row: target });
  } catch (err) {
    return jsonp({ status: 'error', message: String(err) });
  }
}

// Stripe webhook (api/stripe-webhook.js) calls this with action=markInvoicePaid
// when an invoice is paid online or via Terminal. Flips the row to paid, zeroes
// the balance, and logs the Stripe details. (This action never existed in the
// old Project C, so Stripe auto-mark-paid never worked until now.)
function markInvoicePaid(e) {
  var p = (e && e.parameter) || {};
  var cb = p.callback;
  function respond(obj) {
    if (cb) return ContentService.createTextOutput(cb + '(' + JSON.stringify(obj) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
    return ContentService.createTextOutput(JSON.stringify(obj))
      .setMimeType(ContentService.MimeType.JSON);
  }
  try {
    var num = String(p.invoiceNumber || '').trim();
    if (!num) return respond({ ok: false, error: 'invoiceNumber required' });

    var ss = SpreadsheetApp.openById(INVOICES_SHEET_ID);
    var sh = ss.getSheetByName(INVOICES_TAB);
    if (!sh || sh.getLastRow() < 2) return respond({ ok: false, error: 'Invoices tab empty' });

    var rows = sh.getDataRange().getValues();
    var hdr  = rows[0].map(String);
    var cNum = _invCol(hdr, ['invoiceNumber', 'invoice #', 'invoice number', 'invoiceNo'], 0);
    function col(n) { return _invCol(hdr, [n]); }

    var target = -1;
    for (var r = rows.length - 1; r >= 1; r--) {
      if (String(rows[r][cNum]).trim() === num) { target = r + 1; break; }
    }
    if (target < 0) return respond({ ok: false, error: 'Invoice ' + num + ' not found' });

    function setIf(n, v) { var c = col(n); if (c >= 0) sh.getRange(target, c + 1).setValue(v); }
    setIf('status', 'paid');
    setIf('balanceDue', 0);
    if (p.hostedInvoiceUrl) setIf('paymentLink', p.hostedInvoiceUrl);

    var cNotes = col('paymentNotes');
    var existing = cNotes >= 0 ? String(sh.getRange(target, cNotes + 1).getValue() || '').trim() : '';
    var note = 'Paid via Stripe' +
               (p.amountPaid ? ' $' + p.amountPaid : '') +
               (p.stripeInvoiceNumber ? ' (' + p.stripeInvoiceNumber + ')' : '') +
               (p.paidAt ? ' on ' + p.paidAt : '');
    setIf('paymentNotes', existing ? (existing + ' | ' + note) : note);

    return respond({ ok: true, invoiceNumber: num, status: 'paid', row: target });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

// EBIKE INVOICE CATALOG — reads the ebike Inventory Sheet (1R3pDFG…) so
// invoice.html can auto-fill bike / accessory / apparel prices.
function getInvoiceCatalog(e) {
  var INVENTORY_SHEET_ID = '1R3pDFG_sO81bKS6dEAa-k5F-OdD5OAbe4hQ-Oc0_T-E';

  function findCol(headers, candidates) {
    var lower = headers.map(function(h){ return String(h||'').toLowerCase().trim(); });
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i].toLowerCase();
      var idx = lower.indexOf(c);
      if (idx !== -1) return idx;
      for (var j = 0; j < lower.length; j++) if (lower[j].indexOf(c) !== -1) return j;
    }
    return -1;
  }
  function num(v) {
    var n = parseFloat(String(v||'').replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? 0 : n;
  }
  function jsonp(callback, obj) {
    return ContentService.createTextOutput(callback + '(' + JSON.stringify(obj) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  var callback = (e && e.parameter && e.parameter.callback) || 'callback';

  try {
    var ss = SpreadsheetApp.openById(INVENTORY_SHEET_ID);
    var bikes = [], accessories = [], apparel = [];

    var inv = ss.getSheetByName('Inventory');
    if (inv && inv.getLastRow() > 1) {
      var ir = inv.getDataRange().getValues();
      var iName  = findCol(ir[0], ['name', 'model', 'display name']);
      var iPrice = findCol(ir[0], ['price', 'msrp', 'cost']);
      var iBrand = findCol(ir[0], ['brand', 'make']);
      if (iName  === -1) iName  = 3;
      if (iPrice === -1) iPrice = 4;
      for (var r = 1; r < ir.length; r++) {
        var nm = String(ir[r][iName] || '').trim();
        if (!nm) continue;
        bikes.push({
          name:  nm,
          price: num(ir[r][iPrice]),
          brand: iBrand !== -1 ? String(ir[r][iBrand] || '').trim() : ''
        });
      }
    }

    var cat = ss.getSheetByName('Catalog');
    if (cat && cat.getLastRow() > 1) {
      var cr = cat.getDataRange().getValues();
      var cName  = findCol(cr[0], ['name', 'item', 'product']);
      var cPrice = findCol(cr[0], ['price', 'msrp', 'cost']);
      var cType  = findCol(cr[0], ['type', 'category', 'kind']);
      if (cName  === -1) cName  = 0;
      if (cPrice === -1) cPrice = 1;
      for (var r = 1; r < cr.length; r++) {
        var nm = String(cr[r][cName] || '').trim();
        if (!nm) continue;
        var item = { name: nm, price: num(cr[r][cPrice]) };
        var t = cType !== -1 ? String(cr[r][cType] || '').toLowerCase().trim() : '';
        if (t.indexOf('apparel') !== -1 || t.indexOf('shirt') !== -1 || t.indexOf('tee') !== -1) {
          apparel.push(item);
        } else {
          accessories.push(item);
        }
      }
    }

    return jsonp(callback, { status: 'ok', bikes: bikes, accessories: accessories, apparel: apparel });
  } catch (err) {
    return jsonp(callback, { status: 'error', error: String(err) });
  }
}
