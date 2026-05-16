/**
 * TEMPORARY export helper. Dumps the CMS values needed to sync the
 * hardcoded HTML defaults across the site into a sheet tab named
 * `_CmsExport`. Once the sync is done, this file can be deleted and the
 * `_CmsExport` tab removed.
 *
 * HOW TO RUN:
 *   1. Open the Apps Script editor bound to the Cruise the Creek sheet.
 *   2. Paste the contents of this file alongside apps-script.gs (or add
 *      it as a new script file in the same project — same project so it
 *      can call readSheet() / _setReadCacheBypass_()).
 *   3. From the Run menu, choose `exportCmsDefaults` and run it once.
 *      First run will prompt for sheet permissions; approve.
 *   4. Open the spreadsheet, switch to the new tab `_CmsExport`.
 *   5. Select columns A:B (Ctrl/Cmd-Shift-End from A1), copy, and paste
 *      the result back into the Claude Code session.
 *
 * Output shape (one row per key):
 *   A           B
 *   ─────────── ──────────────────────────────────────────
 *   site        {"siteName":"Cruise the Creek", ...}
 *   home        {"slug":"home","hero_h1":"...", ...}
 *   accessories {"slug":"accessories", ...}
 *   ...
 *
 * Each B cell is a JSON-stringified object. The `site` row is the
 * merged SiteConfig + Photos map (Photos wins on conflicts), exactly
 * as `_doGetInner` in apps-script.gs builds it. Each per-page row is
 * the matching row from the `Pages` tab. Both are what `data-cms-*`
 * attributes resolve against in the live site.
 */

function exportCmsDefaults() {
  // Slugs of the pages that actually have data-cms-* bindings. Pages
  // that only render lists (apparel, blog) or are admin-only (analytics,
  // invoice, salespro, etc.) are excluded — they have no hardcoded
  // defaults to sync. Brand pages (heybike/velotric/jasion/mooncool)
  // also excluded — they pull inventory only.
  const PAGES = [
    'home', 'accessories', 'adventures', 'assembly', 'bridge-the-gap',
    'creek-ready', 'donate', 'events', 'faqs', 'gallery', 'journeys',
    'long-term-rental', 'our-story', 'rentals', 'safety', 'shop',
    'trailside', 'tune-ups', 'video-diagnostics',
  ];

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Force a fresh read so any pending edits land in the export instead
  // of stale 60s-cached values. apps-script.gs exposes the bypass flag.
  _setReadCacheBypass_(true);
  try {
    const site = {};
    readSheet(ss, 'SiteConfig').forEach(function(r){
      const k = String(r.key || '').trim();
      if (!k || k.indexOf('──') === 0) return;
      site[k] = r.value;
    });
    readSheet(ss, 'Photos').forEach(function(r){
      if (r.key && r.value !== '' && r.value != null) {
        site[String(r.key).trim()] = r.value;
      }
    });

    const pagesRows = readSheet(ss, 'Pages');
    const pageMetaBySlug = {};
    PAGES.forEach(function(slug){
      pageMetaBySlug[slug] = pagesRows.find(function(r){
        return String(r.slug || '').trim().toLowerCase() === slug;
      }) || {};
    });

    let sh = ss.getSheetByName('_CmsExport');
    if (sh) sh.clear();
    else sh = ss.insertSheet('_CmsExport');

    const rows = [['key', 'json']];
    rows.push(['site', JSON.stringify(site)]);
    PAGES.forEach(function(slug){
      rows.push([slug, JSON.stringify(pageMetaBySlug[slug])]);
    });

    sh.getRange(1, 1, rows.length, 2).setValues(rows);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 2).setFontWeight('bold');
    sh.autoResizeColumn(1);

    Logger.log('Wrote ' + rows.length + ' rows to _CmsExport.');
  } finally {
    _setReadCacheBypass_(false);
  }
}
