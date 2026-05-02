/**
 * Cruise the Creek — Site menu API (multi-page)
 *
 * One Apps Script web app powers every hub page (home, shop, …).
 * The script picks which sheet tabs to read based on the ?page=
 * query param.  Each page uses two tabs:  <Page>_Tiles  and  <Page>_Submenus.
 *
 * Examples:
 *   https://script.google.com/.../exec               → reads Home_Tiles + Home_Submenus  (default)
 *   https://script.google.com/.../exec?page=home     → same
 *   https://script.google.com/.../exec?page=shop     → reads Shop_Tiles + Shop_Submenus
 *
 * SETUP (one time):
 * 1.  Create a new Google Sheet:  "Cruise the Creek — Site Menu"
 * 2.  Add these tabs (header row in row 1, then one row per item):
 *
 *     Home_Tiles
 *       id          order   label         subtitle                  type    url                                        external
 *       adventures  1       Adventures    Guided rides & maps       link    https://adventure-map.pages.dev/v2         TRUE
 *       rentals     2       Rentals       Day rides & multi-stops   menu
 *       shop        3       Shop          Browse bikes & gear       link    shop.html                                  FALSE
 *       services    4       Services      Tune-ups & creek prep     menu
 *       test-rides  5       Test Rides    Try before you buy        link    test-ride.html                             FALSE
 *       creek-life  6       Creek Life    Stories, events, more     menu
 *
 *     Home_Submenus
 *       tile        order   label              url                                          external
 *       rentals     1       Adventures         adventures.html                              FALSE
 *       rentals     2       Trailside          trailside.html                               FALSE
 *       rentals     3       Bridge the Gap     bridge-the-gap.html                          FALSE
 *       services    1       Creek Ready        creek-ready.html                             FALSE
 *       creek-life  1       Creek Life Blog    creek-life-blog.html                         FALSE
 *       creek-life  2       Our Story          our-story.html                               FALSE
 *       creek-life  3       Events             events.html                                  FALSE
 *       creek-life  4       Sponsors           sponsors.html                                FALSE
 *       creek-life  5       Reviews            reviews.html                                 FALSE
 *       creek-life  6       Donate             donate.html                                  FALSE
 *       creek-life  7       FAQs               faqs.html                                    FALSE
 *
 *     Shop_Tiles
 *       id          order   label       subtitle                       type    url                external
 *       heybike     1       Heybike     Affordable, easygoing rides    link    heybike.html       FALSE
 *       velotric    2       Velotric    Sleek, premium e-bikes         link    velotric.html      FALSE
 *       jasion      3       Jasion      Trail-ready power              link    jasion.html        FALSE
 *       mooncool    4       Mooncool    Three-wheel comfort            link    mooncool.html      FALSE
 *
 *     Shop_Submenus  (leave empty for now — none of the brand tiles have submenus)
 *       tile        order   label       url       external
 *
 * 3.  Extensions → Apps Script → paste this file, save.
 * 4.  Deploy → New deployment → Type: Web app
 *       - Execute as:    Me
 *       - Who has access: Anyone
 *     Copy the /exec URL it gives you.
 *
 * 5.  Wire up the pages:
 *        home.html →  const MENU_URL = '<exec URL>';            (or '<exec URL>?page=home')
 *        shop.html →  const MENU_URL = '<exec URL>?page=shop';
 *
 * Adding a new hub page (e.g. rentals.html):
 *   - Add tabs Rentals_Tiles and Rentals_Submenus to the same sheet.
 *   - In rentals.html set MENU_URL to '<exec URL>?page=rentals'.
 *   - Re-deploy is NOT needed — the script reads the sheet on every request.
 */

function doGet(e) {
  const page = ((e && e.parameter && e.parameter.page) || 'home')
                 .toString().trim().toLowerCase();
  const cap  = page.charAt(0).toUpperCase() + page.slice(1);

  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const data = {
    page:     page,
    tiles:    readSheet(ss, cap + '_Tiles'),
    submenus: groupBy(readSheet(ss, cap + '_Submenus'), 'tile'),
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
