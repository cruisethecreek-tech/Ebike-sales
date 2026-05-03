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

  // Site-wide trust strip rendered on every brand page (heybike, velotric,
  // mooncool, jasion). Same four cards across all four — edit once here.
  const trustStrip = readSheet(ss, 'TrustStrip')
    .sort(function(a, b){ return (a.order || 0) - (b.order || 0); });

  // creek-ready hub: the three service cards and the three "Simple as 1-2-3" steps.
  const services = readSheet(ss, 'Services')
    .sort(function(a, b){ return (a.order || 0) - (b.order || 0); });
  const steps = readSheet(ss, 'Steps')
    .sort(function(a, b){ return (a.order || 0) - (b.order || 0); });

  const data = {
    page:       page,
    pageMeta:   pageMeta,
    site:       site,
    sections:   sections,
    trustStrip: trustStrip,
    services:   services,
    steps:      steps,
    tiles:      readSheet(ss, cap + '_Tiles'),
    submenus:   groupBy(readSheet(ss, cap + '_Submenus'), 'tile'),
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
          'Text 330-406-9682',
          'sms:3304069682',
          false,
          'Email Us',
          'mailto:salesteam@cruisethecreek.com',
          false,
        ],
      ],
    },
    'SiteConfig': {
      header: ['key','value'],
      rows: [
        ['footer_tagline',     'Electric bikes built for creek country. Ride the trails, beat the heat, get home grinning.'],
        ['footer_copyright',   '© 2026 Cruise the Creek. All rights reserved.'],
        ['social_instagram',   ''],
        ['social_facebook',    ''],
        ['social_tiktok',      ''],
        ['social_youtube',     ''],
        ['creek_tuneup_url',   'tune-ups.html'],
        ['creek_tuneup_external', false],
        ['creek_setup_url',    'assembly.html'],
        ['creek_setup_external', false],
        ['creek_video_url',    'video-diagnostics.html'],
        ['creek_video_external', false],
        // creek-ready hub: top-left logo (link + text)
        ['logo_url',           'creek-ready.html'],
        ['logo_external',      false],
        ['logo_mark',          'CTC'],
        ['logo_text',          'Cruise'],
        ['logo_text_em',       'the Creek'],
        // creek-ready hub: nav CTA
        ['shop_ebikes_label',  'Shop E-Bikes'],
        ['shop_ebikes_url',    'https://www.cruisethecreek.com/shop-fix'],
        ['shop_ebikes_external', true],
        // creek-ready hub: authorized brand links
        ['brand_heybike_url',  'heybike.html'],
        ['brand_heybike_external', false],
        ['brand_velotric_url', 'velotric.html'],
        ['brand_velotric_external', false],
        ['brand_jasion_url',   'jasion.html'],
        ['brand_jasion_external', false],
        // creek-ready hub: footer links
        ['faq_url',            'faqs.html'],
        ['faq_external',       false],
        ['policies_url',       'https://www.cruisethecreek.com/cancellation-policy'],
        ['policies_external',  true],
        ['our_story_url',      'our-story.html'],
        ['our_story_external', false],
        // creek-ready hub: section headings & contact items
        ['services_eyebrow',   'Our Services'],
        ['services_title',     'Three Ways We Keep You Rolling'],
        ['services_intro',     "Whether you need hands-on maintenance, a professional build, or expert guidance from anywhere — we've got you covered."],
        ['how_eyebrow',        'How It Works'],
        ['how_title',          'Simple as 1-2-3'],
        ['how_intro',          "Getting service for your e-bike shouldn't be complicated."],
        ['brands_label',       'Authorized Dealer & Factory-Trained Service'],
        ['cta_text_label',     '💬 Text: 330-406-9682'],
        ['cta_text_url',       'sms:3304069682'],
        ['cta_email_label',    '✉️ salesteam@cruisethecreek.com'],
        ['cta_email_url',      'mailto:salesteam@cruisethecreek.com'],
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
        ['our-story',  3, '', 'photo-pair', '',
          'Riding an e-bike, enjoying a lemonade.|Mill Creek Park, Youngstown.',
          'riding-e-bike-lemonade.jpg|mill-creek-park-ebikes.jpg'],
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
