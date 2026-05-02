/**
 * Cruise the Creek — Landing-page menu API
 *
 * SETUP (one time):
 * 1.  Open your Google Sheet.
 * 2.  Make two tabs named exactly:  Tiles   and   Submenus
 *
 *     Tiles tab — first row is the header, then one row per tile:
 *       id          order   label         subtitle                  type    url                                        external
 *       adventures  1       Adventures    Guided rides & maps       link    https://adventure-map.pages.dev/v2         TRUE
 *       rentals     2       Rentals       Day rides & multi-stops   menu
 *       shop        3       Shop          Browse bikes & gear       menu
 *       services    4       Services      Tune-ups & creek prep     menu
 *       test-rides  5       Test Rides    Try before you buy        link    test-ride.html                             FALSE
 *       creek-life  6       Creek Life    Stories, events, more     menu
 *
 *     Submenus tab — first row is the header, then one row per sub-link:
 *       tile        order   label              url                                          external
 *       rentals     1       Adventures         adventures.html                              FALSE
 *       rentals     2       Trailside          trailside.html                               FALSE
 *       rentals     3       Bridge the Gap     bridge-the-gap.html                          FALSE
 *       shop        1       Shop               https://www.cruisethecreek.com/shop-fix      TRUE
 *       shop        2       Quiz               https://www.cruisethecreek.com/tracker       TRUE
 *       services    1       Creek Ready        creek-ready.html                             FALSE
 *       creek-life  1       Creek Life Blog    creek-life-blog.html                         FALSE
 *       creek-life  2       Our Story          our-story.html                               FALSE
 *       creek-life  3       Events             events.html                                  FALSE
 *       creek-life  4       Sponsors           sponsors.html                                FALSE
 *       creek-life  5       Reviews            reviews.html                                 FALSE
 *       creek-life  6       Donate             donate.html                                  FALSE
 *       creek-life  7       FAQs               faqs.html                                    FALSE
 *
 * 3.  Extensions → Apps Script → paste this file, save.
 * 4.  Deploy → New deployment → Type: Web app
 *       - Execute as:    Me
 *       - Who has access: Anyone
 *     Copy the /exec URL it gives you.
 *
 * 5.  In home.html, set:    const MENU_URL = '<paste /exec URL here>';
 *
 * Editing the sheet now updates the landing page on next load.
 * To change the live menu without redeploying, edit the sheet and
 * (if you change the script) re-deploy as a new version.
 */

function doGet() {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const data = {
    tiles:    readSheet(ss, 'Tiles'),
    submenus: groupBy(readSheet(ss, 'Submenus'), 'tile'),
  };
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function readSheet(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh) return [];
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const header = values[0].map(h => String(h).trim());
  return values.slice(1)
    .filter(row => row.some(cell => cell !== '' && cell !== null))
    .map(row => {
      const obj = {};
      header.forEach((h, i) => { if (h) obj[h] = row[i]; });
      return obj;
    });
}

function groupBy(rows, key) {
  const out = {};
  rows
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .forEach(r => {
      const k = r[key];
      if (!k) return;
      (out[k] = out[k] || []).push(r);
    });
  return out;
}
