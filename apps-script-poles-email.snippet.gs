/**
 * PASTE TARGET: your main CMS Apps Script (deployment AKfycbwXv6r6… — the one
 * with doPost that already dispatches on `action`, e.g. 'repairIntake').
 *
 * This file is NOT executed from the repo — the Apps Script source lives only
 * in the Google Apps Script editor. Paste the dispatcher line + the function
 * below, save, and create a NEW deployment version (the /exec URL stays the
 * same). Put that /exec URL in the Vercel env var POLES_EMAIL_URL.
 *
 * What this enables:
 *   api/peek-poles-webhook.js POSTs { action:'polesAccessCode', to, name, pin,
 *   window, reference } here after minting the igloohome locker code. This
 *   emails the customer their code + pickup instructions via MailApp.
 *
 * Paired with:
 *   - api/peek-poles-webhook.js  (Peek booking → igloohome PIN → SMS + this email)
 */

// ─────────────────────────────────────────────────────────────
// 1. Add these cases to your doPost() dispatcher (next to 'repairIntake'):
// ─────────────────────────────────────────────────────────────
//
//   if (action === 'polesAccessCode') return handlePolesAccessCode(p);
//   if (action === 'polesCodeLookup') return handlePolesCodeLookup(p);
//
// ─────────────────────────────────────────────────────────────
// 2. Paste this function at the bottom of the file:
// ─────────────────────────────────────────────────────────────

function handlePolesAccessCode(p) {
  var json = function (obj) {
    return ContentService.createTextOutput(JSON.stringify(obj))
      .setMimeType(ContentService.MimeType.JSON);
  };

  var to = String(p.to || '').trim();
  var pin = String(p.pin || '').trim();
  if (!to || !pin) return json({ ok: false, error: 'missing to/pin' });

  var name = String(p.name || '').trim();
  var when = String(p.window || '').trim();
  var ref = String(p.reference || '').trim();
  var greeting = name ? ('Hi ' + name + ',') : 'Hi there,';

  var html =
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;max-width:520px;margin:0 auto">' +
      '<h2 style="color:#2D4A32;margin:0 0 6px">Your Jetti walking pole code</h2>' +
      '<p style="margin:0 0 16px;color:#3a3a3a">' + greeting + ' thanks for booking with Cruise the Creek. ' +
        'Here is your self-serve locker code for the Kirk Road Trailhead.</p>' +
      '<div style="background:#F5F0E8;border:1px solid #C9A96E;border-radius:10px;padding:18px;text-align:center;margin:0 0 18px">' +
        '<div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#a98843;font-weight:700">Locker code</div>' +
        '<div style="font-size:34px;font-weight:800;letter-spacing:.08em;color:#2D4A32;margin-top:4px">' + pin + '</div>' +
        (when ? '<div style="font-size:13px;color:#5a5a5a;margin-top:6px">Valid ' + when + '</div>' : '') +
      '</div>' +
      '<p style="margin:0 0 8px;color:#3a3a3a"><strong>At the locker:</strong></p>' +
      '<ol style="margin:0 0 16px;padding-left:20px;color:#3a3a3a;line-height:1.6">' +
        '<li>Enter this code on the padlock.</li>' +
        '<li>Grab the color-taped set for your size: ' +
          '<strong>Small</strong> = blue, <strong>Medium</strong> = yellow, ' +
          '<strong>Large</strong> = red, <strong>Extra Large</strong> = white.</li>' +
        '<li>Each rental is a full set (two poles). When you\'re done, return them ' +
          'to the same color spot and lock up.</li>' +
      '</ol>' +
      '<p style="margin:0;color:#5a5a5a;font-size:13px">Questions? Text the rentals desk at 330-406-9686.' +
        (ref ? '<br>Booking ref: ' + ref : '') + '</p>' +
    '</div>';

  MailApp.sendEmail({
    to: to,
    subject: 'Your Jetti walking pole locker code' + (when ? ' — valid ' + when : ''),
    htmlBody: html,
    body: greeting + ' Your Kirk Road locker code is ' + pin +
          (when ? ' (valid ' + when + ')' : '') +
          '. Grab the color-taped set for your size (Small=blue, Medium=yellow, ' +
          'Large=red, Extra Large=white), then return them and lock up. ' +
          'Questions? Text 330-406-9686.',
    name: 'Cruise the Creek',
  });

  // Internal heads-up to the desks so staff know a code went out. Wrapped in
  // try/catch so an internal-email hiccup never blocks the customer's code.
  try {
    MailApp.sendEmail({
      to: 'info@cruisethecreek.com,salesteam@cruisethecreek.com',
      subject: 'Poles code issued' + (name ? ' — ' + name : '') + (ref ? ' (' + ref + ')' : ''),
      body: 'A Jetti pole locker code was issued.\n\n' +
            'Customer: ' + (name || '(unknown)') + '\n' +
            'Email: ' + to + '\n' +
            'Code: ' + pin + '\n' +
            (when ? 'Valid: ' + when + '\n' : '') +
            (ref ? 'Booking ref: ' + ref + '\n' : ''),
      name: 'Cruise the Creek',
    });
  } catch (e) { /* internal copy is best-effort */ }

  // Permanent audit trail: append every issued code to a "PolesCodes" tab
  // (created with headers on first run). Best-effort so it never blocks the code.
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('PolesCodes');
    if (!sh) {
      sh = ss.insertSheet('PolesCodes');
      sh.appendRow(['Issued at', 'Customer', 'Email', 'Code', 'Valid window', 'Booking ref']);
    }
    sh.appendRow([new Date(), name || '', to, pin, when || '', ref || '']);
  } catch (e) { /* logging is best-effort */ }

  return json({ ok: true, to: to });
}

// ─────────────────────────────────────────────────────────────
// 3. Paste this function too — it powers webhook idempotency.
//    api/peek-poles-webhook.js POSTs { action:'polesCodeLookup', reference }
//    BEFORE minting a new code. If this booking ref already has a code in the
//    PolesCodes tab, the webhook re-sends that same code instead of minting a
//    fresh one — so a Zapier retry / duplicate "Booking Updated" fire can never
//    burn a second igloohome PIN slot for the same reservation.
// ─────────────────────────────────────────────────────────────

function handlePolesCodeLookup(p) {
  var json = function (obj) {
    return ContentService.createTextOutput(JSON.stringify(obj))
      .setMimeType(ContentService.MimeType.JSON);
  };

  var ref = String(p.reference || '').trim();
  if (!ref) return json({ ok: true, found: false });

  // Apps Script occasionally throws a transient "Sheet 0 not found" on back-to-
  // back sheet access. Retry with back-off so a one-off glitch can't make the
  // lookup wrongly report not-found and let a duplicate code get minted.
  var lastErr = '';
  for (var attempt = 0; attempt < 3; attempt++) {
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sh = ss.getSheetByName('PolesCodes');
      if (!sh || sh.getLastRow() < 2) return json({ ok: true, found: false });

      // Columns: Issued at | Customer | Email | Code | Valid window | Booking ref
      var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues();
      // Scan newest-first so a re-issue returns the most recent code.
      for (var i = rows.length - 1; i >= 0; i--) {
        if (String(rows[i][5] || '').trim() === ref) {
          return json({
            ok: true,
            found: true,
            code: String(rows[i][3] || '').trim(),
            window: String(rows[i][4] || '').trim(),
            to: String(rows[i][2] || '').trim(),
            name: String(rows[i][1] || '').trim(),
          });
        }
      }
      return json({ ok: true, found: false });
    } catch (e) {
      lastErr = String(e);
      Utilities.sleep(400 * (attempt + 1)); // back off, then retry
    }
  }
  // All retries failed: fail-open so a lookup glitch never blocks issuing a code.
  return json({ ok: true, found: false, error: lastErr });
}
