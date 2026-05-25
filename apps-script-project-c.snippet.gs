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
