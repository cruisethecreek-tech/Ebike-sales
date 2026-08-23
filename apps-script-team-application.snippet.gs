/**
 * PASTE TARGET: your main CMS Apps Script (deployment AKfycbwXv6r6… — the same
 * one that already dispatches on `action`, e.g. 'bridgeApplication').
 *
 * This file is NOT executed from the repo — the Apps Script source lives only
 * in the Google Apps Script editor. Paste the dispatcher line + the function
 * below, save, and create a NEW deployment version (the /exec URL stays the
 * same, so join-the-team.html needs no change).
 *
 * What this enables:
 *   join-the-team.html submits its hiring application to
 *   ?action=teamApplication. This writes the applicant to a Team_Applications
 *   tab and emails the info desk. Until it's pasted and redeployed, the page's
 *   submit fails gracefully and tells the applicant to text 330-406-9686.
 *
 * Mirrors handleBridgeApplication's pattern so every application surface
 * behaves the same way (GET params in, JSON out, Sheet is source of truth,
 * a mail failure never sinks the submission).
 */

// ─────────────────────────────────────────────────────────────
// 1. Add this case to your doGet()/doPost() dispatcher, next to
//    the 'bridgeApplication' line:
// ─────────────────────────────────────────────────────────────
//
//   if (action === 'teamApplication') {
//     return handleTeamApplication(e.parameter || {});
//   }
//
// ─────────────────────────────────────────────────────────────
// 2. Paste this function at the bottom of the file:
// ─────────────────────────────────────────────────────────────

function handleTeamApplication(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const json = function(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj))
      .setMimeType(ContentService.MimeType.JSON);
  };

  try {
    const now = new Date();
    const id  = 'JOB-' + Utilities.formatDate(now, 'America/New_York', 'yyMMdd-HHmmss');
    const str = function(v) { return String(v || '').trim(); };

    const row = {
      id:                id,
      timestamp:         now,
      first_name:        str(p.first_name),
      last_name:         str(p.last_name),
      email:             str(p.email),
      phone:             str(p.phone),
      city:              str(p.city),
      zip:               str(p.zip),
      over_18:           str(p.over_18),
      work_authorized:   str(p.work_authorized),
      roles:             str(p.roles),             // comma-separated
      availability:      str(p.availability),      // comma-separated
      start_date:        str(p.start_date),
      hours_per_week:    str(p.hours_per_week),
      ride_experience:   str(p.ride_experience),
      park_knowledge:    str(p.park_knowledge),
      first_aid:         str(p.first_aid),
      own_transport:     str(p.own_transport),
      group_experience:  str(p.group_experience),
      why_join:          str(p.why_join),
      resume_url:        str(p.resume_url),
      referral:          str(p.referral),
      notes:             str(p.notes),
      status:            'new',
    };

    // Minimum viable application. The page enforces these client-side too,
    // but a hand-built URL shouldn't be able to write a blank row.
    if (!row.first_name || !row.email || !row.phone || !row.roles) {
      return json({ ok: false, error: 'Missing required fields.' });
    }

    const HEADERS = ['id','timestamp','first_name','last_name','email','phone',
                     'city','zip','over_18','work_authorized','roles','availability',
                     'start_date','hours_per_week','ride_experience','park_knowledge',
                     'first_aid','own_transport','group_experience','why_join',
                     'resume_url','referral','notes','status'];

    let sh = ss.getSheetByName('Team_Applications');
    if (!sh) {
      sh = ss.insertSheet('Team_Applications');
      sh.appendRow(HEADERS);
      sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    sh.appendRow(HEADERS.map(function(h) { return row[h]; }));

    // Notify the team. A mail failure logs but doesn't sink the request —
    // the row in the Sheet is the source of truth.
    try {
      const fullName = (row.first_name + ' ' + row.last_name).trim() || '(no name)';
      const body = [
        'New team application — ' + row.id,
        '',
        '— APPLICANT —',
        'Name:          ' + fullName,
        'Email:         ' + (row.email || '(missing)'),
        'Phone:         ' + (row.phone || '(missing)'),
        'Location:      ' + (row.city || '?') + ', OH ' + (row.zip || '?'),
        '18 or older:   ' + (row.over_18 || '(blank)'),
        'Work auth:     ' + (row.work_authorized || '(blank)'),
        '',
        '— WHAT THEY WANT —',
        'Roles:         ' + row.roles,
        'Availability:  ' + (row.availability || '(none given)'),
        'Can start:     ' + (row.start_date || '(blank)'),
        'Hours wanted:  ' + (row.hours_per_week || '(blank)'),
        '',
        '— ON THE BIKE —',
        'E-bike comfort:' + (row.ride_experience || '(blank)'),
        'Knows park:    ' + (row.park_knowledge || '(blank)'),
        'First Aid/CPR: ' + (row.first_aid || '(blank)'),
        'Transport:     ' + (row.own_transport || '(blank)'),
        '',
        '— LEADING GROUPS —',
        (row.group_experience || '(blank)'),
        '',
        '— WHY THEY WANT IT —',
        (row.why_join || '(blank)'),
        '',
        '— EXTRAS —',
        'Resume:        ' + (row.resume_url || '(none)'),
        'Heard via:     ' + (row.referral || '(blank)'),
        'Notes:         ' + (row.notes || '(none)'),
        '',
        'Logged at ' + row.timestamp + ' (Team_Applications tab, status=new)',
      ].join('\n');

      MailApp.sendEmail({
        to:      'info@cruisethecreek.com',
        replyTo: row.email || 'info@cruisethecreek.com',
        subject: 'Team application — ' + fullName + ' · ' + row.roles + ' (' + row.id + ')',
        body:    body,
      });
    } catch (mailErr) {
      console.warn('Team application email failed: ' + mailErr);
    }

    // Acknowledge the applicant. Deliberately does NOT promise an interview,
    // a callback window, or that the role is open — it confirms receipt only.
    if (row.email) {
      try {
        MailApp.sendEmail({
          to:      row.email,
          replyTo: 'info@cruisethecreek.com',
          subject: 'We got your application — Cruise the Creek',
          body: [
            'Hi ' + (row.first_name || 'there') + ',',
            '',
            'Thanks for applying to join the Cruise the Creek crew. We have your',
            'application and we read every one.',
            '',
            'You applied for: ' + row.roles,
            'Reference: ' + row.id,
            '',
            'If it looks like a fit, someone will reach out from 330-406-9686. If you',
            'don\'t hear back and you\'re still interested, text that number and ask —',
            'we\'d rather hear from you twice than lose you to a missed message.',
            '',
            '— Cruise the Creek',
            '6685 Kirk Rd, Canfield, OH 44406',
          ].join('\n'),
        });
      } catch (ackErr) {
        console.warn('Team application acknowledgement failed: ' + ackErr);
      }
    }

    return json({ ok: true, id: row.id });

  } catch (err) {
    console.error('handleTeamApplication failed: ' + err);
    return json({ ok: false, error: String(err) });
  }
}
