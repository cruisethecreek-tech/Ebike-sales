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
 *       creek-life  4       Donate             donate.html                                  FALSE
 *       creek-life  5       FAQs               faqs.html                                    FALSE
 *
 *     Shop_Tiles
 *       id          order   label       subtitle                       type    url                external
 *       heybike     1       Heybike     Affordable, easygoing rides    link    heybike.html       FALSE
 *       velotric    2       Velotric    Sleek, premium e-bikes         link    velotric.html      FALSE
 *       jasion      3       Jasion      Trail-ready power              link    jasion.html        FALSE
 *       mooncool    4       Mooncool    Three-wheel comfort            link    mooncool.html      FALSE
 *       apparel     5       Apparel     Tees, caps & ride threads      link    apparel.html       FALSE
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
  const action = String((e && e.parameter && e.parameter.action) || '').trim();

  // Order submission path. Handled BEFORE the CMS read so the response
  // shape stays narrow ({ok, id, error}) instead of dragging the whole
  // CMS payload along.
  if (action === 'apparelOrder') {
    return handleApparelOrder(e.parameter || {});
  }

  const page = ((e && e.parameter && e.parameter.page) || 'home')
                 .toString().trim().toLowerCase();
  const cap  = page.charAt(0).toUpperCase() + page.slice(1);

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Per-page hero/cta/section copy (Pages tab).
  const pages = readSheet(ss, 'Pages');
  const pageMeta = pages.find(function(r){
    return String(r.slug || '').trim().toLowerCase() === page;
  }) || {};

  // Site-wide key/value pairs (SiteConfig tab). Banner rows whose key
  // starts with "──" are visual separators in the Sheet for grouping;
  // they're skipped here so they never enter the live CMS payload.
  const site = {};
  readSheet(ss, 'SiteConfig').forEach(function(r){
    const key = String(r.key || '').trim();
    if (!key || key.indexOf('──') === 0) return;
    site[key] = r.value;
  });
  // Photos tab merges on top of SiteConfig — Pat edits photos there,
  // SiteConfig stays for text-only keys. A non-empty Photos value wins
  // over any duplicate row in SiteConfig.
  readSheet(ss, 'Photos').forEach(function(r){
    if (r.key && r.value !== '' && r.value != null) {
      site[String(r.key).trim()] = r.value;
    }
  });

  // Long-form section rows for this page (Sections tab).
  const sections = readSheet(ss, 'Sections')
    .filter(function(r){
      return String(r.page || '').trim().toLowerCase() === page;
    })
    .sort(function(a, b){ return (a.order || 0) - (b.order || 0); });

  // Site-wide trust strip rendered on every brand page (heybike, velotric,
  // mooncool, jasion). Same four cards across all four — edit once here.
  const trustStrip = readSheet(ss, 'TrustStrip')
    .sort(function(a, b){ return (a.order || 0) - (b.order || 0); });

  // creek-ready hub: the three service cards and the three "Simple as 1-2-3" steps.
  const services = readSheet(ss, 'Services')
    .sort(function(a, b){ return (a.order || 0) - (b.order || 0); });
  const steps = readSheet(ss, 'Steps')
    .sort(function(a, b){ return (a.order || 0) - (b.order || 0); });

  // FAQs page: every Q&A row, grouped client-side by `section`.
  const faqs = readSheet(ss, 'Faqs')
    .sort(function(a, b){ return (a.order || 0) - (b.order || 0); });

  // Bridge the Gap: four content blocks each in their own tab.
  const bridgePricing = readSheet(ss, 'BridgePricing')
    .sort(function(a, b){ return (a.order || 0) - (b.order || 0); });
  const bridgeGaps = readSheet(ss, 'BridgeGaps')
    .sort(function(a, b){ return (a.order || 0) - (b.order || 0); });
  const bridgeFeatures = readSheet(ss, 'BridgeFeatures')
    .sort(function(a, b){ return (a.order || 0) - (b.order || 0); });
  const bridgeCompare = readSheet(ss, 'BridgeCompare')
    .sort(function(a, b){ return (a.order || 0) - (b.order || 0); });
  const bridgeBikeOptions = readSheet(ss, 'BridgeBikeOptions')
    .sort(function(a, b){ return (a.order || 0) - (b.order || 0); });

  // Trailside journeys (page=journeys): one row per destination.
  const journeys = readSheet(ss, 'Journeys')
    .sort(function(a, b){ return (a.order || 0) - (b.order || 0); });

  // Donations page: the Supporters Wall.
  const supporters = readSheet(ss, 'Supporters')
    .sort(function(a, b){ return (a.order || 0) - (b.order || 0); });

  // Rentals page: side-by-side "vibe check" cards (Kirk Road vs Bears Den).
  const rentalsVibe = readSheet(ss, 'RentalsVibe')
    .sort(function(a, b){ return (a.order || 0) - (b.order || 0); });

  // Photo galleries: rows are filtered by `page` and rendered as a simple
  // grid on the matching page (adventures, trailside, etc).
  const galleries = readSheet(ss, 'Galleries')
    .filter(function(r){
      return String(r.page || '').trim().toLowerCase() === page;
    })
    .sort(function(a, b){ return (a.order || 0) - (b.order || 0); });

  // Events page: one row per event, grouped client-side by day.
  const events = readSheet(ss, 'Events');

  // Cross-reference each event's venue against the Venues lookup tab and
  // back-fill lat/lng server-side. Lets the Events tab stay tidy: just type
  // a venue name and the coordinates flow from the Venues table at serve
  // time. A row that has its own lat/lng wins — so per-event overrides
  // still work for one-off locations.
  const venueRows = readSheet(ss, 'Venues');
  const venueLookup = venueRows
    .map(function(v){
      const lat = parseFloat(v.lat);
      const lng = parseFloat(v.lng);
      const match = String(v.venue || '').trim().toLowerCase();
      return (match && !isNaN(lat) && !isNaN(lng)) ? { match: match, lat: lat, lng: lng } : null;
    })
    .filter(Boolean)
    // Longest match-keys first so "L'uva Bella Winery & Bistro" wins over
    // a hypothetical "L'uva Bella" prefix entry.
    .sort(function(a, b){ return b.match.length - a.match.length; });

  events.forEach(function(e){
    const hasLat = e.lat !== '' && e.lat != null && !isNaN(parseFloat(e.lat));
    const hasLng = e.lng !== '' && e.lng != null && !isNaN(parseFloat(e.lng));
    if (hasLat && hasLng) return; // explicit per-event coords win
    const venue = String(e.venue || '').toLowerCase();
    if (!venue) return;
    for (let i = 0; i < venueLookup.length; i++) {
      if (venue.indexOf(venueLookup[i].match) !== -1) {
        if (!hasLat) e.lat = venueLookup[i].lat;
        if (!hasLng) e.lng = venueLookup[i].lng;
        break;
      }
    }
  });

  const data = {
    page:              page,
    pageMeta:          pageMeta,
    site:              site,
    sections:          sections,
    trustStrip:        trustStrip,
    services:          services,
    steps:             steps,
    faqs:              faqs,
    bridgePricing:     bridgePricing,
    bridgeGaps:        bridgeGaps,
    bridgeFeatures:    bridgeFeatures,
    bridgeCompare:     bridgeCompare,
    bridgeBikeOptions: bridgeBikeOptions,
    journeys:          journeys,
    supporters:        supporters,
    rentalsVibe:       rentalsVibe,
    events:            events,
    galleries:         galleries,
    apparelProducts:   readSheet(ss, 'ApparelProducts')
                         .sort(function(a, b){ return (a.order || 0) - (b.order || 0); }),
    apparelColors:     readSheet(ss, 'ApparelColors')
                         .sort(function(a, b){ return (a.order || 0) - (b.order || 0); }),
    apparelPlacements: readSheet(ss, 'ApparelPlacements')
                         .sort(function(a, b){ return (a.order || 0) - (b.order || 0); }),
    accessories:       readSheet(ss, 'Accessories')
                         .sort(function(a, b){ return (a.order || 0) - (b.order || 0); }),
    blog:              readSheet(ss, 'Blog')
                         .filter(function(r){ return r.published === true || r.published === 'TRUE' || r.published === 'true'; })
                         .sort(function(a, b){
                           // Newest first. Treat blank dates as oldest.
                           const ad = a.date ? new Date(a.date).getTime() : 0;
                           const bd = b.date ? new Date(b.date).getTime() : 0;
                           return bd - ad;
                         }),
    tiles:             readSheet(ss, cap + '_Tiles'),
    submenus:          groupBy(readSheet(ss, cap + '_Submenus'), 'tile'),
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

/**
 * Apparel order intake. Called from apparel.html via:
 *   GET .../exec?action=apparelOrder&firstName=...&product=...&...
 *
 * Appends a row to Apparel_Orders and emails salesteam@cruisethecreek.com.
 * Returns JSON {ok:true, id:'AP-1234'} so the front-end can show a
 * confirmation. On any error, still returns JSON so fetch().then() runs —
 * the front-end always shows confirmation either way (matches the bike
 * order flow), but the {ok:false, error} payload is logged.
 */
function handleApparelOrder(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const json = function(obj) {
    return ContentService
      .createTextOutput(JSON.stringify(obj))
      .setMimeType(ContentService.MimeType.JSON);
  };

  try {
    // Required fields. If any missing, still record the row so the data
    // isn't lost — but flag it.
    const now = new Date();
    const id  = 'AP-' + Utilities.formatDate(now, 'America/New_York', 'yyMMdd-HHmmss');
    const row = {
      id:          id,
      timestamp:   now,
      first:       String(p.firstName   || '').trim(),
      last:        String(p.lastName    || '').trim(),
      email:       String(p.email       || '').trim(),
      phone:       String(p.phone       || '').trim(),
      product:     String(p.product     || '').trim(),
      color:       String(p.color       || '').trim(),
      size:        String(p.size        || '').trim(),
      placement:   String(p.placement   || '').trim(),
      qty:         parseInt(p.qty, 10) || 1,
      total:       parseFloat(p.total) || 0,
      comments:    String(p.comments    || '').trim(),
      paymentLink: String(p.paymentLink || '').trim(),
    };

    let sh = ss.getSheetByName('Apparel_Orders');
    if (!sh) {
      sh = ss.insertSheet('Apparel_Orders');
      sh.appendRow(['id','timestamp','first','last','email','phone',
                    'product','color','size','placement','qty','total','comments','paymentLink']);
      sh.getRange(1, 1, 1, 14).setFontWeight('bold');
    }
    sh.appendRow([row.id, row.timestamp, row.first, row.last, row.email, row.phone,
                  row.product, row.color, row.size, row.placement, row.qty, row.total,
                  row.comments, row.paymentLink]);

    // Notify the sales team. Wrapped so a mail failure doesn't sink the
    // whole request — the order still landed in the Sheet.
    try {
      const body = [
        'New apparel order — ' + row.id,
        '',
        'Customer: ' + row.first + ' ' + row.last,
        'Email:    ' + row.email,
        'Phone:    ' + row.phone,
        '',
        'Product:   ' + row.product,
        'Color:     ' + row.color,
        'Size:      ' + row.size,
        'Placement: ' + row.placement,
        'Qty:       ' + row.qty,
        'Total:     $' + row.total.toFixed(2),
        '',
        'Payment link: ' + (row.paymentLink || '(Stripe link generation failed — send manually)'),
        '',
        'Comments:  ' + (row.comments || '(none)'),
        '',
        'Logged at ' + row.timestamp,
      ].join('\n');
      MailApp.sendEmail({
        to:      'salesteam@cruisethecreek.com',
        replyTo: row.email || 'salesteam@cruisethecreek.com',
        subject: 'Apparel order ' + row.id + ' — ' + row.product + ' (' + row.color + ', ' + row.size + ')',
        body:    body,
      });
    } catch (mailErr) {
      console.warn('Apparel order sales-team email failed: ' + mailErr);
    }

    // Customer confirmation. Only send when we have both a valid email AND
    // a Stripe link — without the link there's nothing actionable, and the
    // sales team will follow up by hand.
    if (row.email && row.paymentLink) {
      try {
        const customerBody = [
          'Hi ' + (row.first || 'there') + ',',
          '',
          "Thanks for your Cruise the Creek apparel order. Here's the summary:",
          '',
          '  Product:   ' + row.product,
          '  Color:     ' + row.color,
          '  Size:      ' + row.size,
          '  Placement: ' + row.placement,
          '  Qty:       ' + row.qty,
          '  Total:     $' + row.total.toFixed(2),
          '',
          'Pay securely here:',
          row.paymentLink,
          '',
          "Once your payment clears we'll reach out to confirm pickup or delivery. Reply to this email if you have any questions.",
          '',
          'Order #: ' + row.id,
          '',
          '— Cruise the Creek',
          '   Youngstown, OH',
        ].join('\n');
        MailApp.sendEmail({
          to:      row.email,
          replyTo: 'salesteam@cruisethecreek.com',
          subject: 'Your Cruise the Creek apparel order — pay & confirm (' + row.id + ')',
          body:    customerBody,
        });
      } catch (mailErr) {
        console.warn('Apparel order customer email failed: ' + mailErr);
      }
    }

    return json({ ok: true, id: row.id, paymentLink: row.paymentLink });
  } catch (err) {
    console.error('handleApparelOrder failed: ' + err);
    return json({ ok: false, error: String(err) });
  }
}

/**
 * Two functions are available from the Apps Script editor's function dropdown:
 *
 *   setupSheet()  — DESTRUCTIVE one-time seeder. Clears every tab and
 *                   re-writes header + default seed rows. Use only on a fresh
 *                   sheet. Re-running wipes any edits you've made.
 *
 *   updateSheet() — NON-DESTRUCTIVE sync. Run this when getTabDefs() picks
 *                   up new tabs / columns / SiteConfig keys. Adds them in
 *                   place without touching your existing data. Safe to re-run.
 *
 * Both pull their schema from getTabDefs() — the single source of truth.
 *
 * Edits in the sheet appear on the live site once Google's ~5-min CDN cache
 * expires (open the /exec URL in a browser tab to bust the cache faster).
 */
/**
 * Schema source of truth — used by both setupSheet (full reseed)
 * and updateSheet (additive sync).
 */
function getTabDefs() {
  return {
    '_README': {
      // Documentation-only tab. Lists every other tab and what it
      // controls, so Pat can find what to edit without grepping the
      // schema. Underscore prefix keeps it sorted to the top of any
      // alphabetic listing. updateSheet() creates this on existing
      // sheets — drag it to the leftmost position by hand once for
      // ergonomics.
      //
      // The doGet handler ignores this tab entirely (it's not read
      // back into the CMS payload), so editing it never breaks the
      // site.
      header: ['category','tab','controls','edit when / where it shows'],
      rows: [
        ['── PAGE COPY (text + heroes) ──', '', '', ''],
        ['Page copy',  'Pages',           'Per-page hero (eyebrow / h1 / tagline / photo) and primary CTA buttons.',
                                          'When you want to change the big banner text, hero photo, or main CTA on any page (home, rentals, shop, faqs, etc.). Slug column = filename minus .html.'],
        ['Page copy',  'SiteConfig',      'Cross-cutting + page-scoped text snippets keyed by name (kirk_title, info_phone, etc).',
                                          'Most edits to body text outside heroes happen here. Banner rows starting with "──" are visual separators only.'],
        ['Page copy',  'Sections',        'Long-form content blocks rendered inside a page body.',
                                          'When you need rich sections beyond a hero — e.g. multi-paragraph stories on a single page.'],
        ['Page copy',  'TrustStrip',      'Four trust cards rendered identically on every brand page.',
                                          'Edit one row, every brand page (heybike, velotric, mooncool, jasion) updates.'],

        ['── PHOTOS & GALLERIES ──', '', '', ''],
        ['Photos',     'Photos',          'Body-photo controls (key → URL/filename) for orphan images like the Kirk Road card.',
                                          'For any <img data-cms-src="..."> binding outside a hero. Hero photos live on Pages.hero_photo.'],
        ['Photos',     'Galleries',       'Photo gallery rows shown on the page named in `page` column.',
                                          'When you want to add a photo strip / gallery to a page.'],

        ['── NAVIGATION (tile menus) ──', '', '', ''],
        ['Navigation', 'Home_Tiles',      'The 6 main tiles on the home page.',
                                          'Order/label/subtitle/photo of each home tile.'],
        ['Navigation', 'Home_Submenus',   'Sub-items inside each Home tile menu.',
                                          'When a home tile is type=menu, this drives its dropdown items.'],
        ['Navigation', 'Rentals_Tiles',   'Tiles on rentals.html.', 'Same pattern as Home_Tiles.'],
        ['Navigation', 'Rentals_Submenus','Sub-items in Rentals tile menus.', 'Same pattern as Home_Submenus.'],
        ['Navigation', 'Shop_Tiles',      'Tiles on shop.html.', 'Same pattern as Home_Tiles.'],
        ['Navigation', 'Shop_Submenus',   'Sub-items in Shop tile menus.', 'Same pattern as Home_Submenus.'],

        ['── BRIDGE THE GAP (rent-to-own) ──', '', '', ''],
        ['Bridge',     'BridgePricing',   'Three pricing tiles (weekly / total / monthly).',
                                          'Edit the dollar amounts and labels at the top of bridge-the-gap.html.'],
        ['Bridge',     'BridgeGaps',      '"Gaps" cards (healthcare, food, etc) explaining why mobility matters.',
                                          'Add/remove cards in the WHAT IT MEANS section.'],
        ['Bridge',     'BridgeFeatures',  'Program feature checklist.', 'Add/remove items in the FEATURES section.'],
        ['Bridge',     'BridgeCompare',   'Side-by-side cost comparison rows (us vs rideshare).', 'Edit the comparison table.'],
        ['Bridge',     'BridgeBikeOptions','The bike picks shown in the application form.',
                                          'Add/remove which bikes are eligible for Bridge the Gap.'],

        ['── TRAILSIDE / ADVENTURES ──', '', '', ''],
        ['Trailside',  'Journeys',        'Trailside Journey destinations (south + north stops).',
                                          'Add/remove a stop, change image/distance/duration/dining/highlights.'],
        ['Rentals',    'RentalsVibe',     'Kirk Road vs Bears Den vibe-check side-by-side.',
                                          'Edit the comparison cards on rentals.html.'],

        ['── SERVICES & SUPPORT ──', '', '', ''],
        ['Services',   'Services',        'Creek-Ready service cards (tune-up / assembly / video).',
                                          'Edit price / features / CTA on creek-ready.html.'],
        ['Services',   'Steps',           'Three-step "how it works" rows.',
                                          'Edit any 1-2-3 process explainer (booking flow, etc).'],
        ['Services',   'Faqs',            'FAQ accordions.',
                                          'Add/edit any frequently-asked-question entry.'],

        ['── EVENTS & DONATIONS ──', '', '', ''],
        ['Events',     'Events',          'Event listings on events.html.',
                                          'Add/remove an event. Venue is looked up from the Venues tab.'],
        ['Events',     'Venues',          'Venue lat/lng lookup table referenced by Events.',
                                          'Add a new venue once, reuse across many events.'],
        ['Donations',  'Supporters',      'Names on the donations page wall.',
                                          'Add/remove supporters who chipped in.'],

        ['── APPAREL ──', '', '', ''],
        ['Apparel',    'ApparelProducts', 'One row per print/design (Trail Map Tee, Neon Watercolor, etc).',
                                          'Add a new design, change pricing, restrict colors per product.'],
        ['Apparel',    'ApparelColors',   'Global color palette (Black, Forest Green, Sand, White…).',
                                          'Add a new shirt color (applies to all products unless narrowed).'],
        ['Apparel',    'ApparelPlacements','Print placement options (Front, Back, Sleeve…).',
                                          'Edit the placement chooser on the order form.'],
        ['Apparel',    'Apparel_Orders',  'Submitted orders log (read-only — written by the order form).',
                                          'Browse for fulfillment. Each row also has paymentLink (Stripe URL).'],

        ['── ACCESSORIES (Amazon affiliate picks) ──', '', '', ''],
        ['Accessories','Accessories',     'One row per affiliate pick on accessories.html. Grouped by `category` and optional `subgroup`.',
                                          'Add a new pick: append a row, fill in name/description/url, and bump `order`. The first row in each category supplies the section eyebrow/intro/icon — leave those blank on later rows in the same category.'],

        ['── BLOG ──', '', '', ''],
        ['Blog',       'Blog',            'One row per blog post (slug, title, body_html, hero, etc).',
                                          'Edit a post, mark unpublished, change hero. body_html is the full post.'],

        ['── ADMIN / TOOLING ──', '', '', ''],
        ['Admin',      'Admin',           'Admin panel feature flags + secrets (e.g. salespro password).',
                                          'Rarely touched. Owners only.'],
        ['Admin',      '_README',         'This tab. Read-only documentation.',
                                          'Updated automatically when the schema changes — re-run updateSheet().'],
      ],
    },
    'Home_Tiles': {
      header: ['id','order','label','subtitle','type','url','external','photo'],
      rows: [
        ['adventures', 1, 'Adventures', 'Guided rides & maps',                'link', 'https://adventure-map.pages.dev/v2', true,  ''],
        ['rentals',    2, 'Rentals',    'Day rides, ownership & long term',   'link', 'rentals.html',                        false, ''],
        ['shop',       3, 'Shop',       'Browse bikes & gear',                'link', 'shop.html',                           false, ''],
        ['services',   4, 'Services',   'Tune-ups & creek prep',              'menu', '',                                    false, ''],
        ['test-rides', 5, 'Test Rides', 'Try before you buy',                 'link', 'test-ride.html',                      false, ''],
        ['creek-life', 6, 'Creek Life', 'Stories, events, more',              'menu', '',                                    false, ''],
        ['donate',     7, 'Support',    'Help fuel the ride',                 'link', 'donate.html',                         false, ''],
      ],
    },
    'Home_Submenus': {
      header: ['tile','order','label','url','external'],
      rows: [
        ['services',   1, 'Creek Ready',     'creek-ready.html',    false],
        ['creek-life', 1, 'Creek Life Blog', 'creek-life-blog.html',false],
        ['creek-life', 2, 'Our Story',       'our-story.html',      false],
        ['creek-life', 3, 'Events',          'events.html',         false],
        ['creek-life', 4, 'Donate',          'donate.html',         false],
        ['creek-life', 5, 'FAQs',            'faqs.html',           false],
      ],
    },
    'Rentals_Tiles': {
      header: ['id','order','label','subtitle','type','url','external','badge','photo'],
      rows: [
        ['adventures', 1, 'Adventures',     'Guided rides through Mill Creek Park',     'link', 'adventures.html',           false, '',            ''],
        ['trailside',  2, 'Trailside',      'Pickup at Kirk Road Trailhead, Canfield',  'link', 'trailside.html',            false, '',            ''],
        ['bridge',     3, 'Bridge the Gap', 'Own the bike after 15 bi-weekly payments', 'link', 'bridge-the-gap.html',       false, '',            ''],
        ['long-term',  4, 'Long Term',      'Multi-month plans (coming soon)',          'link', 'long-term-rental.html',     false, 'Coming Soon', ''],
      ],
    },
    'Rentals_Submenus': {
      header: ['tile','order','label','url','external'],
      rows: [],
    },
    'Shop_Tiles': {
      header: ['id','order','label','subtitle','type','url','external','photo'],
      rows: [
        ['heybike',     1, 'Heybike',     'Affordable, easygoing rides', 'link', 'heybike.html',     false, ''],
        ['velotric',    2, 'Velotric',    'Sleek, premium e-bikes',      'link', 'velotric.html',    false, ''],
        ['jasion',      3, 'Jasion',      'Trail-ready power',           'link', 'jasion.html',      false, ''],
        ['mooncool',    4, 'Mooncool',    'Three-wheel comfort',         'link', 'mooncool.html',    false, ''],
        ['apparel',     5, 'Apparel',     'Tees, caps & ride threads',   'link', 'apparel.html',     false, ''],
        ['accessories', 6, 'Accessories', 'Saddles, seat posts & tools', 'link', 'accessories.html', false, ''],
      ],
    },
    'Shop_Submenus': {
      header: ['tile','order','label','url','external'],
      rows: [],
    },
    'Pages': {
      header: ['slug','hero_eyebrow','hero_h1','hero_h1_em','hero_tagline','hero_photo',
               'hero_cta_label','hero_cta_url','hero_cta_external',
               'section_eyebrow','section_title',
               'cta_eyebrow','cta_title','cta_subtitle',
               'cta_btn_primary_label','cta_btn_primary_url','cta_btn_primary_external',
               'cta_btn_secondary_label','cta_btn_secondary_url','cta_btn_secondary_external'],
      rows: [
        ['home',
          'Cruise the Creek',
          'Where the trail',
          'meets the cruise.',
          "Electric bikes, guided adventures, and creek-country gear — all from one Youngstown, Ohio shop.",
          '',
          'Explore Adventures',
          'https://adventure-map.pages.dev/v2',
          true,
          'Where to next',
          'Pick Your Path',
          'Ready to ride?',
          'Plan a guided creek-country adventure.',
          '',
          'Book Now',
          'https://adventure-map.pages.dev/v2',
          true,
          'Book a Test Ride',
          'test-ride.html',
          false,
        ],
        ['shop',
          'The Lineup',
          'Brands we',
          'ride and trust.',
          "Every bike on the floor is one we'd take down the trail ourselves. Pick a brand to see the lineup.",
          '',
          '', '', false,
          'Browse by brand',
          'Our Dealers',
          'Not sure which one?',
          'Take the 60-second bike-finder quiz.',
          '',
          'Start the Quiz',
          'https://www.cruisethecreek.com/tracker',
          true,
          'Book a Test Ride',
          'test-ride.html',
          false,
        ],
        ['our-story',
          'Our Story',
          'Making Lemonade',
          'out of Life.',
          'A lemonade stand for Mill Creek Park — served on two wheels.',
          'glacier-lake.jpg',
          '', '', false,
          '', '',
          'Your turn',
          'Come find your moment of clarity on the trail.',
          '',
          'Explore Adventures',
          'https://adventure-map.pages.dev/v2',
          true,
          'Back Home',
          'home.html',
          false,
        ],
        ['bridge-the-gap',
          'Bridge the Gap · Mahoning Valley',
          'Bridge the Gap',
          'Your path to transportation independence.',
          "$25–$30 a week. Own the bike after 15 bi-weekly payments. No credit checks. No driver's license required.",
          '',
          'Apply Now',
          '#application',
          false,
          '', '',
          'Ready?',
          'Ready to bridge your gap?',
          'Join the Creek Crew and get the independence you deserve. No credit checks. No license. Just reliable transportation.',
          'Start Your Application',
          '#application',
          false,
          '', '',
          false,
        ],
        ['creek-ready',
          "Youngstown's E-Bike Experts",
          'Keep Your Ride',
          'Creek Ready',
          "Specialized E-Bike service. Professional tune-ups, expert assembly, and remote video diagnostics — from the Mahoning Valley's authorized Heybike, Velotric & Jasion dealer.",
          '',
          'Explore Services',
          '#services',
          false,
          '', '',
          '',
          'Not Sure Which Service You Need?',
          "No worries — text us a description or photo of what's going on and we'll point you in the right direction. No pressure, just honest advice.",
          '', '', false,
          '', '', false,
        ],
        ['rentals',
          'Rent an E-Bike',
          'Pick the ride',
          'that fits your day.',
          'From a single afternoon on the trail to long-term ownership — every Cruise the Creek rental option starts here.',
          '',
          '', '', false,
          'Rental options',
          'Pick Your Plan',
          "Not sure which one?",
          "Text our rentals desk and we'll point you the right way.",
          '',
          'Text 330-406-9686',
          'sms:3304069686',
          false,
          'See Service Plans',
          'creek-ready.html',
          false,
        ],
        ['trailside',
          'Kirk Road · Canfield, OH',
          '#Trailside Journey',
          'Journey The Mill Creek MetroParks Bikeway',
          "Pick up your e-bike at the Kirk Road Trailhead in Canfield and explore 11+ miles of wooded trail, lakes, and ponds at your own pace.",
          'kirkroad_edited.jpg',
          'Check Availability',
          'https://www.cruisethecreek.com/book-a-rental',
          true,
          '', '',
          '', '', '',
          '', '', false,
          '', '', false,
        ],
        ['adventures',
          'Bears Den · Mill Creek Park',
          '#Unleash Your Adventure',
          'Mill Creek Park · Youngstown, OH',
          "Adventure awaits! Rent an electric bike at Bears Den / Scholl Pavilion and experience the sights, smells, and sounds of Mill Creek Park in a whole new way.",
          'bears-den.jpg',
          'Book Your Adventure',
          'https://www.cruisethecreek.com/book-a-rental',
          true,
          '', '',
          '', '', '',
          '', '', false,
          '', '', false,
        ],
        ['long-term-rental',
          'Coming Soon',
          'Long Term Rental',
          '',
          "Multi-month plans for riders who need their bike longer than a day — and aren't ready to own.",
          '',
          '', '', false,
          '', '',
          '', '', '',
          '', '', false,
          '', '', false,
        ],
        ['tune-ups',
          '$125 Complete Service',
          'Is Your E-Bike Creek Ready?',
          '',
          "Professional maintenance that keeps you safe, extends your bike's life, and maximizes performance.",
          '',
          'Book Now',
          'https://book.peek.com/s/57e3b62e-4f48-4cc4-8876-7b79f4c11baa/yo7ym',
          true,
          '', '',
          '', '', '',
          '', '', false,
          '', '', false,
        ],
        ['assembly',
          'Creek Ready Setup',
          "Don't Just Buy a Box. Invest in a Machine.",
          '',
          "The Creek Ready Package is master-level calibration designed to ensure your safety and maximize your bike's lifespan in the Mahoning Valley.",
          '',
          'Click Here To Purchase Your Bike',
          'https://www.cruisethecreek.com/shop-fix',
          true,
          '', '',
          '', '', '',
          '', '', false,
          '', '', false,
        ],
        ['video-diagnostics',
          'Remote Support',
          'Get Expert Help from Anywhere',
          '',
          "Stuck on assembly or troubleshooting an error code? Connect with our factory-trained technician on a live video call and get your e-bike rolling — no travel required.",
          '',
          'Schedule Your Session',
          'https://book.peek.com/s/57e3b62e-4f48-4cc4-8876-7b79f4c11baa/dmkOV',
          true,
          '', '',
          '', '', '',
          '', '', false,
          '', '', false,
        ],
        ['safety',
          'Safety & Operations',
          'The Full Story',
          'About E-Bikes',
          "Riding an e-bike opens up cycling to a wider audience than ever before — but a 50-pound bike that sustains 20–28 mph rides differently than the bike you grew up on. Here's how to ride safely, sized right, and confident.",
          '',
          '', '', false,
          '', '',
          '',
          'Questions before you ride?',
          "Reach out — we'll walk you through anything that's still unclear.",
          'Text 330-406-9686',
          'sms:3304069686',
          false,
          'Email Us',
          'mailto:info@cruisethecreek.com',
          false,
        ],
        ['faqs',
          'Frequently Asked Questions',
          'Everything You Need',
          'to Know',
          "Booking, sales, test rides, Bridge the Gap, safety, service, refunds — answers to the questions we hear most. Still stuck? See the Contact section below to text the right desk.",
          '',
          '', '', false,
          '', '',
          'Still have questions?',
          "We'd rather you ask.",
          "Text us, email us, or book a test ride and we'll walk you through anything that's still unclear.",
          'Text 330-406-9682',
          'sms:3304069682',
          false,
          'Email Us',
          'mailto:salesteam@cruisethecreek.com',
          false,
        ],
        ['journeys',
          'Trailside Journey · Kirk Road',
          'Choose a Journey',
          'Unlock miles of scenic trails.',
          'Start at the Kirk Road Trailhead in Canfield. Head south to MetroParks Farms or the Walnut Grove. Head north to Mahoning Ave or the Niles Greenway. Pick the ride that fits your day.',
          '',
          '', '', false,
          '', '',
          'Ready to ride?',
          'Book your Trailside Journey',
          'Pick a ride at the Kirk Road Trailhead. Helmet, eyewear, and a digital map of the bikeway included.',
          'Book Now',
          'https://www.cruisethecreek.com/book-a-rental',
          true,
          'About Trailside',
          'trailside.html',
          false,
        ],
        ['donate',
          'Support the ride',
          'Our Support',
          'Fuels the Ride',
          "Mill Creek is more than just a park — it's where our community comes together to explore and enjoy the outdoors. Help us keep the rides safe, the gear sharp, and the trails open to everyone.",
          '',
          '', '', false,
          '', '',
          '', '', '',
          '', '', false,
          '', '', false,
        ],
        ['events',
          "What's happening",
          'Show Up',
          '& Show Out',
          "Festivals, farmers markets, music, fitness rides — everything happening around Mill Creek Park, downtown Youngstown, and the Mahoning Valley. Filter by what you're into. Ride your e-bike. Show up.",
          '',
          '', '', false,
          '', '',
          'Make it easy',
          'Skip the parking. Ride to the event.',
          'Rent a Cruise the Creek e-bike and roll into downtown Youngstown straight from Mill Creek Park. No tickets, no traffic, no hunting for a spot.',
          '🚲 See Rental Options',
          'rentals.html',
          false,
          'Book a Rental',
          'https://www.cruisethecreek.com/book-a-rental',
          true,
        ],
      ],
    },
    'SiteConfig': {
      header: ['key','value'],
      // Rows are grouped with banner separators (── HEADING ──) so the
      // tab is scannable in the spreadsheet UI. The doGet handler skips
      // any row whose key starts with "──" — they're cosmetic only.
      // To apply this grouping to your existing Sheet without losing
      // edits, run reorganizeSiteConfig() once.
      rows: [
        ['── CONTACT · INFO DESK (rentals / tours / sponsorships) ──', ''],
        ['info_phone_display',  '330-406-9686'],
        ['info_phone_sms',      'sms:3304069686'],
        ['info_phone_tel',      'tel:+13304069686'],
        ['info_email_label',    'info@cruisethecreek.com'],
        ['info_email_url',      'mailto:info@cruisethecreek.com'],

        ['── CONTACT · SALES DESK (sales / test rides / repairs) ──', ''],
        ['sales_phone_display', '330-406-9682'],
        ['sales_phone_sms',     'sms:3304069682'],
        ['sales_phone_tel',     'tel:+13304069682'],
        ['sales_email_label',   'salesteam@cruisethecreek.com'],
        ['sales_email_url',     'mailto:salesteam@cruisethecreek.com'],

        ['── FOOTER (every page) ──', ''],
        ['footer_tagline',      'Electric bikes built for creek country. Ride the trails, beat the heat, get home grinning.'],
        ['footer_copyright',    '© 2026 Cruise the Creek. All rights reserved.'],

        ['── SOCIAL LINKS (leave blank to hide) ──', ''],
        ['social_instagram',    ''],
        ['social_facebook',     ''],
        ['social_tiktok',       ''],
        ['social_youtube',      ''],

        ['── HERO TINT (every page hero photo) ──', ''],
        // 0..1. Lower = brighter photo, higher = darker forest tint.
        ['hero_overlay_opacity', '0.55'],

        ['── BRAND / LOGO LINKS ──', ''],
        ['logo_url',            'home.html'],
        ['logo_external',       false],
        ['shop_ebikes_label',   'Shop E-Bikes'],
        ['shop_ebikes_url',     'https://www.cruisethecreek.com/shop-fix'],
        ['shop_ebikes_external', true],
        ['brand_heybike_url',   'heybike.html'],
        ['brand_heybike_external', false],
        ['brand_velotric_url',  'velotric.html'],
        ['brand_velotric_external', false],
        ['brand_jasion_url',    'jasion.html'],
        ['brand_jasion_external', false],
        // assembly.html: pipe-separated brand list drives inline mentions
        // ("factory-trained on …") + trust badges at page bottom.
        ['assembly_authorized_brands', 'Heybike|Velotric|Jasion|Mooncool'],

        ['── ASSEMBLY page · "Ride with Certainty" pricing cards ──', ''],
        ['assembly_pricing_title',     'Ride with Certainty.'],
        ['assembly_pricing_sub',       "Don't leave your safety to a factory box. Get it Creek Ready."],
        // Card 1 — bundled with new bike purchase from CTC.
        ['assembly_card1_title',       'New Bike Purchase'],
        ['assembly_card1_price',       '$100'],
        ['assembly_card1_sub',         'Add-On with purchase from Cruise the Creek'],
        ['assembly_card1_cta_label',   'Shop E-Bikes'],
        ['assembly_card1_cta_url',     'https://www.cruisethecreek.com/shop-fix'],
        ['assembly_card1_cta_external', true],
        // Card 2 — externally purchased bikes (Stripe checkout).
        ['assembly_card2_title',       'Already Own Your Bike?'],
        ['assembly_card2_price',       '$225'],
        ['assembly_card2_sub',         'For Heybike, Velotric, or Jasion purchased online'],
        ['assembly_card2_cta_label',   'Get Creek Ready'],
        ['assembly_card2_cta_url',     'https://buy.stripe.com/3cIeVe04M3ag7Fxbzf6Zy01'],
        ['assembly_card2_cta_external', true],
        // Footer email link below the pricing cards.
        ['assembly_email_label',       'Questions? Email us →'],
        ['assembly_email_url',         'mailto:salesteam@cruisethecreek.com'],
        // FAQ "What if I already bought my bike online?" answer reuses
        // assembly_card2_price + _cta_url + _cta_external above (same product),
        // so changing the price/URL there updates both spots.
        ['assembly_faq_cta_label',     'Purchase Creek Ready Package'],
        ['assembly_faq_post_payment',  "After payment, we'll contact you within 24 hours to schedule your drop-off."],

        ['── ACCESSORIES page · hero + framing copy ──', ''],
        ['acc_hero_eyebrow',    'Curated picks'],
        ['acc_hero_h1',         'Accessories'],
        ['acc_hero_tagline',    "Saddles, seat posts, tools — gear we'd actually run on our own bikes, hand-picked from Amazon."],
        ['acc_disclosure_title','Amazon Associate disclosure.'],
        ['acc_disclosure_body', 'The links below are affiliate links — if you buy through them, we may earn a small commission at no extra cost to you. We only recommend gear we\'d actually use ourselves.'],
        ['acc_fineprint',       'As an Amazon Associate, Cruise the Creek earns from qualifying purchases. Prices, availability, and product options are set by Amazon and may change without notice.'],
        // Cross-promo block at the bottom — points back to apparel by default.
        ['acc_promo_eyebrow',   'Pair it with the threads'],
        ['acc_promo_title',     'Cruise the Creek apparel'],
        ['acc_promo_sub',       'Tees and ride-ready threads, built and shipped from Youngstown.'],
        ['acc_promo_cta_label', 'Shop apparel'],
        ['acc_promo_cta_url',   'apparel.html'],
        ['acc_promo_cta_external', false],

        ['── FOOTER & POLICY LINKS ──', ''],
        ['faq_url',             'faqs.html'],
        ['faq_external',        false],
        ['policies_url',        'https://www.cruisethecreek.com/cancellation-policy'],
        ['policies_external',   true],
        ['our_story_url',       'our-story.html'],
        ['our_story_external',  false],

        ['── CREEK READY HUB · service URLs ──', ''],
        ['creek_tuneup_url',    'tune-ups.html'],
        ['creek_tuneup_external', false],
        ['creek_setup_url',     'assembly.html'],
        ['creek_setup_external', false],
        ['creek_video_url',     'video-diagnostics.html'],
        ['creek_video_external', false],

        ['── CREEK READY HUB · section copy ──', ''],
        ['services_eyebrow',    'Our Services'],
        ['services_title',      'Three Ways We Keep You Rolling'],
        ['services_intro',      "Whether you need hands-on maintenance, a professional build, or expert guidance from anywhere — we've got you covered."],
        ['how_eyebrow',         'How It Works'],
        ['how_title',           'Simple as 1-2-3'],
        ['how_intro',           "Getting service for your e-bike shouldn't be complicated."],
        ['brands_label',        'Authorized Dealer & Factory-Trained Service'],
        ['cta_text_label',      '💬 Text: 330-406-9682'],
        ['cta_text_url',        'sms:3304069682'],
        ['cta_email_label',     '✉️ salesteam@cruisethecreek.com'],
        ['cta_email_url',       'mailto:salesteam@cruisethecreek.com'],

        ['── SALES PRO · quote card ──', ''],
        ['quote_brand_name',    'CRUISE THE CREEK'],
        ['quote_brand_subline', 'Youngstown, Ohio · cruisethecreek.com'],
        ['quote_footer',        'Quote valid 7 days · Cruise the Creek · 330-406-9682'],

        ['── FAQs page · safety alert banner ──', ''],
        ['faqs_alert_title',    'Your safety is our priority'],
        ['faqs_alert_body',     'Please read the Safety & Requirements section before your first ride. New to e-bikes? We recommend the Kirk Road bikeway for your first time — flat, paved, and car-free.'],

        ['── BRIDGE THE GAP page · section labels ──', ''],
        ['bridge_gaps_eyebrow',       'Why it matters'],
        ['bridge_gaps_title',         'What it means to bridge the gap'],
        ['bridge_gaps_intro',         "Most riders use the bike to get to work — but transportation is more than a paycheck. In the Mahoning Valley, \"the gap\" is the distance between you and the essentials of a good life. Here are four ways an e-bike closes it."],
        ['bridge_features_eyebrow',   'What you get'],
        ['bridge_features_title',     'Main features'],
        ['bridge_features_intro',     'A reliable bike, set up to last Ohio winters, with no surprise costs and a clear path to ownership.'],
        ['bridge_compare_eyebrow',    'The math'],
        ['bridge_compare_title',      'The "Gap" savings comparison'],
        ['bridge_compare_intro',      'Same commute, very different cost.'],
        ['bridge_application_title',  'Start your application'],
        ['bridge_application_subtitle', "Pick a bike style, fill out the form, and we'll be in touch within 24–48 hours."],

        ['── TRAILSIDE JOURNEY page · Kirk Road card + headings ──', ''],
        // kirk_image is now editable in the Photos tab too — either place
        // works, but Photos is the recommended home for image controls.
        ['kirk_image',          ''],
        ['kirk_badge',          'Pickup & Drop-off'],
        ['kirk_title',          'Kirk Road Trailhead'],
        ['kirk_where',          'Canfield, Ohio'],
        ['kirk_body_1',         'This award-winning trailhead provides a fifty-car parking lot, restrooms, water fountains, a picnic pavilion, and a location for educational and trailside activities.'],
        ['kirk_body_2',         'The 11-mile Mill Creek Bikeway is owned and operated by Mill Creek MetroParks — paved and tranquil end to end.'],
        ['kirk_speed',          '15 mph speed limit strictly enforced'],
        ['south_eyebrow',       'Head south'],
        ['south_title',         'Toward Canfield'],
        ['south_intro',         'Wooded paths, working farms, and a hidden playground — gentle southbound rides for any pace.'],
        ['north_eyebrow',       'Head north'],
        ['north_title',         'Toward Austintown & Niles'],
        ['north_intro',         'Iconic overpass bridges, the Niles Greenway, and the McKinley Memorial — push north for a longer ride.'],
        ['hashtag',             '#TrailsideJourney'],

        ['── RENTALS page · vibe-check section ──', ''],
        ['vibe_eyebrow',        'Vibe check'],
        ['vibe_title',          'Which ride is right for you?'],
        ['vibe_intro',          "New to Mill Creek? Here's the quick guide to picking the right pickup."],

        ['── DONATIONS page · why-we-need-you ──', ''],
        ['intro_eyebrow',       'Why we need you'],
        ['intro_title',         'Be a direct part of our growth'],
        ['intro_body',          "To keep providing the high-quality equipment and experiences you've come to expect, we're inviting you to be a direct part of our growth. The future of our local trails is bright, and with your help, we can make the next season our best one yet."],
        ['impact_eyebrow',      'Your impact'],
        ['impact_title',        'Where every dollar goes'],
        ['impact_body',         "Every donation goes directly toward upgrading our fleet and maintaining the essential gear that keeps our operations safe and fun for everyone. This isn't about overhead — it's about ensuring we have the best tools available to serve you."],
        ['thanks_eyebrow',      'Our appreciation'],
        ['thanks_title',        'Thank you, in public'],
        ['thanks_body',         "As a thank you for your support, all donors will be featured on our Supporters Wall below. It's our way of making sure the community knows who helped keep us moving forward."],

        ['── DONATIONS page · payment links ──', ''],
        ['give_eyebrow',        'Send a tip'],
        ['give_title',          'Pick the way that works for you'],
        ['give_sub',            'Three options. Any amount helps. We see every transfer.'],
        ['give_foot',           "After you send, drop us a note with how you'd like to appear on the Supporters Wall — first name, full name, business, or anonymous, your call."],
        ['donate_cashapp_url',  'https://cash.app/$ctcsales'],
        ['donate_cashapp_handle', '$ctcsales'],
        ['donate_venmo_url',    'https://account.venmo.com/u/cruisethecreeksales'],
        ['donate_venmo_handle', '@cruisethecreeksales'],
        ['donate_paypal_url',   'https://www.paypal.biz/cruisethecreek'],
        ['donate_paypal_handle', 'paypal.biz/cruisethecreek'],

        ['── DONATIONS page · supporters wall heading ──', ''],
        ['wall_eyebrow',        'The supporters wall'],
        ['wall_title',          'Thank you, Creek Crew'],
        ['wall_sub',            'The names below kept the wheels turning this season.'],
      ],
    },
    'Photos': {
      // Friendly home for image controls that don't fit elsewhere. Each
      // row's `value` is merged into the `site` object on top of the
      // matching SiteConfig key — so the front-end binding
      // `data-cms-src="kirk_image"` reads from here automatically.
      //
      // `key`      = matches the site config key the page binds to
      //              (e.g., kirk_image). Don't change this — it's how
      //              the page finds the photo.
      // `page`     = which HTML file the photo appears on (helps you
      //              find rows when the list grows).
      // `location` = friendly description of where on the page.
      // `value`    = filename in /media/ (e.g. kirk-road-trailhead.jpg)
      //              OR full https:// URL. Leave blank for no photo.
      // `notes`    = freeform — recommended dimensions, source, etc.
      //
      // Hero photos already live on the Pages tab (column hero_photo)
      // because they're cleanly per-page; they don't need to be here.
      header: ['key','page','location','value','notes'],
      rows: [
        ['kirk_image', 'journeys.html', 'Kirk Road Trailhead card (top of Trailside Journey page)', '',
          'Filename in /media/ or full https:// URL. Recommended: 1200×800 landscape JPG.'],
      ],
    },
    'Services': {
      // creek-ready service cards. `theme` controls the gradient
      // (tuneup | assembly | video). `features` is a pipe-separated
      // list of bullet items.
      header: ['order','theme','price','badge','icon','title','desc','features','cta_label','cta_url','cta_external'],
      rows: [
        [1, 'tuneup',   '$125',         'All Brands', '🔧', 'Creek Ready Tune-Up',
          'Our comprehensive "Creek Ready" maintenance service for ANY brand of e-bike. We catch problems before they become expensive failures.',
          'Premium deep clean & rust prevention|Derailleur, brake & bearing adjustment|Motor performance & controller diagnostics|Battery health assessment|Full safety inspection & professional test ride',
          'Learn More', 'tune-ups.html', false],
        [2, 'assembly', '$100',         'New Bikes',  '📦', 'Creek Ready Setup',
          "Don't risk a DIY build. Our master assembly by Andrew Barret ensures your new e-bike is built right the first time — with the CTC Care Standard.",
          "50-point safety certification|Andrew Barret's master assembly|Ohio Rust-Belt Shield corrosion treatment|Free 30-day break-in tune included|Manufacturer liaison for warranty support",
          'Learn More', 'assembly.html', false],
        [3, 'video',    'Book Online',  '',           '📹', 'Video Diagnostics',
          'Stuck on assembly or seeing an error code? Connect with our factory-trained technician via live video call — expert help from wherever you are.',
          '1-on-1 live video with our technician|Error code diagnosis & troubleshooting|Guided assembly support|Velotric, Heybike & Jasion specialists|No travel needed — help from anywhere',
          'Learn More', 'video-diagnostics.html', false],
      ],
    },
    'Steps': {
      // creek-ready "Simple as 1-2-3" steps.
      header: ['order','num','title','body'],
      rows: [
        [1, '1', 'Reach Out',
          "Text Dru at 330-406-9682 or book online. Tell us what's going on with your ride."],
        [2, '2', 'We Diagnose',
          'Drop off on Kirk Road, visit the showroom, or hop on a video call — whatever works best.'],
        [3, '3', 'Ride Happy',
          'Pick up your Creek Ready e-bike, fully serviced and tested. Most tune-ups done in 2-3 business days.'],
      ],
    },
    'Faqs': {
      // FAQs page. Group rows by `section` (preserves order of first
      // appearance). `anchor` is the URL hash for the section's tab — if
      // blank, the renderer slugifies the section name. Inside `answer`
      // you can use **bold**, *italic*, [link text](url), -- (em-dash),
      // double-newline for paragraph break, and "- bullet" lines for lists.
      header: ['order','section','anchor','question','answer'],
      rows: [
        // ── Booking ──
        [10, 'Booking', 'booking', 'How do I book a rental?',
          "Book online through our reservation system — pick a pickup location (Bears Den / Scholl Pavilion or Kirk Road Trailhead), choose how many bikes and a time block, and you're done in under a minute. You'll get a confirmation email with waiver forms and pickup details.\n\nPrefer the human touch? **Text our rentals desk at 330-406-9686** and we'll book it for you."],
        [11, 'Booking', '', 'How far in advance should I book?',
          "Weekends and warm-weather afternoons fill up — book at least **2–3 days ahead** for weekends, longer for holidays. Weekday mornings often have same-day availability. If you're flexible, message us and we'll fit you in."],
        [12, 'Booking', '', 'Can I book for a group?',
          "Yes. Our fleet has **11 e-bikes** total — 4 all-purpose, 1 high-step, 2 cruisers, 2 cargo, and 2 e-trikes — so larger groups should reach out directly so we can confirm availability and the right mix of bikes for your party. Birthday rides, family reunions, and corporate outings all welcome."],
        [13, 'Booking', '', 'Do I need to create an account?',
          "No account needed. Just an email so we can send your confirmation, waiver, and pickup instructions."],
        [14, 'Booking', '', 'What happens after I book?',
          "You'll get an email with:\n\n- Pickup location, date, and time\n- Waiver forms to sign before you arrive (saves time at pickup)\n- Contact details if anything changes\n- Helpful info about safety, gear, and what to expect\n\nShow up about 10 minutes early so we can fit your bike, adjust the seat and bars, and walk you through the controls."],

        // ── Test Rides ──
        [20, 'Test Rides', 'test-rides', 'Can I try a bike before I buy?',
          "**Absolutely.** We encourage test rides — it's the best way to find the right fit. We don't carry every model on the floor, but we have enough variety in our fleet to give you a feel for what to look for: throttle vs. pedal-assist, frame style, motor power, and seating position."],
        [21, 'Test Rides', '', 'How do I schedule a test ride?',
          "Use the \"Test Ride\" booking link on the home page, or text our sales team directly at **330-406-9682**. We'll get you on the calendar."],
        [22, 'Test Rides', '', 'Where should I do my first test ride?',
          "If it's your **first time on an e-bike**, we strongly recommend the **Kirk Road location**. The Mill Creek MetroParks Bikeway is flat, paved, and car-free — the perfect environment for a safe and easy first ride.\n\nIf you're an experienced rider and want to feel a bike on real terrain, we can set you up at Bears Den / Scholl Pavilion in Mill Creek Park to test it on the climbs."],
        [23, 'Test Rides', '', 'How long is a test ride?',
          "Long enough to make a real decision — typically 20–30 minutes. We're not on a stopwatch. If you want longer, ask."],
        [24, 'Test Rides', '', 'Is there a fee for a test ride?',
          "Test rides are **free**. No deposit, no commitment."],

        // ── Tours & Rentals ──
        [30, 'Tours & Rentals', 'tours', 'What rental options are available?',
          "Three flavors today, with a fourth on the way:\n\n- **Adventures** — pickup at Bears Den / Scholl Pavilion, in the heart of Mill Creek Park (4,400 acres of wooded trails, lakes, and historic landmarks).\n- **Trailside** — pickup at the Kirk Road Trailhead in Canfield, with 11+ miles of the Mill Creek MetroParks Bikeway out and back.\n- **Bridge the Gap** — our rent-to-own program (more in its own section below).\n- **Long Term** — multi-month plans for riders who need a bike longer than a day but aren't ready to own. Coming soon."],
        [31, 'Tours & Rentals', '', "What's the difference between Adventures and Trailside?",
          "**Adventures (Bears Den):** guided rides through Mill Creek Park's hidden corners — the Lily Pond loops, Lanterman's Mill, the covered bridge. Hilly, wooded, scenic. Great for explorers.\n\n**Trailside (Kirk Road):** flat, smooth, paved bikeway out and back. Family-friendly, easy on every skill level, plenty of rest stops, scenic without the climbs. Great for first-timers and casual cruises."],
        [32, 'Tours & Rentals', '', 'How long are typical rentals?',
          "Rentals are timed in flexible blocks. Whether you want a 90-minute family ride or a longer afternoon, both pickup locations have loops for your pace."],
        [33, 'Tours & Rentals', '', "What's included with a rental?",
          "Every rental includes:\n\n- A properly fitted e-bike (sized to you)\n- A properly fitted helmet\n- Eyewear (sport-style glasses)\n- A walkthrough of the bike, controls, and safety basics\n- A digital map of the local rides"],
        [34, 'Tours & Rentals', '', 'Can I bring my own helmet?',
          "Of course — bring your own helmet, glasses, gloves, padded shorts, anything you ride with already. We provide the basics free with every rental for everyone else."],
        [35, 'Tours & Rentals', '', 'What if I want to rent for longer than a day?',
          "Our **Long Term Rental** program (coming soon) covers multi-month plans for riders who need their bike longer than a day but aren't ready to own. In the meantime, look at **Bridge the Gap** below — it might be exactly what you're after."],
        [36, 'Tours & Rentals', '', 'Do you offer guided tours?',
          "The Adventures pickup at Bears Den puts you in the heart of Mill Creek Park, and we'll point you to the loops that match your group's pace and skill level. Custom guided experiences for groups, birthdays, and corporate outings can be arranged — text us to plan."],

        // ── Sales ──
        [40, 'Sales', 'sales', 'What brands do you sell?',
          "We carry a deliberate mix of brands that complement each other and serve the diverse needs of the community:\n\n- **Heybike** — part of our original fleet since 2022, and nearly three quarters of our rentals. We've used them for years and stand behind their quality.\n- **Velotric** — less \"fat-tire,\" more traditional cycling feel. Perfect for riders transitioning into e-bikes who want a familiar ride.\n- **Jasion** — budget-friendly without sacrificing performance. Strong value for the price.\n- **Mooncool** — three-wheel e-trikes for riders who want extra stability."],
        [41, 'Sales', '', 'How much do e-bikes cost?',
          "Our current lineup ranges from **about $650 (Jasion)** to **about $2,400 (Velotric)**. Most riders land somewhere in the $900–$1,500 range depending on motor power, range, and frame style. Prices subject to change — see the brand pages for the current lineup."],
        [42, 'Sales', '', 'Do you assemble the bike for me?',
          "Yes. Every new e-bike we sell goes through our **Creek Ready Setup** ($100) — Andrew Barret's master assembly, 50-point safety check, Ohio Rust-Belt corrosion treatment, and a free 30-day break-in tune. Don't risk a DIY build on a 50-pound machine that sustains 28 mph."],
        [43, 'Sales', '', 'Do you deliver?',
          "Local delivery is available in the tri-county area for an affordable flat fee. Contact us for a quote based on distance."],
        [44, 'Sales', '', "What's included with a new bike purchase?",
          "Manufacturer warranty, our Creek Ready Setup (if added), a 30-day break-in tune-up, our manufacturer-liaison support for any warranty issues, and the trust of buying from an authorized dealer who actually rides these bikes."],
        [45, 'Sales', '', 'Do you take trade-ins?',
          "Talk to us — we evaluate trade-ins case by case based on brand, condition, and current demand. Text photos and the model to **330-406-9682** for a quote."],

        // ── Bridge the Gap ──
        [50, 'Bridge the Gap', 'bridge-the-gap', 'What is Bridge the Gap?',
          "Our **rent-to-own program** for the Mahoning Valley. It's designed to make e-bike technology — which is a real investment — accessible to more residents by offering a flexible way to pay over time while you're already using and enjoying the bike."],
        [51, 'Bridge the Gap', '', 'How does the program work?',
          "Simple terms:\n\n- **$25–$30 per week** in bi-weekly payments\n- **15 bi-weekly payments** total — then the bike is yours\n- **No credit checks**\n- **No driver's license required**\n- You're riding the bike the whole time you're paying"],
        [52, 'Bridge the Gap', '', 'Who qualifies?',
          "Bridge the Gap is built for residents who need reliable transportation but face barriers with traditional financing. Anyone of legal age can apply. Text our rentals desk at **330-406-9686** or visit the Bridge the Gap page to start an application."],
        [53, 'Bridge the Gap', '', 'What if I want to stop early?',
          "Reach out — we'll work with you. Life happens, and we'd rather have an honest conversation than make this complicated."],
        [54, 'Bridge the Gap', '', 'How do I apply?',
          "Visit the [Bridge the Gap page](bridge-the-gap.html) and tap \"Apply Now\" — or text the rentals desk at **330-406-9686** and we'll walk you through it."],

        // ── Safety ──
        [60, 'Safety', 'safety', 'How old do you have to be to ride?',
          "**Ages 14–15:** Class 1 & 2 only. Height + maturity check, parent/guardian-signed waiver, helmet required.\n\n**Ages 16–17:** All classes (incl. Class 3) with a parent/guardian-signed waiver.\n\n**Ages 18+:** All classes with a signed waiver.\n\nAll minors must have a waiver signed by a parent or legal guardian and **cannot rent or ride without a guardian present**."],
        [61, 'Safety', '', "What's the weight limit?",
          "**300 lbs** is the rider weight limit for maximum range, performance, and safety. Above that, we may not have a bike rated for you."],
        [62, 'Safety', '', 'Do I have to wear a helmet?',
          "Helmets are **strongly recommended for every Cruise the Creek rider**, regardless of age or experience. A properly fitted helmet is included free with every rental. Ohio law does not mandate helmets for adults, but we do — these are 50-pound machines that sustain 20–28 mph."],
        [63, 'Safety', '', 'Are e-bikes hard to ride?',
          "Not at all. If you can ride a regular bike, you can ride an e-bike. Pedal-assist makes hills feel flat and long distances feel short. Our staff gives you a full tutorial before you head out.\n\nIf we don't feel confident in your readiness during the tutorial, we'll cancel the rental and offer a **full refund**. Guest safety is non-negotiable — we reserve the right to refuse rental to anyone we feel is unfit to ride an e-bike."],
        [64, 'Safety', '', 'What if I crash or get hurt?',
          "Stop riding, get yourself to safety, and call our rentals desk at **330-406-9686**. If it's an emergency, call 911 first. We'll come to you. The waiver you signed at booking covers the rental terms; rider safety always comes first."],
        [65, 'Safety', '', 'What if the bike breaks down on the trail?',
          "Call or text the rentals desk at **330-406-9686**. We'll send a tech to either fix the issue on the spot (e.g. a flat tire) or bring you back to the shop. Then we'll either swap you onto another bike to finish your ride, or revise your rental charge to the time you actually used."],

        // ── Service ──
        [70, 'Service', 'service', "Do you service bikes you didn't sell?",
          "Yes. The **Creek Ready Tune-Up** is for ANY brand of e-bike. If it has a battery and a motor, we'll service it."],
        [71, 'Service', '', 'How much is a tune-up?',
          "**$125** for the comprehensive Creek Ready Tune-Up. That covers a premium deep clean and rust prevention, derailleur and brake and bearing adjustment, motor performance and controller diagnostics, battery health assessment, and a full safety inspection with a professional test ride. [Service details →](tune-ups.html)"],
        [72, 'Service', '', 'How long does a tune-up take?',
          "Most tune-ups are done in **2–3 business days**. Heavier work or special-order parts can extend the timeline — we'll tell you up front."],
        [73, 'Service', '', "What is \"Creek Ready Setup\"?",
          "Our master-level new-bike build — **$100**, performed by Andrew Barret. Includes 50-point safety certification, Ohio Rust-Belt Shield corrosion treatment, a free 30-day break-in tune, and manufacturer-liaison support for any warranty issues. Don't risk a DIY build on a machine this heavy and this fast. [Setup details →](assembly.html)"],
        [74, 'Service', '', 'Do you offer remote support?',
          "Yes — **Video Diagnostics**. Stuck on assembly or seeing an error code? Book a live video call with our factory-trained technician. 1-on-1, error-code troubleshooting, guided assembly support — Velotric, Heybike, and Jasion specialists, no travel needed. [Book a session →](video-diagnostics.html)"],
        [75, 'Service', '', 'What about warranty work?',
          "As an authorized dealer for Heybike, Velotric, Jasion, and Mooncool, we handle warranty claims directly with the manufacturer. Bring the bike (and proof of purchase) to the shop and we'll get the conversation started."],

        // ── Policies ──
        [80, 'Policies', 'policies', "What's your cancellation policy on rentals?",
          "Cancel or reschedule with at least **24 hours' notice** for a full refund. Inside 24 hours we may not be able to refund the full amount, but we'll always work with you on weather, illness, or genuine emergencies. Just text the rentals desk as soon as you know — **330-406-9686**.\n\nFull policy: [cruisethecreek.com/cancellation-policy](https://www.cruisethecreek.com/cancellation-policy)"],
        [81, 'Policies', '', 'What if the weather is bad?',
          "If we cancel for weather, you get a full refund or a free reschedule — your call. Light rain isn't usually a reason to cancel; lightning, severe storms, ice, or unsafe trail conditions are. We'll reach out the morning of if it looks dicey."],
        [82, 'Policies', '', 'Can I get a refund on a tune-up?',
          "Once work has begun, parts and labor are non-refundable. If we haven't started, you can cancel any time. If you're not happy with the work, talk to us — we stand behind every tune-up and will make it right."],
        [83, 'Policies', '', 'Do you accept returns on a new bike purchase?',
          "Reach out before you buy if you're unsure — that's why test rides exist. Once a bike has been ridden outside the shop, we treat it as used and any return is handled case-by-case. We'd much rather you take a longer test ride than end up with a bike you don't love."],
        [84, 'Policies', '', 'What if my bike has a warranty issue?',
          "That's separate from a \"return\" — bring the bike in (or text photos and a description) and we'll handle the warranty claim with the manufacturer on your behalf. Authorized dealer means we cut out the back-and-forth."],
        [85, 'Policies', '', 'What if I damage the rental bike?',
          "Normal wear is on us. Rider negligence — collision, drop damage, missing parts — is on you, per the waiver you signed at booking. We'll assess any damage when you return the bike and let you know if there's a charge before billing anything. We don't surprise people with fees."],

        // ── Contact ──
        [90, 'Contact', 'contact', 'Which department do I text?',
          "We run two main desks. Pick the one that matches what you need.\n\n**Info — Rentals, Tours, Sponsorships**\n\n- Text: **330-406-9686**\n- Email: [info@cruisethecreek.com](mailto:info@cruisethecreek.com)\n\n**Sales — Test Rides, Repairs**\n\n- Text: **330-406-9682**\n- Email: [salesteam@cruisethecreek.com](mailto:salesteam@cruisethecreek.com)\n\nText is faster than email or a call — we usually answer within an hour during the day."],
        [91, 'Contact', '', 'Where are you located?',
          "**6685 Kirk Rd, Canfield, OH 44406** — right across from Mill Creek MetroParks. Pickup locations for rentals are at Bears Den / Scholl Pavilion (in the park) or the Kirk Road Trailhead (on the bikeway)."],
        [92, 'Contact', '', 'What are your hours?',
          "Hours vary seasonally and we book by appointment. Text or email to confirm a slot — we'd rather give you our full attention than have you show up to a closed shop."],
        [93, 'Contact', '', 'Can I just stop by?',
          "Best to text first so we know you're coming. Walk-ins are welcome when the showroom is staffed, but we're often out on rentals or service appointments — a heads-up means you'll definitely catch us."],
      ],
    },
    'BridgePricing': {
      // Bridge the Gap: top 3-card price strip.
      // `range` is the smaller text shown after the main amount (e.g. "–$30").
      header: ['order','label','amount','range','detail'],
      rows: [
        [1, 'Weekly Payment', '$25',  '–$30',  "Per week, every week — that's it."],
        [2, 'Total Program',  '$750', '–$900', '15 bi-weekly payments and the bike is yours.'],
        [3, 'Monthly Cost',   '$100', '–$120', 'vs. $400–$600/mo on rideshare.'],
      ],
    },
    'BridgeGaps': {
      // Bridge the Gap: 4 "gap" cards. The optional highlight_* fields
      // render an extra accent block at the bottom of the card (used
      // on the Financial Gap card today). Leave blank to omit.
      header: ['order','icon','title','desc','highlight_title','highlight_text'],
      rows: [
        [1, '🏥', 'The Healthcare Gap',
          "Missing a doctor's appointment because your ride fell through shouldn't happen. An e-bike gets you to local clinics and pharmacies on your schedule — no bus timing, no surge pricing.",
          '', ''],
        [2, '🛒', 'The Food Security Gap',
          "Youngstown has many \"food deserts\" where a grocery store is miles away. Our bikes — fitted with rear racks and panniers — let you carry a week's worth of fresh food home in minutes.",
          '', ''],
        [3, '🎓', 'The Opportunity Gap',
          "Whether it's evening classes at YSU or trade school training, your future shouldn't depend on when the WRTA stops running. An e-bike gives you 24/7 access to education on your own schedule.",
          '', ''],
        [4, '📉', 'The Financial Gap',
          'Even with a car, gas, insurance, and repairs can lock you into a cycle of debt. Replacing a second car with an e-bike can save hundreds a month.',
          'The math',
          '$30/week is fixed and leads to ownership — no surprise $500 repair bills.'],
      ],
    },
    'BridgeFeatures': {
      // Bridge the Gap: the "Main features" checklist (the ✓ items).
      header: ['order','title','desc'],
      rows: [
        [1, 'Path to Full Ownership',
          'After 15 bi-weekly payments the bike is yours to keep — permanent transportation independence.'],
        [2, 'Equity-Building "Layaway"',
          "Every payment counts toward the bike's price while you ride it to work every day."],
        [3, 'Creek Ready Certified',
          '50-point safety inspection plus a professional master calibration of the motor and drivetrain before you take it home.'],
        [4, 'Rust Belt Shield',
          'Specialized corrosion inhibitor on every bike to resist Ohio road salt and grime.'],
        [5, 'No Credit Checks or License Needed',
          "Transportation is a right, not a privilege. No credit score and no driver's license required."],
        [6, 'Low-Cost Commuting',
          '$25–$30 a week saves you hundreds a month vs. daily Uber or Lyft.'],
        [7, 'Direct Local Support',
          'No big corporate help desk. Direct access to Cruise the Creek for maintenance and repairs.'],
      ],
    },
    'BridgeCompare': {
      // Bridge the Gap: the cost-comparison table rows.
      // own_status: 'no' | 'maybe' | 'yes' — picks the badge color.
      // highlight: TRUE makes the row visually accented (use for the
      // Bridge the Gap row).
      header: ['order','method','monthly','yearly','own_status','own_label','highlight'],
      rows: [
        [1, 'Uber / Lyft (round trip)',           '$400–$600', '$4,800+', 'no',    'No',                  false],
        [2, 'Used Car (payment + ins + gas)',     '$350–$500', '$4,200+', 'maybe', 'Eventually',          false],
        [3, 'Bridge the Gap E-Bike',              '$100–$120', '$1,200',  'yes',   'Yes — 30 weeks',      true],
      ],
    },
    'BridgeBikeOptions': {
      // Bridge the Gap: the bike-style picker on the application form.
      //   id              — slug submitted as bike_selection (e.g. "step-over")
      //   image           — full URL to the bike photo
      //   name            — short heading on the card (e.g. "Step-Over")
      //   range           — secondary line (e.g. "Best for 1–12 mi (one way)")
      //   price + period  — large price on the card (e.g. "$50" + " /biweekly")
      //   selection_label — label shown after the rider picks (e.g. "Step-Over Style (1–12 mi)")
      //   selection_price — price shown next to it (e.g. "$50/Biweekly")
      header: ['order','id','image','name','range','price','period','selection_label','selection_price'],
      rows: [
        [1, 'step-over',
          'https://static.wixstatic.com/media/7e576d_893b4902c6f14884b09276918eec5a83~mv2.jpg',
          'Step-Over',    'Best for 1–12 mi (one way)', '$50', ' /biweekly',
          'Step-Over Style (1–12 mi)',  '$50/Biweekly'],
        [2, 'step-thru',
          'https://static.wixstatic.com/media/56427e_9a3de1eb837841cb9ab23814a95642b6~mv2.jpg',
          'Step-Thru',    'Best for 1–20 mi (one way)', '$55', ' /biweekly',
          'Step-Thru Style (1–20 mi)',  '$55/Biweekly'],
        [3, 'city-cruiser',
          'https://static.wixstatic.com/media/56427e_589102c83d184885b095fc64688ef4b0~mv2.jpg',
          'City Cruiser', 'Best for 1–25 mi (one way)', '$60', ' /biweekly',
          'City Cruiser (1–25 mi)',     '$60/Biweekly'],
      ],
    },
    'Journeys': {
      // Trailside Journey destinations rendered on journeys.html.
      // direction: 'south' or 'north'  (controls which grid the card lands in)
      // dining / highlights: pipe-separated lists ("Spot 1|Spot 2|Spot 3")
      // image: per-row visual. Accepts:
      //   • Image filename in /media/ (e.g. "kirk-road.jpg") or a full URL
      //   • Video filename in /media/ ending in .mp4/.webm/.mov/.ogv —
      //     renders as autoplay-muted-loop (silent immersive, like a GIF)
      //   • YouTube URL (https://youtube.com/watch?v=… or youtu.be/…)
      //   • Vimeo URL (https://vimeo.com/…)
      //   The renderer picks the right element automatically. Leave blank
      //   to fall back to the destination name on a tan gradient.
      // distance: short label like "9 miles round trip"
      // duration: short label like "approx 40 minutes"
      // intersections: number or short string (optional)
      // headline: small uppercase line above the destination name (optional,
      //           e.g. "Head Further South!")
      header: ['order','direction','headline','destination','location','distance','duration','intersections','description','dining','highlights','website_url','image'],
      rows: [
        // ── South ──
        [10, 'south', 'Head south first',
          'MetroParks Farms', 'Canfield, OH',
          '9 miles round trip', 'approx 40 minutes', '',
          "Open seasonally, this 402-acre working farm promotes agriculture through educational programming, tours, and display areas. Beginning in the 1910s, the property served as the Mahoning County Experimental Farm — Ohio State University managed it until 1990, researching planting, livestock production, and pest management.",
          "AngeNetta's Cafe|Jr Grinders|Stonefruit Coffee Company",
          "Archery Range|Disc Golf Course|Adventure Barn (seasonal)|Sunflower Field|Across the street: Canfield Fairgrounds|Along the way: Canfield High School",
          'https://www.millcreekmetroparks.org/places/farm/',
          ''],
        [20, 'south', 'Head further south',
          'The Walnut Grove', 'Canfield, OH',
          '12 miles round trip', 'approx 48 minutes', '',
          "A hidden playground in the woods. Open dawn 'til dusk — the perfect turnaround if you want a longer southbound ride than the Farms.",
          "Jr Grinders|AngeNetta's Cafe|Stonefruit Coffee Company",
          "Canfield High School|Mill Creek Farms|Mill Creek Disc Golf|Open dawn 'til dusk",
          'https://www.millcreekmetroparks.org/',
          ''],

        // ── North ──
        [30, 'north', 'Head north first',
          'Mahoning Avenue Trailhead', 'Austintown, OH',
          '5 miles round trip', 'approx 24 minutes', '10',
          "A short, scenic ride north of Kirk Road. The trail crosses the iconic overpass bridge over Mahoning Avenue — a great photo stop and a favorite for families.",
          "Molnar's Concessions|Paladin Brewing",
          "Beautiful trail|Iconic overpass bridge|Family-friendly distance",
          'https://www.millcreekmetroparks.org/place/mill-creek-bikeway/',
          ''],
        [40, 'north', 'Head further north',
          'Niles Greenway · Central Park Trailhead', 'Niles, OH',
          '18 miles round trip', '72+ minutes', '40',
          "The Niles Greenway is a paved, multi-use path running north–south between the county line and the town of Niles. Wooded sections, light industrial estates, and suburban backyards. From the trail's southern end at County Line Road, you can continue south along the MetroParks Bikeway for a seamless ride. Easy access to downtown Niles and Meander Creek Reservoir.",
          "Dairy Queen|Stoneyard Grill|Cadence Coffee House|Niles Sons of Italy|Subway",
          "Niles Greenway bridge|McKinley Memorial|Beautiful wooded trail|Connects to MetroParks Bikeway",
          'https://www.traillink.com/trail/niles-greenway/',
          ''],
      ],
    },
    'Supporters': {
      // Donor "Supporters Wall" on donate.html.
      // level (optional): 'gold' | 'silver' | 'bronze' | '' — picks the
      //                   side accent on the card. Leave blank for a plain card.
      // date / note (optional): show as a subtitle under the donor name.
      header: ['order','name','level','date','note'],
      rows: [
        // Seed empty so updateSheet just adds the tab. Add a row per donor.
        // Example formats:
        //   [1, 'Jane Smith',          'gold',   'Jul 2025', 'Founding supporter'],
        //   [2, 'Anonymous',           '',       '',         ''],
        //   [3, 'Smith Family',        'silver', 'Aug 2025', ''],
      ],
    },
    'Events': {
      // Local-area events list on events.html. Renders newest-first
      // grouped by day. Customers filter by category and family-friendly.
      //
      //   date_iso         ISO 8601 date (e.g. "2026-05-23"). Used for
      //                    chronological sort. If blank, falls back to
      //                    `order` for sequencing.
      //   day_label        Display heading for the date group
      //                    (e.g. "Friday, May 23"). If blank, derived
      //                    from date_iso.
      //   time             Free-form time string (e.g. "4:00 pm – 6:00 pm").
      //   title            Event name.
      //   venue            Where it happens.
      //   category         One of: fests, family, arts, adult, wellness,
      //                    music, edu — or any human label starting with
      //                    those (e.g. "Music Events", "Family Fun"). Picks
      //                    the chip color and the filter chip it matches.
      //   family_friendly  TRUE / FALSE. Adds a "👨‍👩‍👧 Family" badge and
      //                    surfaces the event when "Family-friendly only"
      //                    is toggled.
      //   description      Short blurb (optional).
      //   url              External info link (optional).
      header: ['order','date_iso','day_label','time','title','venue','category','family_friendly','description','url','lat','lng','bike_friendly'],
      rows: [
        // ── Friday, May 1 ──
        [10, '2026-05-01', 'Friday, May 1', '4:00 pm – 8:00 pm', 'Food Company Band', 'Twisted Rivets', 'music', false, '', '', 41.1004, -80.6489, true],
        [11, '2026-05-01', '', '4:00 pm – 10:00 pm', 'Penguin City Brewing Company', 'Penguin City Brewing Company', 'adult', false, 'Brewery taproom open.', '', 41.1017, -80.6416, true],
        [12, '2026-05-01', '', '5:00 pm – 9:00 pm', 'Cinco de Mayo on Phelps Street', 'Phelps Street Gateway', 'fests', true, 'Tacos, music, and downtown vibes.', '', 41.1008, -80.6496, true],
        [13, '2026-05-01', '', '6:00 pm – 9:00 pm', 'Greek Comedy Show', 'Tisone Wrestling Banquet Center', 'adult', false, '', '', 41.1198, -80.6033, ''],
        [14, '2026-05-01', '', '6:00 pm – 9:00 pm', 'Ryan Goodcase', 'The Apollo Event Center', 'music', false, '', '', 41.0998, -80.6469, true],

        // ── Saturday, May 2 ──
        [20, '2026-05-02', 'Saturday, May 2', '10:00 am – 12:00 pm', 'Latin Night', 'The Social', 'music', false, '', '', 41.1001, -80.6508, true],
        [21, '2026-05-02', '', '10:00 am – 1:00 pm', 'Country Line Dancing', 'Penguin City Brewing Company', 'adult', false, 'Beginner-friendly, free lessons.', '', 41.1017, -80.6416, true],
        [22, '2026-05-02', '', '12:00 pm – 4:00 pm', 'Folkfest Launch Party', 'Yonkos Hall', 'fests', true, '', '', '', '', true],
        [23, '2026-05-02', '', '5:00 pm – 9:00 pm', 'Halfway to Halloween Horror Fest', 'Ward Beecher Planetarium', 'adult', false, '', '', 41.1054, -80.6475, true],
        [24, '2026-05-02', '', '7:00 pm – 9:00 pm', 'Visitor Appreciation Weekend', 'Mahoning Valley Historical Society', 'edu', true, '', '', 41.1102, -80.6441, true],
        [25, '2026-05-02', '', '8:00 pm – 11:00 pm', 'Country Line Dancing', 'Penguin City Brewing Company', 'adult', false, '', '', 41.1017, -80.6416, true],

        // ── Sunday, May 3 ──
        [30, '2026-05-03', 'Sunday, May 3', '10:00 am – 1:00 pm', 'BYOB Brunch', 'Penguin City Brewing Company', 'adult', false, 'Build-your-own brunch — bring the family.', '', 41.1017, -80.6416, true],
        [31, '2026-05-03', '', '11:00 am – 4:00 pm', 'Sensory Sunday', 'Butler Institute of American Art', 'family', true, 'Quiet hours and sensory-friendly programming.', '', 41.1068, -80.6457, true],
        [32, '2026-05-03', '', '12:00 pm – 5:00 pm', 'Twisted Roots Brunch & Vibe + Live Music', 'Twisted Rivets', 'music', false, '', '', 41.1004, -80.6489, true],
        [33, '2026-05-03', '', '1:00 pm – 4:00 pm', 'World Press Freedom Day', 'Butler Institute of American Art', 'edu', false, '', '', 41.1068, -80.6457, true],
        [34, '2026-05-03', '', '2:00 pm – 4:00 pm', 'Youth Orchestra Concert', 'Stambaugh Auditorium', 'arts', true, '', '', 41.1157, -80.6521, true],
        [35, '2026-05-03', '', '4:00 pm – 7:00 pm', 'The Beauty Legacy Industry Mixer', 'Penguin City Brewing Company', 'adult', false, '', '', 41.1017, -80.6416, true],

        // ── Tuesday, May 5 ──
        [40, '2026-05-05', 'Tuesday, May 5', '6:00 pm – 8:00 pm', 'Workshop: Writing Through Grief', 'Penguin City Brewing Company', 'wellness', false, '', '', 41.1017, -80.6416, true],

        // ── Wednesday, May 6 ──
        [50, '2026-05-06', 'Wednesday, May 6', '6:00 pm – 8:00 pm', 'Mahoning Valley Civic Forum', 'Mahoning Valley Historical Society', 'edu', false, '', '', 41.1102, -80.6441, true],

        // ── Thursday, May 7 ──
        [60, '2026-05-07', 'Thursday, May 7', '6:00 pm – 9:00 pm', 'The Hops Conference', 'Covelli Centre', 'adult', false, '', '', 41.0971, -80.6467, true],
        [61, '2026-05-07', '', '6:00 pm – 11:00 pm', 'Young Friends Adventure 2026', 'Youngstown Country Club', 'adult', false, '', '', 41.1444, -80.6272, ''],

        // ── Friday, May 16 ──
        [70, '2026-05-16', 'Friday, May 16', '4:00 pm – 7:00 pm', 'Food for Thought', 'Phelps Street Gateway', 'fests', true, '', '', 41.1008, -80.6496, true],
        [71, '2026-05-16', '', '5:00 pm – 9:00 pm', 'Trivia Night', 'Penguin City Brewing Company', 'adult', false, '', '', 41.1017, -80.6416, true],
        [72, '2026-05-16', '', '7:00 pm – 11:00 pm', 'Thirsty Thursday Karaoke', 'Penguin City Brewing Company', 'music', false, '', '', 41.1017, -80.6416, true],

        // ── Saturday, May 17 ──
        [80, '2026-05-17', 'Saturday, May 17', '9:00 am – 1:00 pm', 'Mahoning Valley Civic Forum', 'Mahoning Valley Historical Society', 'edu', false, '', '', 41.1102, -80.6441, true],
        [81, '2026-05-17', '', '10:00 am – 4:00 pm', 'Young Friends Adventure 2026', 'Youngstown Country Club', 'family', true, '', '', 41.1444, -80.6272, ''],
        [82, '2026-05-17', '', '12:00 pm – 4:00 pm', 'Country Line Dancing', 'Penguin City Brewing Company', 'adult', false, '', '', 41.1017, -80.6416, true],
        [83, '2026-05-17', '', '1:00 pm – 4:00 pm', 'Live Wire Mickey Cruz Tribute & Space Monkey Aces Mountain Trax Tribute', 'Twisted Rivets', 'music', false, '', '', 41.1004, -80.6489, true],
        [84, '2026-05-17', '', '7:30 pm – 9:30 pm', 'Live Music: Ruby — Mountain Soul', 'Twisted Rivets', 'music', false, '', '', 41.1004, -80.6489, true],

        // ── Sunday, May 18 ──
        [90, '2026-05-18', 'Sunday, May 18', '10:00 am – 4:00 pm', 'BYOB Brunch', 'Penguin City Brewing Company', 'adult', false, '', '', 41.1017, -80.6416, true],
        [91, '2026-05-18', '', '4:00 pm – 7:00 pm', 'BNB Build (Beats and Beers)', 'Penguin City Brewing Company', 'music', false, '', '', 41.1017, -80.6416, true],

        // ── Friday, May 23 ──
        [100, '2026-05-23', 'Friday, May 23', '10:00 am – 12:00 pm', 'Meditation at American Masterpieces', 'Butler Institute of American Art', 'wellness', false, '', '', 41.1068, -80.6457, true],
        [101, '2026-05-23', '', '5:00 pm – 8:00 pm', 'Michael W. Smith — Live in the Valley', 'Covelli Centre', 'music', false, '', '', 41.0971, -80.6467, true],
        [102, '2026-05-23', '', '6:00 pm – 10:00 pm', 'Full Spectrum: "Unity Prom"', 'Covelli Centre', 'adult', false, '', '', 41.0971, -80.6467, true],
        [103, '2026-05-23', '', '7:00 pm – 11:00 pm', 'Carmin/Memorial Day Bash', 'Penguin City Brewing Company', 'fests', true, '', '', 41.1017, -80.6416, true],
        [104, '2026-05-23', '', '8:00 pm – 11:00 pm', 'Live Music: Lec O Angelos', 'Twisted Rivets', 'music', false, '', '', 41.1004, -80.6489, true],

        // ── Saturday, May 24 ──
        [110, '2026-05-24', 'Saturday, May 24', '8:00 am – 12:00 pm', 'Workshop: Writing Through Grief', 'Penguin City Brewing Company', 'wellness', false, '', '', 41.1017, -80.6416, true],
        [111, '2026-05-24', '', '8:00 am – 4:00 pm', 'Pop Up on Phelps', 'Phelps Street Gateway', 'fests', true, 'Pop-up market in the open air. Family-friendly.', '', 41.1008, -80.6496, true],
        [112, '2026-05-24', '', '11:00 am – 4:00 pm', 'Downtown Youngstown Farmers Market', 'Phelps Street Gateway', 'family', true, '', '', 41.1008, -80.6496, true],
        [113, '2026-05-24', '', '12:00 pm – 4:00 pm', 'Trivia Night with Greg G', 'Twisted Rivets', 'adult', false, '', '', 41.1004, -80.6489, true],
        [114, '2026-05-24', '', '7:30 pm – 11:00 pm', 'Open Mic Night', 'Penguin City Brewing Company', 'music', false, '', '', 41.1017, -80.6416, true],

        // ── Sunday, May 25 ──
        [120, '2026-05-25', 'Sunday, May 25', '11:00 am – 4:00 pm', 'BYOB Brunch', 'Penguin City Brewing Company', 'adult', false, '', '', 41.1017, -80.6416, true],
        [121, '2026-05-25', '', '11:00 am – 5:00 pm', 'Pop Up on Phelps', 'Phelps Street Gateway', 'fests', true, '', '', 41.1008, -80.6496, true],
        [122, '2026-05-25', '', '7:00 pm – 9:00 pm', 'Visitor Appreciation Weekend', 'Mahoning Valley Historical Society', 'edu', true, '', '', 41.1102, -80.6441, true],

        // ── Friday, May 29 ──
        [130, '2026-05-29', 'Friday, May 29', '5:00 pm – 8:00 pm', 'Summer Exhibitions Opening', 'Butler Institute of American Art', 'arts', true, '', '', 41.1068, -80.6457, true],
        [131, '2026-05-29', '', '8:00 pm – 11:00 pm', 'Live Music: Frenz', 'Twisted Rivets', 'music', false, '', '', 41.1004, -80.6489, true],

        // ── Saturday, May 30 ──
        [140, '2026-05-30', 'Saturday, May 30', '9:30 am – 1:00 pm', '25th Annual Stonewall Painting Day', 'Tod Park', 'family', true, 'Community paint-and-mural day. All ages welcome.', '', '', '', true],
        [141, '2026-05-30', '', '10:00 am – 12:00 pm', 'Youngstown Marathon — Solo to City', 'Downtown Youngstown', 'wellness', true, '', '', '', '', true],
        [142, '2026-05-30', '', '8:00 pm – 11:00 pm', 'BYOB Brunch', 'Penguin City Brewing Company', 'adult', false, '', '', 41.1017, -80.6416, true],

        // ── Saturday, May 9 (Explore Mahoning) ──
        [200, '2026-05-09', 'Saturday, May 9', '9:00 am – 3:00 pm', "Mr. Darby's Trunk Sale", "Mr. Darby's Vintage & Antiques · 7386 Market St., Boardman", 'fests', true, '', '', '', '', ''],
        [201, '2026-05-09', '', '10:00 am – 2:00 pm', '2nd Annual Pollinator Palooza', 'Mahoning Soil & Water Conservation District · 850 Industrial Rd., Youngstown', 'wellness', true, '', '', '', '', true],
        [202, '2026-05-09', '', '10:00 am – 5:00 pm', "15th Birthday Bash — OH WOW! Children's Center", "OH WOW! Children's Center · 15 Central Square, Youngstown", 'family', true, '', '', 41.1002, -80.6491, true],
        [203, '2026-05-09', '', '11:00 am – 3:00 pm', '3rd Annual Plant Swap', 'Penguin City Brewing Company · 460 E. Federal St., Youngstown', 'family', true, 'Bring a plant, take a plant.', '', 41.1017, -80.6416, true],
        [204, '2026-05-09', '', '12:00 pm – 2:00 pm', "Mother's Day Weekend Bouquet Bar", "L'uva Bella Winery & Bistro · 6597 Center Rd., Lowellville", 'arts', true, '', '', '', '', ''],

        // ── Sunday, May 10 (Explore Mahoning) ──
        [210, '2026-05-10', 'Sunday, May 10', '11:00 am – 3:00 pm', "Mother's Day Brunch Buffet", "L'uva Bella Winery & Bistro · 6597 Center Rd., Lowellville", 'family', true, '', '', '', '', ''],
        [211, '2026-05-10', '', '11:00 am – 4:00 pm', "Mother's Day Buffet", 'Waypoint 4180 · 4180 Westford Pl., Canfield', 'family', true, '', '', '', '', ''],

        // ── Wednesday, May 13 (Explore Mahoning) ──
        [220, '2026-05-13', 'Wednesday, May 13', '5:30 pm', 'Friends of Poland Forest Meeting & Lecture', 'Poland Library · 311 S. Main St., Poland', 'edu', false, '', '', '', '', ''],

        // ── Thursday, May 14 (Explore Mahoning) ──
        [230, '2026-05-14', 'Thursday, May 14', '4:00 pm – 7:30 pm', 'Downtown Youngstown Farmers Market', 'Main Library · 305 Wick Ave., Youngstown', 'family', true, '', '', '', '', true],
        [231, '2026-05-14', '', '5:00 pm', 'Move at the Market — Walking Series', 'Main Library · 305 Wick Ave., Youngstown', 'wellness', true, 'Group walk around downtown.', '', '', '', true],
        [232, '2026-05-14', '', '5:30 pm', 'Food for Thought Book Discussion', 'Noble Creature Wild Ales & Lagers · 126 E. Rayen Ave.', 'edu', false, 'Lit Youngstown First Wednesday Readers Series.', '', 41.1051, -80.6443, true],

        // ── Friday, May 15 (Explore Mahoning) ──
        [240, '2026-05-15', 'Friday, May 15', '6:00 pm', "Music on the Patio — L'uva Bella", "L'uva Bella Winery & Bistro · 6597 Center Rd., Lowellville", 'music', true, '', '', '', '', ''],
        [241, '2026-05-15', '', '7:30 pm', 'Inextinguishable', 'Stambaugh Auditorium · 1000 Fifth Ave., Youngstown', 'arts', false, 'Symphony performance.', '', 41.1157, -80.6521, true],

        // ── Saturday, May 16 (Explore Mahoning, same day as existing entries) ──
        [250, '2026-05-16', '', '8:00 am – 1:00 pm', 'Baby Bargain Boutique', 'Boardman Township Park · 375 Boardman-Poland Rd., Boardman', 'family', true, '', '', '', '', ''],
        [251, '2026-05-16', '', '6:00 pm', "Music on the Patio — L'uva Bella", "L'uva Bella Winery & Bistro · 6597 Center Rd., Lowellville", 'music', true, '', '', '', '', ''],

        // ── Sunday, May 17 (Explore Mahoning, same day as existing entries) ──
        [260, '2026-05-17', '', '12:00 pm', 'Bike Belmont', 'Wick Park · 260 Park Ave., Youngstown', 'wellness', true, 'Group ride through Belmont — perfect e-bike outing.', '', 41.1158, -80.6472, true],
        [261, '2026-05-17', '', '3:00 pm', '#LoveMusic Legacy Concert', 'Stambaugh Auditorium · 1000 Fifth Ave., Youngstown', 'music', true, '', '', 41.1157, -80.6521, true],

        // ── Wednesday, May 20 (Explore Mahoning) ──
        [270, '2026-05-20', 'Wednesday, May 20', '9:00 am – 5:00 pm', 'Tent Sale', 'Habitat ReStore · 480 Youngstown-Poland Rd., Struthers', 'fests', true, '', '', '', '', ''],
        [271, '2026-05-20', '', '6:00 pm – 7:30 pm', 'History of Youngstown & Mahoning Valley Restaurants', 'Main Library · 305 Wick Ave., Youngstown', 'edu', false, 'Community Cookbooks: Food talk.', '', '', '', true],
        [272, '2026-05-20', '', "6:00 pm – 8:00 pm", "Mom's Night Out", 'Southern Park Mall · 7401 Market St., Boardman', 'adult', false, '', '', '', '', ''],
        [273, '2026-05-20', '', '7:30 pm – 9:30 pm', 'NEUR NetWorks: Connecting & Communicating for Creatives', 'The Concept Studio · 217 W. Federal St., Youngstown', 'adult', false, '', '', 41.0999, -80.6528, true],

        // ── Friday, May 22 (Explore Mahoning) ──
        [280, '2026-05-22', 'Friday, May 22', '6:00 pm', "Music on the Patio — L'uva Bella", "L'uva Bella Winery & Bistro · 6597 Center Rd., Lowellville", 'music', true, '', '', '', '', ''],

        // ── Saturday, May 23 (Explore Mahoning, same day as existing entries) ──
        [290, '2026-05-23', '', '10:00 am', 'Furry Angels Run', 'Eastside Civics · 968 E. Midlothian Blvd., Youngstown', 'wellness', true, 'Charity run — bring the family and a dog.', '', '', '', true],
        [291, '2026-05-23', '', '6:00 pm', "Music on the Patio — L'uva Bella", "L'uva Bella Winery & Bistro · 6597 Center Rd., Lowellville", 'music', true, '', '', '', '', ''],

        // ── Monday, May 25 (Explore Mahoning, same day as existing entries) ──
        [300, '2026-05-25', '', '10:00 am – 1:00 pm', 'Memorial Day Parade & Ceremony', 'Boardman Township Park · 375 Boardman-Poland Rd., Boardman', 'fests', true, '', '', '', '', true],
      ],
    },
    'Venues': {
      // Lat/lng lookup table for events.html. doGet matches each event's
      // `venue` column against this list (substring, case-insensitive)
      // and back-fills lat/lng if the event row doesn't already have its
      // own coords. So you only have to type the venue name on the Events
      // tab — coordinates flow from here automatically.
      //
      // Add a new venue: drop in a row with `venue` (the name, or any
      // distinctive substring of it), `lat`, `lng`. Longer venue strings
      // win in case of overlap, so "L'uva Bella Winery & Bistro" beats
      // a more generic prefix.
      header: ['venue','lat','lng'],
      rows: [
        // Downtown Youngstown / YSU campus
        ['Twisted Rivets',                       41.1004, -80.6489],
        ['Penguin City Brewing Company',         41.1017, -80.6416],
        ['Phelps Street Gateway',                41.1008, -80.6496],
        ['Tisone Wrestling Banquet Center',      41.1198, -80.6033],
        ['The Apollo Event Center',              41.0998, -80.6469],
        ['The Social',                           41.1001, -80.6508],
        ['Ward Beecher Planetarium',             41.1054, -80.6475],
        ['Mahoning Valley Historical Society',   41.1102, -80.6441],
        ['Butler Institute of American Art',     41.1068, -80.6457],
        ['Stambaugh Auditorium',                 41.1157, -80.6521],
        ['Covelli Centre',                       41.0971, -80.6467],
        ['Youngstown Country Club',              41.1444, -80.6272],
        ["OH WOW",                               41.1002, -80.6491],
        ['Noble Creature',                       41.1051, -80.6443],
        ['Wick Park',                            41.1158, -80.6472],
        ['The Concept Studio',                   41.0999, -80.6528],
        // Surrounding area
        ["Mr. Darby's Vintage & Antiques",       41.0205, -80.6625],
        ["L'uva Bella Winery & Bistro",          41.0223, -80.5471],
        ['Waypoint 4180',                        41.0264, -80.7584],
        ['Boardman Township Park',               41.0187, -80.6473],
        ['Southern Park Mall',                   41.0232, -80.6644],
        ['Poland Library',                       41.0235, -80.6128],
        ['Habitat ReStore',                      41.0559, -80.6158],
      ],
    },
    'RentalsVibe': {
      // Side-by-side "vibe check" cards on rentals.html. Helps a new
      // visitor pick between Trailside (Kirk Road) and Adventures
      // (Bears Den) based on their experience level.
      //   slug:  'kirk' or 'bears' — picks the gradient color treatment
      //          (sage gradient for kirk, dark forest for bears).
      //   icon:  emoji shown above the card name.
      //   recommendation: small badge at the top of the card
      //                   (e.g. "First-time riders", "Confident riders").
      //   traits: pipe-separated list of short keywords
      //           (e.g. "Flat|Paved|Family-friendly").
      header: ['order','slug','icon','recommendation','label','subtitle','tagline','descriptor','traits','url','cta_label'],
      rows: [
        [1, 'kirk',  '🌿', '⛅ First-time riders',
          'Kirk Road', 'Trailside Journey', 'Flat. Fast. Pure Focus.',
          "Paved bikeway. No cars, no climbs, no surprises — just smooth riding through the Mill Creek MetroParks corridor. Perfect first time on an e-bike.",
          'Flat|Paved|Family-friendly|Easy on every level',
          'trailside.html', 'See Trailside'],
        [2, 'bears', '🏞️', '⛰ Confident riders',
          'Bears Den', 'Unleash Your Adventure', 'Hills. Thrills. High Energy.',
          "Straight into Mill Creek Park's hidden corners — Lily Pond loops, Lanterman's Mill, the covered bridge. Wooded, hilly, scenic. The bike does the climbs so you can take in the view.",
          'Hills|Wooded trails|Scenic loops|Park interior',
          'adventures.html', 'See Adventures'],
      ],
    },
    'Admin': {
      // Internal admin tools — not customer-facing, never rendered on the
      // live site. This tab is here just so the URLs you need are always
      // a click away from inside the spreadsheet you already use.
      // Click the cell, then Ctrl/Cmd-click the link to open in a new tab.
      header: ['tool','url','notes'],
      rows: [
        ['Migrate Wix images → GitHub',
          'https://ebike-sales.pages.dev/migrate-images.html',
          'Loads bike inventory from Apps Script + the live /images/ list from GitHub. Map each Wix image to a local filename, click "Save Bike", done. (Bike inventory uses /images/; page background photos use /media/.)'],
        ['Live site (home)',
          'https://ebike-sales.pages.dev/',
          'The deployed customer-facing site. Hard-refresh (Cmd-Shift-R / Ctrl-F5) after editing the Sheet to see changes immediately.'],
        ['Sales Pro (internal quote builder)',
          'https://ebike-sales.pages.dev/index.html',
          'The internal sales-pro quote tool. Bookmarkable.'],
        ['GitHub repo',
          'https://github.com/cruisethecreek-tech/Ebike-sales',
          'Source code. Two folders: /images/ for bike inventory photos (used by the migration tool above), /media/ for page hero backgrounds and other site photos.'],
      ],
    },
    'Galleries': {
      // Photo galleries rendered on the page that matches `page`.
      // image  = filename in /media/  (or full https:// URL for off-site images)
      // caption = optional short caption shown under the photo
      header: ['page','order','image','caption'],
      rows: [
        ['adventures', 1, '', ''],
        ['adventures', 2, '', ''],
        ['adventures', 3, '', ''],
        ['trailside',  1, '', ''],
        ['trailside',  2, '', ''],
        ['trailside',  3, '', ''],
      ],
    },
    'ApparelProducts': {
      // Each row is one print/design. Color and size live in their own
      // tabs (ApparelColors + hardcoded sizes in apparel.html) so a single
      // print can be ordered in any color/size combo. `available=false`
      // renders the card as "Coming Soon" and disables ordering.
      //
      // `colors` narrows which ApparelColors rows show for this product.
      // Comma-separated list of color names, e.g. "Black, Forest Green".
      // Leave blank to allow every color in ApparelColors.
      header: ['id','order','name','base_price','photo','description','colors','available'],
      rows: [
        ['tee-trail', 1, 'Trail Map Tee',       30, 'tee-trail-green.jpg',
          "Cream-and-tan trail mark with the Cruise the Creek bike, trees, and dotted-line park trails. Soft cotton blend.",
          '', true],
        ['tee-neon',  2, 'Neon Watercolor Tee', 30, 'tee-neon-black.jpg',
          "Vivid neon-watercolor design with chains, trees, and the Youngstown OH stamp. Heavyweight cotton.",
          'Black', true],
        ['tee-three', 3, 'Print 3 (TBA)',       30, '',
          "Third design lands soon. Drop your name on the order form and we'll let you know when it ships.",
          '', false],
      ],
    },
    'ApparelColors': {
      // Drives the color-swatch picker on apparel.html. `swatch` is the
      // hex used to render the swatch button. `available=false` greys out
      // a color without removing the row.
      header: ['order','name','swatch','available'],
      rows: [
        [1, 'Black',        '#1a1a1a', true],
        [2, 'Forest Green', '#4a6650', true],
        [3, 'Sand',         '#d4c5a0', true],
        [4, 'White',         '#f8f6f0', true],
      ],
    },
    'ApparelPlacements': {
      // Drives the print-placement toggle on apparel.html. `name` is the
      // primary label + the value saved to Apparel_Orders. `sublabel` is
      // the small text under the name (optional — leave blank to hide).
      // `available=false` hides the option entirely.
      header: ['order','name','sublabel','available'],
      rows: [
        [1, 'Front', 'Chest',     true],
        [2, 'Back',  'Shoulders', true],
      ],
    },
    'Accessories': {
      // Each row is one Amazon affiliate pick on accessories.html. Cards
      // are grouped by `category`, then optionally by `subgroup` (a bold
      // sub-heading inside the category). `order` controls global sort.
      //
      // The FIRST row encountered for each category supplies the section
      // header text (`cat_eyebrow`, `cat_intro`, `cat_icon`); leave those
      // blank on later rows in the same category. Same goes for `subgroup`
      // — repeat the value on every row that belongs to the sub-group.
      //
      // `id` is a stable slug used to dedupe on updateSheet() — never reuse.
      // `photo` = filename in /media/ or full https:// URL (blank = stylized
      // text placeholder). `available=false` hides the row.
      header: ['id','order','category','cat_eyebrow','cat_intro','cat_icon','subgroup','name','description','badge','photo','url','available'],
      rows: [
        // Saddles & Seats — Bluewind sub-group
        ['bluewind-backrest', 10, 'Saddles & Seats', 'Comfort upgrades',
          "The factory saddle on most e-bikes is the first thing riders want to swap. These are wider, softer, and built for longer rides — picks for both stationary and rolling bikes.",
          '🪑', 'Bluewind', 'Oversized Backrest Saddle',
          "Wide bicycle saddle with novel backrest design. Universal fit for e-bikes, exercise bikes, or stationary road bikes — built for men & women.",
          'Top Pick', '', 'https://amzn.to/4l0PXJc', true],
        ['bluewind-noseless', 20, 'Saddles & Seats', '', '', '',
          'Bluewind', 'Noseless Oversized Saddle',
          "Same wide backrest design — but noseless, for riders who want to take pressure off the perineum on longer cruises.",
          'Noseless', '', 'https://amzn.to/3Ouvhxb', true],
        ['bluewind-wing',     30, 'Saddles & Seats', '', '', '',
          'Bluewind', 'Wing-Padded Wide Saddle',
          "Extra-wide cushion with comfort wings. Drop-in replacement for Peloton, stationary bikes, e-bikes, cruisers, and city bikes.",
          '', '', 'https://amzn.to/4aCFH6q', true],
        // Saddles & Seats — Cloud-9 sub-group
        ['cloud9-cruiser',    40, 'Saddles & Seats', '', '', '',
          'Cloud-9', 'Cruiser Select Saddle',
          "10.5″ × 10.75″ cruiser saddle in soft-touch black vinyl. The classic Cloud-9 sit-up-and-cruise feel.",
          'Cruiser', '', 'https://amzn.to/47fta6D', true],
        ['cloud9-suspension', 50, 'Saddles & Seats', '', '', '',
          'Cloud-9', 'Suspension Cruiser Saddle',
          "Sunlite Cloud-9 with built-in suspension and cruiser gel — tri-color black. Smooths out the bumpy bits without losing comfort.",
          'Suspension Gel', '', 'https://amzn.to/4r3naVQ', true],
        // Seat Posts — single-product category
        ['post-spring-susp',  60, 'Seat Posts', 'Suspension',
          "Add suspension at the seat without buying a whole new bike. A spring-loaded seat post takes the sting out of cracks, curbs, and gravel.",
          '⚡', '', 'Spring Suspension Seat Post',
          "Shock-absorbing seat post with spring suspension — available in 27.2 mm, 30.9 mm, and 31.6 mm. Check your bike's seat tube before ordering.",
          '3 Sizes', '', 'https://amzn.to/40wqHkr', true],
        // Tools — single-product category
        ['tool-ratchet-40',   70, 'Tools', 'Workshop',
          "A small starter kit for assembly, tweaks, and trailside fixes. Nothing fancy — just the stuff that lives in our shop drawer.",
          '🔧', '', '40-in-1 Ratcheting Screwdriver',
          "S2 steel bits with detachable ratchet handle. Handles bike tweaks, electronics repair, furniture assembly, and general DIY.",
          '40-in-1', '', 'https://amzn.to/4d2ppoG', true],
      ],
    },
    'Apparel_Orders': {
      // Order log. Header only — rows are appended at submission time by
      // handleApparelOrder(). The id column is generated server-side.
      // paymentLink is the Stripe Payment Link URL (empty if Stripe failed
      // or the print is a "Coming Soon" notify-me row).
      header: ['id','timestamp','first','last','email','phone',
               'product','color','size','placement','qty','total','comments','paymentLink'],
      rows: [],
    },
    'Blog': {
      // One row per blog post. Migrated from Wix via importWixPosts().
      // Edit-flow: change body_html / hero / excerpt / tags here, save,
      // then re-run the static renderer (scripts/build-blog.js) to push
      // the changes to /blog/[slug]/index.html.
      //
      // slug      = URL identifier under /blog/[slug]/  (kebab-case, no spaces)
      // wix_slug  = original Wix /post/[slug] for the _redirects file
      // hero      = featured image URL or /media/blog/[slug]/[file] path
      // excerpt   = short teaser shown on the blog index card (1–2 sentences)
      // body_html = the full post HTML (h2/p/img/ul tags fine)
      // tags      = comma-separated, e.g. "trails, e-bikes"
      // published = TRUE shows in /blog. FALSE hides without deleting.
      header: ['slug','title','date','author','hero','excerpt','body_html','tags','wix_slug','published'],
      rows: [],
    },
    'TrustStrip': {
      // Same four cards render on every brand page (heybike, velotric,
      // mooncool, jasion). Edit here once.
      header: ['order','icon','title','desc'],
      rows: [
        [1, '🔋', '50-Point Safety',     'Every brake is indexed for absolute stopping power before you hit the trail.'],
        [2, '⚙️', 'Master Integration',  'High-precision setup of your power system and drivetrain for peak efficiency.'],
        [3, '🛡️', '30-Day Tune-Up',      'Comprehensive coverage and support for peace of mind in your first 30 days.'],
        [4, '🚚', 'Local Delivery',      'Fast affordable local delivery available to your door in the tri-county area.'],
      ],
    },
    'Sections': {
      // page    = which page slug the row belongs to
      // order   = sort order within a page (or within a slot, for slotted pages)
      // slot    = optional region (fleet, about, steps, cards, switch, service).
      //           Leave blank for pages that render rows in a flat sequence (our-story).
      // type    = renderer hint. See HTML for supported types per page/slot.
      // title   = primary text for the row (e.g. h2, step title, fleet-type name)
      // body    = secondary text or paragraph (supports **bold** *italic* -- em-dash)
      // extra   = third field — usually a URL, optional badge, or pipe-pair payload
      header: ['page','order','slot','type','title','body','extra'],
      rows: [
        // ── Our Story (slot left blank — flat prose render) ──
        ['our-story',  1, '', 'eyebrow',    'Where it began', '', ''],
        ['our-story',  2, '', 'h2',         'Remember those neighborhood lemonade stands?', '', ''],
        ['our-story',  4, '', 'lead', '',
          "They were simple. Honest. They were run by kids who understood something we adults often forget: **the best things in life are meant to be shared.**", ''],
        ['our-story',  5, '', 'body', '',
          "I grew up with those stands in mind. But during the pandemic, when screens became our default escape, I realized my two sons -- 16 and 13 -- were living a life disconnected from the world right outside our window. Across the street sat 2,658 acres of **Mill Creek Park**: trails, hills, lakes, and hidden beauty that most of us just drive past.", ''],
        ['our-story',  6, '', 'body', '', "That's when it clicked.", ''],
        ['our-story',  7, '', 'pullquote', '',
          'Cruise The Creek became my lemonade stand. Not for profit -- for possibility.', ''],

        ['our-story', 10, '', 'eyebrow',   'Why we ride', '', ''],
        ['our-story', 11, '', 'h2',        'Why E-Bikes Change Everything', '', ''],
        ['our-story', 12, '', 'body', '',
          "If you've ever driven through Mill Creek Park, you know why most of it goes unseen. The best parts aren't accessible by car. The steep hills can be punishing. On a regular bike, you're often so focused on the \"burn\" that you miss the view.", ''],
        ['our-story', 13, '', 'body', '', '**E-bikes change the equation.**', ''],
        ['our-story', 14, '', 'body', '',
          "You get to choose: pedal hard, or cruise easy. Climb the steepest hills without the suffering. You get to actually *see* the park instead of just passing through it. It's the freedom to explore without limits.", ''],
        ['our-story', 15, '', 'callout',   'Adventure Awaits',
          "Pick a route, pick a ride -- we'll meet you on the trail.", ''],

        ['our-story', 20, '', 'divider', 'The Story', '', ''],

        ['our-story', 21, '', 'date',  'April 30, 2022', '', ''],
        ['our-story', 22, '', 'h2',    'The Turning Point', '', ''],
        ['our-story', 23, '', 'body', '',
          "After nearly 15 years at ALDI, my road there ended. I'd poured everything into that role -- leadership, efficiency, and adapting under the pressure of a global pandemic. But I saw things differently. I believed in pushing limits and leading with an entrepreneurial mindset, and eventually, those paths diverged.", ''],
        ['our-story', 24, '', 'body', '',
          "At first, it felt like the floor had been pulled out from under me. But the truth was, my body was already feeling the toll. Years on hard floors in steel-toe shoes had left me with sciatica that made my daily commute brutal. My family was paying the price too -- juggling 10-hour shifts while relying on my parents just to get the kids to school.", ''],
        ['our-story', 25, '', 'pullquote', '',
          "The departure wasn't the end. It was the space I needed to actually begin.", ''],

        ['our-story', 30, '', 'date',  'June 6, 2022', '', ''],
        ['our-story', 31, '', 'h2',    'The Sarasota Epiphany', '', ''],
        ['our-story', 32, '', 'body', '',
          "We had just moved into our dream home right across from Mill Creek MetroParks. During a trip to Florida, standing in a parking lot in Sarasota, it hit me: I'd spent 15 years working and missed too much. My oldest was already 15. My parents were aging. Time wasn't something I could manufacture.", ''],
        ['our-story', 33, '', 'body', '',
          "Every morning on that trip, I walked to the beach before sunrise to think. I saw tourists and locals cruising on e-bikes along the coast -- laughing, exploring, and actually **living the moment** instead of rushing through it.", ''],
        ['our-story', 34, '', 'body', '',
          "I rushed back to the beach house and told my wife. The idea caught fire instantly. By the time we got back to Youngstown, our first e-bikes were waiting.", ''],

        ['our-story', 40, '', 'eyebrow', 'Our mission', '', ''],
        ['our-story', 41, '', 'h2',      'Time matters. Experiences matter.', '', ''],
        ['our-story', 42, '', 'body', '',
          "Cruise The Creek didn't start with a boardroom business plan. It started with a realization: sometimes the best opportunities are right in front of you -- you just need a new way to see them.", ''],
        ['our-story', 43, '', 'body', '', '**Our mission is simple. We want you to:**', ''],
        ['our-story', 44, '', 'list-item', 'Get outside.',  '', ''],
        ['our-story', 45, '', 'list-item', 'Explore more.', '', ''],
        ['our-story', 46, '', 'list-item', 'Slow down.',    '', ''],
        ['our-story', 47, '', 'list-item', 'Reconnect',     '-- with nature, your family, and your community.', ''],
        ['our-story', 48, '', 'body', '',
          "All we ask? Take care of the bikes. Enjoy the ride. And if it makes you smile -- tell someone else.", ''],
        ['our-story', 49, '', 'pullquote', '',
          'Just like a lemonade stand, the best things in life are meant to be shared.', ''],

        // ── Adventures (Unleash) ──
        ['adventures',  1, 'fleet',   'num',     '11', 'E-Bikes|In the Fleet', ''],
        ['adventures',  2, 'fleet',   'type',    'All-Purpose', '4', ''],
        ['adventures',  3, 'fleet',   'type',    'High-Step',   '1', ''],
        ['adventures',  4, 'fleet',   'type',    'Cruiser',     '2', ''],
        ['adventures',  5, 'fleet',   'type',    'Cargo',       '2', ''],
        ['adventures',  6, 'fleet',   'type',    'E-Trike',     '2', ''],

        ['adventures', 10, 'about',   'eyebrow', 'About the park', '', ''],
        ['adventures', 11, 'about',   'h2',      'Mill Creek Park, Youngstown', '', ''],
        ['adventures', 12, 'about',   'body',    '',
          "Pickup at Bears Den Road / Scholl Pavilion puts you in the heart of one of the country's oldest urban parks — 4,400 acres of wooded trails, gorges, lakes, and historic landmarks.", ''],
        ['adventures', 13, 'about',   'body',    '',
          "Cruise the Lily Pond loops, ride out to Lanterman's Mill and the covered bridge, or push deeper into the park's quieter corners. The bike does the work on the climbs so you can take in the view instead of catching your breath.", ''],
        ['adventures', 14, 'about',   'body',    '',
          "Rentals are timed in flexible blocks. Whether you want a relaxed family ride or a longer afternoon expedition, the park has loops for every pace.", ''],
        ['adventures', 15, 'about',   'cta',     'Learn More About Mill Creek Park', '', 'https://www.millcreekmetroparks.org/'],

        ['adventures', 20, 'steps',   'eyebrow', 'How it works', '', ''],
        ['adventures', 21, 'steps',   'h2',      'Book your trip in 3 easy steps', '', ''],
        ['adventures', 22, 'steps',   'step',    'Reserve Your Ride',
          'Pick a number of bikes and a time slot. Done in under a minute.', ''],
        ['adventures', 23, 'steps',   'step',    'Get Started',
          "You'll receive an email with contact details, basic information, and waiver forms to fill out before you arrive.", ''],
        ['adventures', 24, 'steps',   'step',    'Unleash Your Adventure',
          'Pick up your e-bikes at Bears Den / Scholl Pavilion, take a quick tutorial, and start cruising the park.', ''],

        ['adventures', 30, 'cards',   'eyebrow', 'Before you go', '', ''],
        ['adventures', 31, 'cards',   'h2',      'Plan a great trip', '', ''],
        ['adventures', 32, 'cards',   'card',    'Get to know Cruise the Creek', 'About', 'our-story.html'],
        ['adventures', 33, 'cards',   'card',    "Read what they're saying",     'In their words', 'https://maps.app.goo.gl/gtvVMSKqfzgzoHkQ6'],
        ['adventures', 34, 'cards',   'card',    'Mill Creek hotspots',          'In the park',    'https://www.millcreekmetroparks.org/'],
        ['adventures', 35, 'cards',   'card',    'Safety & operations',           'Ride smart',     'safety.html'],

        ['adventures', 40, 'service', 'strip',   'The only e-bike service around', 'Mill Creek Park', 'creek-ready.html'],

        ['adventures', 50, 'switch',  'eyebrow', 'Would you rather?', '', ''],
        ['adventures', 51, 'switch',  'h2',      '#Trailside Journey', '', ''],
        ['adventures', 52, 'switch',  'body',    '',
          'Rather ride 11+ miles of the Mill Creek MetroParks Bikeway? Pick up at the Kirk Road Trailhead in Canfield instead.', ''],
        ['adventures', 53, 'switch',  'feature', '11+ Miles',
          'Wooded trail, lakes, ponds — out-and-back at your own pace.', ''],
        ['adventures', 54, 'switch',  'feature', 'Family Friendly',
          'Smooth surface, all skill levels, plenty of rest stops.', ''],
        ['adventures', 55, 'switch',  'cta',     'Switch to #Trailside Journey', '', 'trailside.html'],

        // ── Trailside ──
        ['trailside',   1, 'fleet',   'num',     '11', 'E-Bikes|In the Fleet', ''],
        ['trailside',   2, 'fleet',   'type',    'All-Purpose', '4', ''],
        ['trailside',   3, 'fleet',   'type',    'High-Step',   '1', ''],
        ['trailside',   4, 'fleet',   'type',    'Cruiser',     '2', ''],
        ['trailside',   5, 'fleet',   'type',    'Cargo',       '2', ''],
        ['trailside',   6, 'fleet',   'type',    'E-Trike',     '2', ''],

        ['trailside',  10, 'about',   'eyebrow', 'About the bikeway', '', ''],
        ['trailside',  11, 'about',   'h2',      'The Mill Creek MetroParks Bikeway', '', ''],
        ['trailside',  12, 'about',   'body',    '',
          'The bikeway winds through wooded areas, open fields, and alongside scenic lakes and ponds — a diverse and enjoyable experience for every rider.', ''],
        ['trailside',  13, 'about',   'body',    '',
          "The trail is well maintained with a smooth surface, suitable for all skill levels and ages. It's a popular destination for families and outdoor enthusiasts. Along the way you'll find benches, picnic areas, and interpretive signage that enhance the experience and give you a chance to rest, snack, or learn about the surrounding environment.", ''],
        ['trailside',  14, 'about',   'body',    '',
          "Whether you're after a leisurely cruise, a longer ride, or a scenic skate, the bikeway has something for everyone.", ''],
        ['trailside',  15, 'about',   'cta',     'Learn More About #Trailside Journey', '', 'https://www.millcreekmetroparks.org/place/mill-creek-bikeway/'],

        ['trailside',  20, 'steps',   'eyebrow', 'How it works', '', ''],
        ['trailside',  21, 'steps',   'h2',      'Book your trip in 3 easy steps', '', ''],
        ['trailside',  22, 'steps',   'step',    'Reserve Your Ride',
          'Pick a number of bikes and a time slot. Done in under a minute.', ''],
        ['trailside',  23, 'steps',   'step',    'Get Started',
          "You'll receive an email with contact details, basic information, and waiver forms to fill out before you arrive.", ''],
        ['trailside',  24, 'steps',   'step',    'Journey The Trail',
          'Pick up your e-bikes at the Kirk Road trailhead, take a quick tutorial, and start cruising.', ''],

        ['trailside',  30, 'cards',   'eyebrow', 'Before you go', '', ''],
        ['trailside',  31, 'cards',   'h2',      'Plan a great trip', '', ''],
        ['trailside',  32, 'cards',   'card',    'Get to know Cruise the Creek', 'About', 'our-story.html'],
        ['trailside',  33, 'cards',   'card',    "Read what they're saying",     'In their words', 'https://maps.app.goo.gl/gtvVMSKqfzgzoHkQ6'],
        ['trailside',  34, 'cards',   'card',    'Spots to visit on the trail',  'Along the way',   'https://www.millcreekmetroparks.org/place/mill-creek-bikeway/'],
        ['trailside',  35, 'cards',   'card',    'Safety & operations',           'Ride smart',     'safety.html'],

        ['trailside',  40, 'service', 'strip',   'The only e-bike service around', 'Mill Creek Park', 'creek-ready.html'],

        ['trailside',  50, 'switch',  'eyebrow', 'Would you rather?', '', ''],
        ['trailside',  51, 'switch',  'h2',      '#Unleash Your Adventure', '', ''],
        ['trailside',  52, 'switch',  'body',    '',
          "Prefer guided rides through Mill Creek Park's hidden gems? The Bears Den pickup at Scholl Pavilion gets you into the heart of the park.", ''],
        ['trailside',  53, 'switch',  'feature', 'Trip Advice',
          "We'll point you to the best loops for your skill level.", ''],
        ['trailside',  54, 'switch',  'feature', 'Easy Booking',
          'Reserve in under a minute, hit the trail in under an hour.', ''],
        ['trailside',  55, 'switch',  'cta',     'Switch to #Unleash Your Adventure', '', 'adventures.html'],

        // ── Safety & Operations ──
        ['safety',  1, '', 'eyebrow',     'The basics', '', ''],
        ['safety',  2, '', 'h2',          'Riding an e-bike', '', ''],
        ['safety',  3, '', 'body',        '',
          "Riding an e-bike is a wonderful experience opening up the joy of cycling to a wider audience than ever before. For many, riding an e-bike will be the first time they have ridden a bike since they were young -- and in many ways riding an e-bike is just like riding a standard bike. Pedaling is usually involved (unless you are using an e-bike with a throttle-only option), and it involves forward motion and balance to stay upright just like a standard bike. Depending upon the model, it also can involve shifting the rear cluster of gears to maximize your effort according to the terrain you're riding.", ''],
        ['safety',  4, '', 'h3',          "What's Ohio legislation say?", '', ''],
        ['safety',  5, '', 'pill',        'Ohio Revised Code →', '', 'https://codes.ohio.gov/ohio-revised-code/section-4511.521'],

        ['safety', 10, '', 'eyebrow',     "How they're different", '', ''],
        ['safety', 11, '', 'h2',          'Bike vs. e-bike', '', ''],
        ['safety', 12, '', 'body',        '',
          "Although there are some similarities, there are also some significant differences between bikes and e-bikes. Whereas a competition road bike can weigh less than 20 lbs., a typical e-bike weighs anywhere from **45 to 65 lbs.** depending upon the size and style of the bike. An e-bike can sustain **20 mph on a Class II** and up to **28 mph on most Class III** models -- speeds you only hit on a standard bike when you're topped out or going downhill.", ''],
        ['safety', 13, '', 'pullquote',   '', 'Our bikes will not exceed 28 mph on flat land.', ''],
        ['safety', 14, '', 'body',        '',
          'Always keep in mind how to safely operate your e-bike. Below are the important items to be aware of.', ''],

        ['safety', 20, '', 'eyebrow',     'Before you ride', '', ''],
        ['safety', 21, '', 'h2',          'Gear & protection', '', ''],
        ['safety', 22, '', 'gear-card',   'Helmets',
          'Always wear a properly fitted bike helmet. Helmets are provided with every Cruise the Creek rental.', ''],
        ['safety', 23, '', 'gear-card',   'Eye Protection',
          'Wear prescription glasses or sport glasses. Insects at e-bike speed can do real damage. Eyewear is provided with every rental.', ''],
        ['safety', 24, '', 'gear-card',   'Skin Exposure',
          'Out for several hours? Use SPF 30+ unless your clothing covers your arms.', ''],
        ['safety', 25, '', 'gear-card',   'Cycling Apparel',
          'Padded shorts (or a padded insert) help on longer rides. We also stock e-bikes with a **suspension seat post** that softens the ride.', ''],

        ['safety', 30, '', 'eyebrow',     'On the road', '', ''],
        ['safety', 31, '', 'h2',          'Rules of the road', '', ''],
        ['safety', 32, '', 'body',        '',
          'Class II and III e-bikes follow the same rules as standard bikes. **In any collision with a vehicle, the cyclist is at a major disadvantage** -- stay vigilant and presume the driver hasn\'t seen you until they\'ve yielded.', ''],
        ['safety', 33, '', 'body',        '',
          'Ride in the bike lane when available, with the flow of traffic, single file, and obey all signs and signals.', ''],
        ['safety', 34, '', 'pill',        'Mill Creek Park Rules →', '', 'https://www.millcreekmetroparks.org/wp-content/uploads/2021/06/Park-Rules-and-Regulations.pdf'],

        ['safety', 40, '', 'eyebrow',     'Fit matters', '', ''],
        ['safety', 41, '', 'h2',          'Sizing', '', ''],
        ['safety', 42, '', 'body',        '',
          'Frame sized mainly by inseam and your ability to put feet down at a stop.', ''],
        ['safety', 43, '', 'sizing-head', 'Frame', 'Rider height', ''],
        ['safety', 44, '', 'sizing-row',  'Small',  '5\'0" – 5\'4"', ''],
        ['safety', 45, '', 'sizing-row',  'Medium', '5\'5" – 5\'9"', ''],
        ['safety', 46, '', 'sizing-row',  'Large',  '5\'10" and up', ''],
        ['safety', 47, '', 'body',        '',
          'Two frame styles: **step-through** (no top tube) or standard. Pick what\'s most comfortable.', ''],

        ['safety', 50, '', 'eyebrow',     'Mechanics', '', ''],
        ['safety', 51, '', 'h2',          'Shifting', '', ''],
        ['safety', 52, '', 'body',        '',
          'Most e-bikes have **seven gears on the rear hub** with a trigger shifter on the right side. **Shift one gear at a time** with a slight pause in pedaling, and confirm the gear changed before shifting again -- clicking through several without easing off can throw the chain.', ''],

        ['safety', 60, '', 'eyebrow',     'The cockpit', '', ''],
        ['safety', 61, '', 'h2',          'E-bike controller', '', ''],
        ['safety', 62, '', 'body',        '',
          'Left-side controller with on/off and **+ / –** buttons selecting power assist: **Eco, Tour, Moderate, Sport, Turbo**. The display also shows speed, miles, and battery.', ''],

        ['safety', 70, '', 'eyebrow',     'Range & power', '', ''],
        ['safety', 71, '', 'h2',          'Battery & motor', '', ''],
        ['safety', 72, '', 'body',        '',
          'Lithium-powered, with a max range of **28 to 55 miles**. Eco/Tour at moderate speed gets the high end; Sport/Turbo drops you to **25–30 miles** per cycle. Recharge in roughly **4 to 6 hours**.', ''],
        ['safety', 73, '', 'callout',     'Eco & Tour go the distance',
          'For maximum range, stay in lower assist modes. Save Sport and Turbo for hills and headwinds.',
          'Plan your ride'],

        ['safety', 80, '', 'eyebrow',     'Stopping power', '', ''],
        ['safety', 81, '', 'h2',          'Braking', '', ''],
        ['safety', 82, '', 'body',        '',
          'Front and rear disc brakes -- left lever is the front, right lever is the rear. **Apply the rear brake before the front** to maintain stability while braking.', ''],

        ['safety', 90, '', 'eyebrow',     'Before you head out', '', ''],
        ['safety', 91, '', 'h2',          'Closing thoughts', '', ''],
        ['safety', 92, '', 'body',        '',
          "Our team fits you to the right size and style, makes the seat and handlebar adjustments, and walks you through these guidelines before you ride. Digital maps of local rides are available. If you break down on the road during a rental, we'll send a tech to fix it or bring you back -- and we'll either swap you onto another bike or revise the rental charge.", ''],
        ['safety', 93, '', 'body',        '',
          '**Guest safety is our number one concern.** We reserve the right to refuse rental to anyone we feel is unfit to ride an electric bike.', ''],
      ],
    },
  };
}

/**
 * Style a sheet's header row (forest green band, frozen).
 */
function styleHeader_(sh, len) {
  sh.getRange(1, 1, 1, len)
    .setFontWeight('bold')
    .setBackground('#2D4A32')
    .setFontColor('#ffffff');
  sh.setFrozenRows(1);
}

/**
 * setupSheet — DESTRUCTIVE one-time seeder.
 *
 * Clears every tab listed in getTabDefs() and re-writes header + seed rows.
 * Run this on a fresh sheet only. Re-running wipes any edits you've made.
 *
 * Use updateSheet() instead if you want to pull in NEW tabs / columns /
 * SiteConfig keys without losing your existing edits.
 */

// ─── Blog: Wix → Sheet importer ──────────────────────────────────────
//
// One-shot migration helper. Run from the Apps Script editor:
//
//   importWixPosts()         — full run, writes to the Blog tab
//   importWixPosts({dryRun:true})  — log only, no Sheet writes
//
// Idempotent: rows with a slug that's already in the Blog tab are
// skipped on re-run (so you can re-run after fixing one bad post
// without duplicating the rest).
//
// Returns a summary object with counts + per-post strategy notes; also
// dumps to Logger so you can read it under "Executions".

const WIX_FEED_URL_DEFAULT = 'https://www.cruisethecreek.com/blog-feed.xml';

// Wix slugs from when the blog was first set up — these are placeholder
// template posts whose URLs no longer match their content. Skipped by
// default; pass {skipSlugs: []} to disable.
const WIX_SKIP_SLUGS_DEFAULT = [
  'surfer-s-paradise-where-to-stop-for-best-waves',
  'lockdown-escape-work-travel-from-your-rv',
  'best-routes-for-seeing-fall-foliage',
  'why-we-love-rv-travel',
  'spectacular-places-to-go-camping-under-the-stars',
  '5-breathtaking-spots-to-watch-the-sunset',
];

function importWixPosts(opts) {
  opts = opts || {};
  const feedUrl   = opts.feedUrl   || WIX_FEED_URL_DEFAULT;
  const skipSlugs = opts.skipSlugs || WIX_SKIP_SLUGS_DEFAULT;
  const dryRun    = !!opts.dryRun;
  const force     = !!opts.force;  // re-import even if slug already in Sheet
  const skipSet   = {}; skipSlugs.forEach(function(s){ skipSet[s] = true; });

  const summary = { total: 0, imported: 0, skipped: 0, failed: 0,
                    notes: [], dryRun: dryRun, force: force };

  // 1) Fetch RSS.
  let feedXml;
  try {
    feedXml = UrlFetchApp.fetch(feedUrl, { muteHttpExceptions: true }).getContentText();
  } catch (err) {
    Logger.log('FATAL: could not fetch RSS at ' + feedUrl + ' — ' + err);
    return { error: String(err) };
  }

  // 2) Parse <item> blocks. We don't use XmlService because Wix's RSS
  //    contains CDATA-wrapped HTML that XmlService's namespace handling
  //    occasionally chokes on. Regex on the raw text is more forgiving.
  const items = extractRssItems_(feedXml);
  summary.total = items.length;
  Logger.log('Found ' + items.length + ' RSS items');

  // 3) Read existing Blog tab so we can de-dupe by slug.
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('Blog');
  if (!sh && !dryRun) {
    sh = ss.insertSheet('Blog');
    sh.appendRow(['slug','title','date','author','hero','excerpt','body_html','tags','wix_slug','published']);
    sh.getRange(1, 1, 1, 10).setFontWeight('bold');
  }
  const existingSlugs = {};
  const existingRowBySlug = {};  // slug → 1-based row index in Sheet
  if (sh && sh.getLastRow() > 1) {
    const slugCol = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    slugCol.forEach(function(r, i){
      const v = String(r[0] || '').trim();
      if (v) {
        existingSlugs[v] = true;
        existingRowBySlug[v] = i + 2;  // +2 because data starts at row 2 and i is 0-based
      }
    });
  }

  // 4) For each item, scrape, derive slug, write row.
  items.forEach(function(it) {
    const wixSlug = wixSlugFromLink_(it.link);
    if (skipSet[wixSlug]) {
      summary.skipped++;
      summary.notes.push({ wixSlug: wixSlug, status: 'skipped (placeholder)', title: it.title });
      Logger.log('SKIP (placeholder): ' + wixSlug);
      return;
    }

    // The clean-slug is the Wix slug for the 10 keepers (already
    // human-readable). If you want to override per-post, edit the slug
    // cell in the Sheet after import — wix_slug stays put for redirects.
    const slug = wixSlug;
    if (existingSlugs[slug] && !force) {
      summary.skipped++;
      summary.notes.push({ slug: slug, status: 'skipped (already in Sheet)', title: it.title });
      Logger.log('SKIP (already in Sheet): ' + slug);
      return;
    }

    // Scrape the post page for the full body.
    let scrape;
    try {
      const postHtml = UrlFetchApp.fetch(it.link, { muteHttpExceptions: true }).getContentText();
      scrape = extractWixPostBody_(postHtml);
    } catch (err) {
      Logger.log('FAIL fetch: ' + slug + ' — ' + err);
      summary.failed++;
      summary.notes.push({ slug: slug, status: 'fetch failed', error: String(err) });
      return;
    }
    if (!scrape || !scrape.html) {
      Logger.log('FAIL parse: ' + slug + ' — no extraction strategy matched');
      summary.failed++;
      summary.notes.push({ slug: slug, status: 'parse failed', title: it.title });
      return;
    }
    Logger.log('OK ' + slug + ' (strategy: ' + scrape.strategy + ', ' + scrape.html.length + ' chars)');

    const row = [
      slug,
      it.title,
      it.pubDate ? new Date(it.pubDate).toISOString().slice(0, 10) : '',
      it.author || 'Patrick Simms',
      it.heroImage || '',
      it.description || makeExcerpt_(scrape.html, 220),
      scrape.html,
      '',           // tags — Wix RSS doesn't carry them; Pat fills in by hand
      wixSlug,
      true,         // published
    ];

    if (dryRun) {
      summary.notes.push({ slug: slug, status: 'would import', strategy: scrape.strategy,
                           bodyChars: scrape.html.length, preview: scrape.html.slice(0, 200) });
    } else if (force && existingSlugs[slug]) {
      // Re-import: overwrite the existing row in place so we don't
      // disturb its position or any manual edits to other columns.
      // We only refresh the columns derived from Wix; keep tags +
      // wix_slug + published in the existing row untouched (tags is
      // user-edited, wix_slug never changes, published may have been
      // toggled).
      const r = existingRowBySlug[slug];
      sh.getRange(r, 2).setValue(it.title);                         // title
      sh.getRange(r, 3).setValue(it.pubDate ? new Date(it.pubDate).toISOString().slice(0, 10) : '');
      sh.getRange(r, 4).setValue(it.author || 'Patrick Simms');
      sh.getRange(r, 5).setValue(it.heroImage || '');
      sh.getRange(r, 6).setValue(it.description || makeExcerpt_(scrape.html, 220));
      sh.getRange(r, 7).setValue(scrape.html);
      summary.notes.push({ slug: slug, status: 're-imported', strategy: scrape.strategy,
                           bodyChars: scrape.html.length });
    } else {
      sh.appendRow(row);
      summary.notes.push({ slug: slug, status: 'imported', strategy: scrape.strategy,
                           bodyChars: scrape.html.length });
    }
    summary.imported++;
  });

  Logger.log('Done: ' + JSON.stringify({ total: summary.total, imported: summary.imported,
                                         skipped: summary.skipped, failed: summary.failed }));
  return summary;
}

// ─── RSS parsing (regex, not XmlService — see note above) ─────────────
function extractRssItems_(xml) {
  const out = [];
  const itemRe = /<item\b[\s\S]*?<\/item>/g;
  const items = xml.match(itemRe) || [];
  items.forEach(function(block) {
    out.push({
      title:       cdata_(pluck_(block, /<title>([\s\S]*?)<\/title>/)),
      link:        (pluck_(block, /<link>([\s\S]*?)<\/link>/) || '').trim(),
      pubDate:     (pluck_(block, /<pubDate>([\s\S]*?)<\/pubDate>/) || '').trim(),
      author:      cdata_(pluck_(block, /<dc:creator>([\s\S]*?)<\/dc:creator>/)),
      description: stripTags_(cdata_(pluck_(block, /<description>([\s\S]*?)<\/description>/))),
      heroImage:   pluck_(block, /<enclosure[^>]*\burl="([^"]+)"/) || '',
    });
  });
  return out;
}

function pluck_(s, re) { const m = s.match(re); return m ? m[1] : ''; }
function cdata_(s) { return String(s || '').replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '').trim(); }
function stripTags_(s) { return String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }
function wixSlugFromLink_(link) {
  const m = String(link || '').match(/\/post\/([^\/?#]+)/);
  return m ? m[1] : '';
}
function makeExcerpt_(html, maxChars) {
  const text = stripTags_(html);
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars).replace(/\s+\S*$/, '') + '…';
}

// ─── Body extractor: 3 strategies, first match wins ───────────────────
//
// Wix's blog DOM has shifted over time. Rather than depend on one
// selector, we try the most-reliable patterns in order and report which
// one worked (so we can iterate if the first run misses).
function extractWixPostBody_(html) {
  // Strategy 1 — JSON-LD articleBody. Wix embeds a BlogPosting schema in
  // a <script type="application/ld+json"> block. articleBody is plain
  // text (no HTML formatting), but it's the most reliable signal that
  // we've located the right content if other strategies fail.
  const ldMatch = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g) || [];
  for (let i = 0; i < ldMatch.length; i++) {
    const inner = ldMatch[i].replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
    try {
      const data = JSON.parse(inner);
      const list = Array.isArray(data) ? data : [data];
      for (let j = 0; j < list.length; j++) {
        const d = list[j] || {};
        if ((d['@type'] === 'BlogPosting' || d['@type'] === 'Article') && d.articleBody) {
          // Wrap paragraphs so the rendered post still has structure.
          const paras = String(d.articleBody)
            .split(/\n{2,}/)
            .map(function(p){ return '<p>' + p.trim().replace(/\n/g, '<br>') + '</p>'; })
            .filter(function(p){ return p !== '<p></p>'; })
            .join('\n');
          return { strategy: 'json-ld', html: paras };
        }
      }
    } catch (e) { /* try next ld+json block */ }
  }

  // Strategy 2 — <div data-hook="post-description">. The container Wix
  // uses for the rendered rich-text body. Has formatting preserved.
  const dh = sliceBalanced_(html, /<div[^>]*data-hook="post-description"[^>]*>/);
  if (dh) return { strategy: 'data-hook=post-description', html: cleanBody_(dh) };

  // Strategy 3 — <article>. HTML5 fallback; Wix sometimes wraps the
  // rendered post in this. Less reliable because it can include
  // share/comment widgets, but usable.
  const am = html.match(/<article\b[\s\S]*?<\/article>/);
  if (am) return { strategy: 'article', html: cleanBody_(am[0]) };

  return null;
}

// Return everything between the matched opening tag and its balanced
// closing </div>. Walks tag-by-tag to avoid mis-matching on nested divs.
function sliceBalanced_(html, openRe) {
  const m = html.match(openRe);
  if (!m) return null;
  const start = m.index + m[0].length;
  let depth = 1, i = start;
  const tagRe = /<\/?div\b[^>]*>/g;
  tagRe.lastIndex = start;
  let t;
  while ((t = tagRe.exec(html))) {
    if (t[0].slice(0, 2) === '</') {
      depth--;
      if (depth === 0) return html.slice(start, t.index);
    } else if (t[0].slice(-2) !== '/>') {
      depth++;
    }
    i = tagRe.lastIndex;
  }
  return null;
}

// Remove Wix-specific noise from the extracted body — share buttons,
// engagement widgets, tracking pixels, etc. Keeps semantic tags.
function cleanBody_(html) {
  let s = String(html);

  // Pass 1 — kill obvious script/style/widget chrome.
  s = s.replace(/<script\b[\s\S]*?<\/script>/gi, '')
       .replace(/<style\b[\s\S]*?<\/style>/gi, '')
       .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, '');

  // Pass 2 — kill structural Wix chrome blocks. The <article> Wix
  // serves wraps the post body in a <header> (title/date/share button)
  // and <footer> (social-share buttons), with image-expand <button>
  // controls scattered through. None of that belongs in our render.
  s = stripTagBlock_(s, 'header');
  s = stripTagBlock_(s, 'footer');
  s = stripTagBlock_(s, 'button');
  s = stripTagBlock_(s, 'svg');
  // <iframe> — embedded video / Wix widgets. Drop for now; phase-4 image
  // migration will revisit if any post needs an embed back.
  s = stripTagBlock_(s, 'iframe');
  // <canvas> — Wix uses these as low-quality image placeholders that
  // its client JS draws on. Without the JS they render as blank/blurry
  // boxes above each real image.
  s = stripTagBlock_(s, 'canvas');

  // Pass 3 — unwrap Wix custom elements + multi-source picture wraps.
  // <wow-image> wraps every <img>. Keep the inner img.
  s = s.replace(/<wow-image[^>]*>([\s\S]*?)<\/wow-image>/gi, '$1');
  // Belt-and-braces: any remaining <wow-*> custom elements (wow-iframe,
  // wow-video, wow-canvas, etc) — drop the wrapper, keep contents.
  s = s.replace(/<wow-([a-z-]+)[^>]*>([\s\S]*?)<\/wow-\1>/gi, '$2');
  // <picture> wraps an <img> plus one-or-more <source> elements with
  // alternate format/size URLs. Browsers pick a <source> they support
  // and ignore the <img>. The LQIP blurry-box above the real photo is
  // typically rendered from a low-quality <source>. Strip <source>
  // tags entirely, then unwrap <picture> to leave just the <img>.
  s = s.replace(/<source\b[^>]*\/?>/gi, '');
  s = s.replace(/<picture[^>]*>([\s\S]*?)<\/picture>/gi, '$1');

  // Pass 3.5 — strip Wix LQIP previews via media-hash deduplication.
  // Wix sometimes serves both a low-quality preview AND the real image
  // as separate <img> tags pointing to the SAME source asset at
  // different sizes. They share the {hash}~mv2 segment in the URL, so
  // we group all wixstatic imgs by hash and keep only the largest in
  // each group. Imgs that don't pair with a larger sibling are always
  // kept — no false positives on legitimately small content art.
  s = dedupeWixImages_(s);
  // Belt-and-braces: drop standalone Wix imgs at LQIP-only sizes
  // (w_<50). At those dimensions there's no plausible content use,
  // they're always preview thumbnails — even when not paired.
  s = s.replace(
    /<img\b[^>]*\bsrc="https?:\/\/[^"]*\.wixstatic\.com\/[^"]*\bw_(\d+)[^"]*"[^>]*\/?>/gi,
    function(match, w) { return parseInt(w, 10) < 50 ? '' : match; }
  );

  // Pass 4 — unwrap Wix internal hashtag/tag archive links. They point
  // to /road-trips/hashtags/N which doesn't exist on Cloudflare.
  s = s.replace(/<a [^>]*href="[^"]*\/(?:hashtags|tags)\/[^"]*"[^>]*>([\s\S]*?)<\/a>/gi, '$1');

  // Pass 5 — strip presentation-only line breaks Wix injects between
  // rich-text blocks. Real <br> tags inside paragraphs are kept.
  s = s.replace(/<br[^>]*role="presentation"[^>]*\/?>/gi, '');

  // Pass 6 — strip noise attributes from every remaining tag.
  s = s.replace(/\s+data-[a-z-]+="[^"]*"/gi, '')
       .replace(/\s+aria-[a-z-]+="[^"]*"/gi, '')
       .replace(/\s+class="[^"]*"/gi, '')
       .replace(/\s+style="[^"]*"/gi, '')
       .replace(/\s+id="[^"]*"/gi, '')
       .replace(/\s+(?:dir|tabindex|role|draggable|title)="[^"]*"/gi, '');

  // Pass 7 — flatten redundant <span> nesting. After attribute strip,
  // most spans have no attrs and are pure rich-text noise.
  for (let i = 0; i < 6; i++) {
    const before = s;
    s = s.replace(/<span\s*>([\s\S]*?)<\/span>/gi, '$1');
    if (s === before) break;
  }

  // Pass 8 — drop empty containers (after content has been stripped).
  for (let i = 0; i < 5; i++) {
    const before = s;
    s = s.replace(/<(div|section|figure|p)>\s*<\/\1>/gi, '');
    if (s === before) break;
  }

  // Pass 9 — whitespace tidy.
  s = s.replace(/[\t ]+\n/g, '\n')
       .replace(/\n{3,}/g, '\n\n')
       .trim();

  return s;
}

// Remove every <tag>...</tag> block, including ones whose contents
// straddle nested same-name tags (rare, but we loop until stable).
// Self-closing variants (<svg .../>) handled at the end.
function stripTagBlock_(s, tag) {
  const blockRe = new RegExp('<' + tag + '\\b[^>]*>[\\s\\S]*?<\\/' + tag + '>', 'gi');
  let prev;
  do {
    prev = s;
    s = s.replace(blockRe, '');
  } while (s !== prev);
  s = s.replace(new RegExp('<' + tag + '\\b[^>]*\\/>', 'gi'), '');
  return s;
}

// Drop wixstatic.com <img> tags that have a larger sibling pointing at
// the same source asset. Wix URLs encode the source as
//   https://static.wixstatic.com/media/{hash}~mv2.{ext}/v1/fill/w_{W},...
// The {hash} segment is unique per uploaded image. If two imgs share
// the hash but render at different widths, the smaller is the LQIP
// preview — safe to drop.
function dedupeWixImages_(html) {
  const re = /<img\b[^>]*\bsrc="https?:\/\/[^"]*\.wixstatic\.com\/media\/([^~"]+)~mv2[^"]*\bw_(\d+)[^"]*"[^>]*\/?>/gi;
  const imgs = [];
  let m;
  while ((m = re.exec(html))) {
    imgs.push({ tag: m[0], hash: m[1], width: parseInt(m[2], 10) });
  }
  if (imgs.length < 2) return html;

  const maxByHash = {};
  imgs.forEach(function(img) {
    if (!(img.hash in maxByHash) || img.width > maxByHash[img.hash]) {
      maxByHash[img.hash] = img.width;
    }
  });

  // Tags to remove are smaller-than-max for their hash. Use a Set to
  // avoid double-stripping when the same exact tag string appears more
  // than once.
  const toRemove = {};
  imgs.forEach(function(img) {
    if (img.width < maxByHash[img.hash]) toRemove[img.tag] = true;
  });

  let s = html;
  Object.keys(toRemove).forEach(function(tag) {
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(new RegExp(escaped, 'g'), '');
  });
  return s;
}

// Retroactive cleanup pass for already-imported Blog rows. Runs the
// updated cleanBody_ over each row's body_html and writes the cleaned
// result back. Idempotent — re-running produces the same output.
//
// Use after cleanBody_ improves to back-propagate fixes without
// re-importing from Wix.
function cleanBlogBodies() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('Blog');
  if (!sh) { Logger.log('No Blog tab — run importWixPosts first'); return; }
  const lastRow = sh.getLastRow();
  if (lastRow < 2) { Logger.log('Blog tab is empty'); return; }

  const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
    .map(function(h){ return String(h); });
  const slugCol = header.indexOf('slug');
  const bodyCol = header.indexOf('body_html');
  if (slugCol === -1 || bodyCol === -1) {
    Logger.log('Blog tab missing slug or body_html column');
    return;
  }

  const rows = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
  const stats = { total: rows.length, cleaned: 0, unchanged: 0 };

  rows.forEach(function(r, i) {
    const before = String(r[bodyCol] || '');
    const after  = cleanBody_(before);
    if (after !== before) {
      sh.getRange(i + 2, bodyCol + 1).setValue(after);
      Logger.log('Cleaned ' + r[slugCol] + ' (' + before.length + ' → ' + after.length + ' chars)');
      stats.cleaned++;
    } else {
      stats.unchanged++;
    }
  });

  Logger.log('Done: ' + JSON.stringify(stats));
  return stats;
}

// Apply the latest SiteConfig grouping (banner separator rows from
// getTabDefs) to the existing SiteConfig tab without losing any edits.
//
// Behaviour:
//   1. Read every existing key/value pair off the SiteConfig tab.
//      Skip current banner rows (key starts with "──") so we don't
//      duplicate them — banners come fresh from the schema.
//   2. Walk the schema's row list in order. For each non-banner key:
//      use the current Sheet value if one exists, else the schema
//      default. For banner rows: pass them through verbatim.
//   3. Append schema-new keys (added since last run) at the end under
//      a "── NEWLY ADDED ──" banner so they're easy to spot.
//   4. Append any orphan keys still in the Sheet but no longer in the
//      schema (custom keys Pat added) under a "── CUSTOM ──" banner
//      so they're preserved, not silently lost.
//   5. Clear and re-write the SiteConfig tab.
//
// Run from the Apps Script editor's function dropdown: reorganizeSiteConfig.
function reorganizeSiteConfig() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('SiteConfig');
  if (!sh) { Logger.log('No SiteConfig tab. Run updateSheet() first.'); return; }

  const lastRow = sh.getLastRow();
  if (lastRow < 2) { Logger.log('SiteConfig is empty.'); return; }

  // 1) Capture current values, ignoring banner rows.
  const rows = sh.getRange(2, 1, lastRow - 1, 2).getValues();
  const currentByKey = {};
  rows.forEach(function(r) {
    const k = String(r[0] || '').trim();
    if (!k || k.indexOf('──') === 0) return;
    currentByKey[k] = r[1];
  });

  // 2) Walk schema rows. Banners pass through; data rows take the
  //    Sheet value when present, else schema default.
  const schemaRows = getTabDefs().SiteConfig.rows;
  const seenKeys = {};
  const out = [];
  schemaRows.forEach(function(r) {
    const k = String(r[0] || '').trim();
    if (!k) return;
    if (k.indexOf('──') === 0) {
      out.push([k, '']);
    } else {
      const value = (k in currentByKey) ? currentByKey[k] : r[1];
      out.push([k, value]);
      seenKeys[k] = true;
    }
  });

  // 3 + 4) Surface orphan keys at the bottom under a CUSTOM banner.
  const orphans = Object.keys(currentByKey).filter(function(k){ return !seenKeys[k]; });
  if (orphans.length) {
    out.push(['── CUSTOM (keys added by hand — keep, rename, or remove) ──', '']);
    orphans.forEach(function(k){ out.push([k, currentByKey[k]]); });
  }

  // 5) Re-write the tab. Header stays put; we only rewrite from row 2.
  sh.getRange(2, 1, lastRow - 1, 2).clearContent();
  sh.getRange(2, 1, out.length, 2).setValues(out);

  Logger.log('Reorganized SiteConfig: '
             + (schemaRows.length) + ' schema rows, '
             + Object.keys(currentByKey).length + ' values preserved, '
             + orphans.length + ' orphans saved at bottom.');
  return { reorganized: true, valuesPreserved: Object.keys(currentByKey).length, orphans: orphans.length };
}

function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tabs = getTabDefs();

  let totalRows = 0;
  Object.keys(tabs).forEach(function(name) {
    const def = tabs[name];
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    sh.clear();
    const all = [def.header].concat(def.rows);
    sh.getRange(1, 1, all.length, def.header.length).setValues(all);
    styleHeader_(sh, def.header.length);
    sh.autoResizeColumns(1, def.header.length);
    totalRows += def.rows.length;
    console.log('  ✓ ' + name + ' — ' + def.rows.length + ' rows');
  });

  console.log('Done. Seeded ' + Object.keys(tabs).length + ' tabs / ' + totalRows + ' rows.');
  console.log('Test the API:  open the /exec URL — tiles[] should now have content.');
}

/**
 * updateSheet — NON-DESTRUCTIVE sync.
 *
 * Run this whenever the schema in getTabDefs() picks up new tabs, new
 * columns, or new SiteConfig/Pages rows. Existing data is preserved:
 *
 *  • Tab missing in your sheet            → create it + seed default rows.
 *  • Tab exists but empty (header only)   → seed default rows.
 *  • Tab exists with data:
 *      - Add any missing columns to the right (header only — no row data).
 *      - For SiteConfig / Pages / Photos / Accessories (keyed tabs),
 *        append seed rows whose key/slug/id isn't already in the sheet.
 *        Existing rows are never modified or reordered.
 *      - For row-list tabs (TrustStrip, Services, Steps, Sections,
 *        *_Tiles, *_Submenus) the existing rows are left alone — the
 *        defaults you see in getTabDefs() are NOT re-appended, since
 *        you're expected to be curating those rows yourself.
 *
 * Safe to re-run as often as you like.
 */
function updateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tabs = getTabDefs();
  const KEYED = { 'SiteConfig': 'key', 'Pages': 'slug', 'Photos': 'key', 'Accessories': 'id' };
  const stats = { created: 0, seededEmpty: 0, addedCols: 0, addedRows: 0, untouched: 0 };

  Object.keys(tabs).forEach(function(name) {
    const def = tabs[name];
    let sh = ss.getSheetByName(name);

    // 1) Tab missing — create it and seed defaults.
    if (!sh) {
      sh = ss.insertSheet(name);
      const all = [def.header].concat(def.rows);
      sh.getRange(1, 1, all.length, def.header.length).setValues(all);
      styleHeader_(sh, def.header.length);
      sh.autoResizeColumns(1, def.header.length);
      stats.created++;
      console.log('+ Created tab: ' + name + ' (' + def.rows.length + ' rows)');
      return;
    }

    // 2) Tab exists but is empty — seed defaults.
    const lastRow = sh.getLastRow();
    const lastCol = Math.max(1, sh.getLastColumn());
    const firstCell = sh.getRange(1, 1).getValue();
    if (lastRow === 0 || (lastRow === 1 && firstCell === '' && lastCol === 1)) {
      sh.clear();
      const all = [def.header].concat(def.rows);
      sh.getRange(1, 1, all.length, def.header.length).setValues(all);
      styleHeader_(sh, def.header.length);
      sh.autoResizeColumns(1, def.header.length);
      stats.seededEmpty++;
      console.log('+ Seeded empty tab: ' + name + ' (' + def.rows.length + ' rows)');
      return;
    }

    // 3) Tab exists with data — only ADD missing pieces.
    const existingHeader = sh.getRange(1, 1, 1, lastCol).getValues()[0]
      .map(function(h){ return String(h); });
    const missingCols = def.header.filter(function(h){
      return existingHeader.indexOf(h) === -1;
    });
    if (missingCols.length) {
      sh.getRange(1, lastCol + 1, 1, missingCols.length).setValues([missingCols]);
      styleHeader_(sh, lastCol + missingCols.length);
      stats.addedCols += missingCols.length;
      console.log('· ' + name + ': added ' + missingCols.length + ' column(s): ' + missingCols.join(', '));
    }

    // For keyed tabs, append rows whose key/slug isn't already present.
    const keyCol = KEYED[name];
    if (keyCol) {
      const finalHeader = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
        .map(function(h){ return String(h); });
      const keyIdx    = finalHeader.indexOf(keyCol);
      const defKeyIdx = def.header.indexOf(keyCol);
      if (keyIdx !== -1 && defKeyIdx !== -1) {
        const existingKeys = sh.getLastRow() > 1
          ? sh.getRange(2, keyIdx + 1, sh.getLastRow() - 1, 1).getValues()
              .map(function(r){ return String(r[0]).trim(); })
          : [];
        const newRows = def.rows.filter(function(row){
          const k = String(row[defKeyIdx] || '').trim();
          return k && existingKeys.indexOf(k) === -1;
        });
        if (newRows.length) {
          // Map each seed row from def.header order → sheet header order.
          const padded = newRows.map(function(row){
            return finalHeader.map(function(h){
              const i = def.header.indexOf(h);
              return i === -1 ? '' : row[i];
            });
          });
          sh.getRange(sh.getLastRow() + 1, 1, padded.length, finalHeader.length).setValues(padded);
          stats.addedRows += padded.length;
          console.log('· ' + name + ': appended ' + padded.length + ' new ' + keyCol + ' row(s)');
        }
      }
    }

    if (!missingCols.length && !KEYED[name]) stats.untouched++;
  });

  console.log('Done. Created ' + stats.created + ' tab(s), seeded ' + stats.seededEmpty +
              ' empty tab(s), added ' + stats.addedCols + ' column(s), appended ' +
              stats.addedRows + ' SiteConfig/Pages row(s).');
  console.log('Row-list tabs (TrustStrip, Services, Steps, Sections, *_Tiles, *_Submenus) were left untouched.');
}
