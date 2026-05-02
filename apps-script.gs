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
  const page = ((e && e.parameter && e.parameter.page) || 'home')
                 .toString().trim().toLowerCase();
  const cap  = page.charAt(0).toUpperCase() + page.slice(1);

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Per-page hero/cta/section copy (Pages tab).
  const pages = readSheet(ss, 'Pages');
  const pageMeta = pages.find(function(r){
    return String(r.slug || '').trim().toLowerCase() === page;
  }) || {};

  // Site-wide key/value pairs (SiteConfig tab).
  const site = {};
  readSheet(ss, 'SiteConfig').forEach(function(r){
    if (r.key) site[String(r.key).trim()] = r.value;
  });

  // Long-form section rows for this page (Sections tab).
  const sections = readSheet(ss, 'Sections')
    .filter(function(r){
      return String(r.page || '').trim().toLowerCase() === page;
    })
    .sort(function(a, b){ return (a.order || 0) - (b.order || 0); });

  const data = {
    page:     page,
    pageMeta: pageMeta,
    site:     site,
    sections: sections,
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

/**
 * One-time setup. Run from the Apps Script editor:
 *   1. Save this file.
 *   2. From the function dropdown, pick `setupSheet`.
 *   3. Click ▶ Run.  Approve the prompts.
 *   4. Done — open the bound Sheet to confirm four new tabs.
 *
 * Re-running is safe: it clears and re-seeds the four tabs.
 * Once seeded, edit the cells directly to change what shows up
 * on home.html and shop.html. Changes appear after Google's
 * ~5-min CDN cache expires (open the /exec URL to bust faster).
 */
function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const tabs = {
    'Home_Tiles': {
      header: ['id','order','label','subtitle','type','url','external'],
      rows: [
        ['adventures', 1, 'Adventures', 'Guided rides & maps',                'link', 'https://adventure-map.pages.dev/v2', true],
        ['rentals',    2, 'Rentals',    'Day rides, ownership & long term',   'link', 'rentals.html',                        false],
        ['shop',       3, 'Shop',       'Browse bikes & gear',                'link', 'shop.html',                           false],
        ['services',   4, 'Services',   'Tune-ups & creek prep',              'menu', '',                                    false],
        ['test-rides', 5, 'Test Rides', 'Try before you buy',                 'link', 'test-ride.html',                      false],
        ['creek-life', 6, 'Creek Life', 'Stories, events, more',              'menu', '',                                    false],
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
      header: ['id','order','label','subtitle','type','url','external','badge'],
      rows: [
        ['adventures', 1, 'Adventures',     'Guided rides through Mill Creek Park',     'link', 'adventures.html',           false, ''],
        ['trailside',  2, 'Trailside',      'Pickup at Kirk Road Trailhead, Canfield',  'link', 'trailside.html',            false, ''],
        ['bridge',     3, 'Bridge the Gap', 'Own the bike after 15 bi-weekly payments', 'link', 'bridge-the-gap.html',       false, ''],
        ['long-term',  4, 'Long Term',      'Multi-month plans (coming soon)',          'link', 'long-term-rental.html',     false, 'Coming Soon'],
      ],
    },
    'Rentals_Submenus': {
      header: ['tile','order','label','url','external'],
      rows: [],
    },
    'Shop_Tiles': {
      header: ['id','order','label','subtitle','type','url','external'],
      rows: [
        ['heybike',  1, 'Heybike',  'Affordable, easygoing rides', 'link', 'heybike.html',  false],
        ['velotric', 2, 'Velotric', 'Sleek, premium e-bikes',      'link', 'velotric.html', false],
        ['jasion',   3, 'Jasion',   'Trail-ready power',           'link', 'jasion.html',   false],
        ['mooncool', 4, 'Mooncool', 'Three-wheel comfort',         'link', 'mooncool.html', false],
        ['apparel',  5, 'Apparel',  'Tees, caps & ride threads',   'link', 'apparel.html',  false],
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
          "Text Dru and we'll point you the right way.",
          '',
          'Text 330-406-9682',
          'sms:3304069682',
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
      ],
    },
    'SiteConfig': {
      header: ['key','value'],
      rows: [
        ['footer_tagline',   'Electric bikes built for creek country. Ride the trails, beat the heat, get home grinning.'],
        ['footer_copyright', '© 2026 Cruise the Creek. All rights reserved.'],
        ['social_instagram', ''],
        ['social_facebook',  ''],
        ['social_tiktok',    ''],
        ['social_youtube',   ''],
      ],
    },
    'Sections': {
      header: ['page','order','type','title','body','extra'],
      rows: [
        // ── Our Story ────────────────────────────────────────────────
        ['our-story',  1, 'eyebrow',    'Where it began', '', ''],
        ['our-story',  2, 'h2',         'Remember those neighborhood lemonade stands?', '', ''],
        ['our-story',  3, 'photo-pair', '',
          'Riding an e-bike, enjoying a lemonade.|Mill Creek Park, Youngstown.',
          'riding-e-bike-lemonade.jpg|mill-creek-park-ebikes.jpg'],
        ['our-story',  4, 'lead', '',
          "They were simple. Honest. They were run by kids who understood something we adults often forget: **the best things in life are meant to be shared.**", ''],
        ['our-story',  5, 'body', '',
          "I grew up with those stands in mind. But during the pandemic, when screens became our default escape, I realized my two sons -- 16 and 13 -- were living a life disconnected from the world right outside our window. Across the street sat 2,658 acres of **Mill Creek Park**: trails, hills, lakes, and hidden beauty that most of us just drive past.", ''],
        ['our-story',  6, 'body', '', "That's when it clicked.", ''],
        ['our-story',  7, 'pullquote', '',
          'Cruise The Creek became my lemonade stand. Not for profit -- for possibility.', ''],

        ['our-story', 10, 'eyebrow',   'Why we ride', '', ''],
        ['our-story', 11, 'h2',        'Why E-Bikes Change Everything', '', ''],
        ['our-story', 12, 'body', '',
          "If you've ever driven through Mill Creek Park, you know why most of it goes unseen. The best parts aren't accessible by car. The steep hills can be punishing. On a regular bike, you're often so focused on the \"burn\" that you miss the view.", ''],
        ['our-story', 13, 'body', '', '**E-bikes change the equation.**', ''],
        ['our-story', 14, 'body', '',
          "You get to choose: pedal hard, or cruise easy. Climb the steepest hills without the suffering. You get to actually *see* the park instead of just passing through it. It's the freedom to explore without limits.", ''],
        ['our-story', 15, 'callout',   'Adventure Awaits',
          "Pick a route, pick a ride -- we'll meet you on the trail.", ''],

        ['our-story', 20, 'divider', 'The Story', '', ''],

        ['our-story', 21, 'date',  'April 30, 2022', '', ''],
        ['our-story', 22, 'h2',    'The Turning Point', '', ''],
        ['our-story', 23, 'body', '',
          "After nearly 15 years at ALDI, my road there ended. I'd poured everything into that role -- leadership, efficiency, and adapting under the pressure of a global pandemic. But I saw things differently. I believed in pushing limits and leading with an entrepreneurial mindset, and eventually, those paths diverged.", ''],
        ['our-story', 24, 'body', '',
          "At first, it felt like the floor had been pulled out from under me. But the truth was, my body was already feeling the toll. Years on hard floors in steel-toe shoes had left me with sciatica that made my daily commute brutal. My family was paying the price too -- juggling 10-hour shifts while relying on my parents just to get the kids to school.", ''],
        ['our-story', 25, 'pullquote', '',
          "The departure wasn't the end. It was the space I needed to actually begin.", ''],

        ['our-story', 30, 'date',  'June 6, 2022', '', ''],
        ['our-story', 31, 'h2',    'The Sarasota Epiphany', '', ''],
        ['our-story', 32, 'body', '',
          "We had just moved into our dream home right across from Mill Creek MetroParks. During a trip to Florida, standing in a parking lot in Sarasota, it hit me: I'd spent 15 years working and missed too much. My oldest was already 15. My parents were aging. Time wasn't something I could manufacture.", ''],
        ['our-story', 33, 'body', '',
          "Every morning on that trip, I walked to the beach before sunrise to think. I saw tourists and locals cruising on e-bikes along the coast -- laughing, exploring, and actually **living the moment** instead of rushing through it.", ''],
        ['our-story', 34, 'body', '',
          "I rushed back to the beach house and told my wife. The idea caught fire instantly. By the time we got back to Youngstown, our first e-bikes were waiting.", ''],

        ['our-story', 40, 'eyebrow', 'Our mission', '', ''],
        ['our-story', 41, 'h2',      'Time matters. Experiences matter.', '', ''],
        ['our-story', 42, 'body', '',
          "Cruise The Creek didn't start with a boardroom business plan. It started with a realization: sometimes the best opportunities are right in front of you -- you just need a new way to see them.", ''],
        ['our-story', 43, 'body', '', '**Our mission is simple. We want you to:**', ''],
        ['our-story', 44, 'list-item', 'Get outside.',  '', ''],
        ['our-story', 45, 'list-item', 'Explore more.', '', ''],
        ['our-story', 46, 'list-item', 'Slow down.',    '', ''],
        ['our-story', 47, 'list-item', 'Reconnect',     '-- with nature, your family, and your community.', ''],
        ['our-story', 48, 'body', '',
          "All we ask? Take care of the bikes. Enjoy the ride. And if it makes you smile -- tell someone else.", ''],
        ['our-story', 49, 'pullquote', '',
          'Just like a lemonade stand, the best things in life are meant to be shared.', ''],
      ],
    },
  };

  let totalRows = 0;
  Object.keys(tabs).forEach(function(name) {
    const def = tabs[name];
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    sh.clear();
    const all = [def.header].concat(def.rows);
    sh.getRange(1, 1, all.length, def.header.length).setValues(all);
    sh.getRange(1, 1, 1, def.header.length)
      .setFontWeight('bold')
      .setBackground('#2D4A32')
      .setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.autoResizeColumns(1, def.header.length);
    totalRows += def.rows.length;
    console.log('  ✓ ' + name + ' — ' + def.rows.length + ' rows');
  });

  console.log('Done. Seeded ' + Object.keys(tabs).length + ' tabs / ' + totalRows + ' rows.');
  console.log('Test the API:  open the /exec URL — tiles[] should now have content.');
}
