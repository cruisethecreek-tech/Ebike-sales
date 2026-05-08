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

  // Events page: one row per event, grouped client-side by day.
  const events = readSheet(ss, 'Events');

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
    'Home_Tiles': {
      header: ['id','order','label','subtitle','type','url','external'],
      rows: [
        ['adventures', 1, 'Adventures', 'Guided rides & maps',                'link', 'https://adventure-map.pages.dev/v2', true],
        ['rentals',    2, 'Rentals',    'Day rides, ownership & long term',   'link', 'rentals.html',                        false],
        ['shop',       3, 'Shop',       'Browse bikes & gear',                'link', 'shop.html',                           false],
        ['services',   4, 'Services',   'Tune-ups & creek prep',              'menu', '',                                    false],
        ['test-rides', 5, 'Test Rides', 'Try before you buy',                 'link', 'test-ride.html',                      false],
        ['creek-life', 6, 'Creek Life', 'Stories, events, more',              'menu', '',                                    false],
        ['donate',     7, 'Support',    'Help fuel the ride',                 'link', 'donate.html',                         false],
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
      rows: [
        // ── Contact: two departments ──
        // Info / Rentals / Tours / Sponsorships
        ['info_phone_display',  '330-406-9686'],
        ['info_phone_sms',      'sms:3304069686'],
        ['info_phone_tel',      'tel:+13304069686'],
        ['info_email_label',    'info@cruisethecreek.com'],
        ['info_email_url',      'mailto:info@cruisethecreek.com'],
        // Sales / Test Rides / Repairs
        ['sales_phone_display', '330-406-9682'],
        ['sales_phone_sms',     'sms:3304069682'],
        ['sales_phone_tel',     'tel:+13304069682'],
        ['sales_email_label',   'salesteam@cruisethecreek.com'],
        ['sales_email_url',     'mailto:salesteam@cruisethecreek.com'],
        ['footer_tagline',     'Electric bikes built for creek country. Ride the trails, beat the heat, get home grinning.'],
        ['footer_copyright',   '© 2026 Cruise the Creek. All rights reserved.'],
        // Sales Pro quote card (index.html)
        ['quote_brand_name',    'CRUISE THE CREEK'],
        ['quote_brand_subline', 'Youngstown, Ohio · cruisethecreek.com'],
        ['quote_footer',        'Quote valid 7 days · Cruise the Creek · 330-406-9682'],
        // Hero background images: per-page hero_photo lives in the Pages tab.
        // hero_overlay_opacity (0..1) tints the photo so white text stays
        // readable. Lower = brighter photo, higher = darker forest tint.
        ['hero_overlay_opacity', '0.55'],
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
        ['logo_url',           'home.html'],
        ['logo_external',      false],
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
        // FAQs page: top-of-page safety alert
        ['faqs_alert_title',   'Your safety is our priority'],
        ['faqs_alert_body',    'Please read the Safety & Requirements section before your first ride. New to e-bikes? We recommend the Kirk Road bikeway for your first time — flat, paved, and car-free.'],
        // Bridge the Gap: section labels + application form intro
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
        // Trailside Journeys page (journeys.html)
        ['kirk_image',         ''],
        ['kirk_badge',         'Pickup & Drop-off'],
        ['kirk_title',         'Kirk Road Trailhead'],
        ['kirk_where',         'Canfield, Ohio'],
        ['kirk_body_1',        'This award-winning trailhead provides a fifty-car parking lot, restrooms, water fountains, a picnic pavilion, and a location for educational and trailside activities.'],
        ['kirk_body_2',        'The 11-mile Mill Creek Bikeway is owned and operated by Mill Creek MetroParks — paved and tranquil end to end.'],
        ['kirk_speed',         '15 mph speed limit strictly enforced'],
        ['south_eyebrow',      'Head south'],
        ['south_title',        'Toward Canfield'],
        ['south_intro',        'Wooded paths, working farms, and a hidden playground — gentle southbound rides for any pace.'],
        ['north_eyebrow',      'Head north'],
        ['north_title',        'Toward Austintown & Niles'],
        ['north_intro',        'Iconic overpass bridges, the Niles Greenway, and the McKinley Memorial — push north for a longer ride.'],
        ['hashtag',            '#TrailsideJourney'],
        // Rentals page: vibe-check section header
        ['vibe_eyebrow',       'Vibe check'],
        ['vibe_title',         'Which ride is right for you?'],
        ['vibe_intro',         "New to Mill Creek? Here's the quick guide to picking the right pickup."],
        // Donations page (donate.html)
        ['intro_eyebrow',      'Why we need you'],
        ['intro_title',        'Be a direct part of our growth'],
        ['intro_body',         "To keep providing the high-quality equipment and experiences you've come to expect, we're inviting you to be a direct part of our growth. The future of our local trails is bright, and with your help, we can make the next season our best one yet."],
        ['impact_eyebrow',     'Your impact'],
        ['impact_title',       'Where every dollar goes'],
        ['impact_body',        "Every donation goes directly toward upgrading our fleet and maintaining the essential gear that keeps our operations safe and fun for everyone. This isn't about overhead — it's about ensuring we have the best tools available to serve you."],
        ['thanks_eyebrow',     'Our appreciation'],
        ['thanks_title',       'Thank you, in public'],
        ['thanks_body',        "As a thank you for your support, all donors will be featured on our Supporters Wall below. It's our way of making sure the community knows who helped keep us moving forward."],
        ['give_eyebrow',       'Send a tip'],
        ['give_title',         'Pick the way that works for you'],
        ['give_sub',           'Three options. Any amount helps. We see every transfer.'],
        ['give_foot',          "After you send, drop us a note with how you'd like to appear on the Supporters Wall — first name, full name, business, or anonymous, your call."],
        ['donate_cashapp_url', 'https://cash.app/$ctcsales'],
        ['donate_cashapp_handle', '$ctcsales'],
        ['donate_venmo_url',   'https://account.venmo.com/u/cruisethecreeksales'],
        ['donate_venmo_handle', '@cruisethecreeksales'],
        ['donate_paypal_url',  'https://www.paypal.biz/cruisethecreek'],
        ['donate_paypal_handle', 'paypal.biz/cruisethecreek'],
        ['wall_eyebrow',       'The supporters wall'],
        ['wall_title',         'Thank you, Creek Crew'],
        ['wall_sub',           'The names below kept the wheels turning this season.'],
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
      header: ['order','date_iso','day_label','time','title','venue','category','family_friendly','description','url','lat','lng'],
      rows: [
        // ── Friday, May 1 ──
        [10,  '2026-05-01', 'Friday, May 1',  '4:00 pm – 8:00 pm',  'Food Company Band',                'Twisted Rivets',                          'music',    false, '', '', '', ''],
        [11,  '2026-05-01', '',                '4:00 pm – 10:00 pm', 'Penguin City Brewing Company',     'Penguin City Brewing Company',           'adult',    false, 'Brewery taproom open.', '', '', ''],
        [12,  '2026-05-01', '',                '5:00 pm – 9:00 pm',  'Cinco de Mayo on Phelps Street',   'Phelps Street Gateway',                   'fests',    true,  'Tacos, music, and downtown vibes.', '', '', ''],
        [13,  '2026-05-01', '',                '6:00 pm – 9:00 pm',  'Greek Comedy Show',                'Tisone Wrestling Banquet Center',         'adult',    false, '', '', '', ''],
        [14,  '2026-05-01', '',                '6:00 pm – 9:00 pm',  'Ryan Goodcase',                    'The Apollo Event Center',                 'music',    false, '', '', '', ''],

        // ── Saturday, May 2 ──
        [20,  '2026-05-02', 'Saturday, May 2', '10:00 am – 12:00 pm','Latin Night',                      'The Social',                              'music',    false, '', '', '', ''],
        [21,  '2026-05-02', '',                '10:00 am – 1:00 pm', 'Country Line Dancing',             'Penguin City Brewing Company',           'adult',    false, 'Beginner-friendly, free lessons.', '', '', ''],
        [22,  '2026-05-02', '',                '12:00 pm – 4:00 pm', 'Folkfest Launch Party',            'Yonkos Hall',                             'fests',    true,  '', '', '', ''],
        [23,  '2026-05-02', '',                '5:00 pm – 9:00 pm',  'Halfway to Halloween Horror Fest', 'Ward Beecher Planetarium',                'adult',    false, '', '', '', ''],
        [24,  '2026-05-02', '',                '7:00 pm – 9:00 pm',  'Visitor Appreciation Weekend',     'Mahoning Valley Historical Society',      'edu',      true,  '', '', '', ''],
        [25,  '2026-05-02', '',                '8:00 pm – 11:00 pm', 'Country Line Dancing',             'Penguin City Brewing Company',           'adult',    false, '', '', '', ''],

        // ── Sunday, May 3 ──
        [30,  '2026-05-03', 'Sunday, May 3',   '10:00 am – 1:00 pm', 'BYOB Brunch',                      'Penguin City Brewing Company',           'adult',    false, 'Build-your-own brunch — bring the family.', '', '', ''],
        [31,  '2026-05-03', '',                '11:00 am – 4:00 pm', 'Sensory Sunday',                   'Butler Institute of American Art',       'family',   true,  'Quiet hours and sensory-friendly programming.', '', '', ''],
        [32,  '2026-05-03', '',                '12:00 pm – 5:00 pm', 'Twisted Roots Brunch & Vibe + Live Music', 'Twisted Rivets',                  'music',    false, '', '', '', ''],
        [33,  '2026-05-03', '',                '1:00 pm – 4:00 pm',  'World Press Freedom Day',          'Butler Institute of American Art',       'edu',      false, '', '', '', ''],
        [34,  '2026-05-03', '',                '2:00 pm – 4:00 pm',  'Youth Orchestra Concert',          'Stambaugh Auditorium',                   'arts',     true,  '', '', '', ''],
        [35,  '2026-05-03', '',                '4:00 pm – 7:00 pm',  'The Beauty Legacy Industry Mixer', 'Penguin City Brewing Company',           'adult',    false, '', '', '', ''],

        // ── Tuesday, May 5 ──
        [40,  '2026-05-05', 'Tuesday, May 5',  '6:00 pm – 8:00 pm',  'Workshop: Writing Through Grief',  'Penguin City Brewing Company',           'wellness', false, '', '', '', ''],

        // ── Wednesday, May 6 ──
        [50,  '2026-05-06', 'Wednesday, May 6','6:00 pm – 8:00 pm',  'Mahoning Valley Civic Forum',      'Mahoning Valley Historical Society',     'edu',      false, '', '', '', ''],

        // ── Thursday, May 7 ──
        [60,  '2026-05-07', 'Thursday, May 7', '6:00 pm – 9:00 pm',  'The Hops Conference',              'Covelli Centre',                          'adult',    false, '', '', '', ''],
        [61,  '2026-05-07', '',                '6:00 pm – 11:00 pm', 'Young Friends Adventure 2026',     'Youngstown Country Club',                 'adult',    false, '', '', '', ''],

        // ── Friday, May 16 ──
        [70,  '2026-05-16', 'Friday, May 16',  '4:00 pm – 7:00 pm',  'Food for Thought',                 'Phelps Street Gateway',                   'fests',    true,  '', '', '', ''],
        [71,  '2026-05-16', '',                '5:00 pm – 9:00 pm',  'Trivia Night',                     'Penguin City Brewing Company',           'adult',    false, '', '', '', ''],
        [72,  '2026-05-16', '',                '7:00 pm – 11:00 pm', 'Thirsty Thursday Karaoke',         'Penguin City Brewing Company',           'music',    false, '', '', '', ''],

        // ── Saturday, May 17 ──
        [80,  '2026-05-17', 'Saturday, May 17','9:00 am – 1:00 pm',  'Mahoning Valley Civic Forum',      'Mahoning Valley Historical Society',     'edu',      false, '', '', '', ''],
        [81,  '2026-05-17', '',                '10:00 am – 4:00 pm', 'Young Friends Adventure 2026',     'Youngstown Country Club',                 'family',   true,  '', '', '', ''],
        [82,  '2026-05-17', '',                '12:00 pm – 4:00 pm', 'Country Line Dancing',             'Penguin City Brewing Company',           'adult',    false, '', '', '', ''],
        [83,  '2026-05-17', '',                '1:00 pm – 4:00 pm',  'Live Wire Mickey Cruz Tribute & Space Monkey Aces Mountain Trax Tribute', 'Twisted Rivets', 'music', false, '', '', '', ''],
        [84,  '2026-05-17', '',                '7:30 pm – 9:30 pm',  'Live Music: Ruby — Mountain Soul', 'Twisted Rivets',                          'music',    false, '', '', '', ''],

        // ── Sunday, May 18 ──
        [90,  '2026-05-18', 'Sunday, May 18',  '10:00 am – 4:00 pm', 'BYOB Brunch',                      'Penguin City Brewing Company',           'adult',    false, '', '', '', ''],
        [91,  '2026-05-18', '',                '4:00 pm – 7:00 pm',  'BNB Build (Beats and Beers)',      'Penguin City Brewing Company',           'music',    false, '', '', '', ''],

        // ── Friday, May 23 ──
        [100, '2026-05-23', 'Friday, May 23',  '10:00 am – 12:00 pm','Meditation at American Masterpieces','Butler Institute of American Art',     'wellness', false, '', '', '', ''],
        [101, '2026-05-23', '',                '5:00 pm – 8:00 pm',  'Michael W. Smith — Live in the Valley', 'Covelli Centre',                     'music',    false, '', '', '', ''],
        [102, '2026-05-23', '',                '6:00 pm – 10:00 pm', 'Full Spectrum: "Unity Prom"',      'Covelli Centre',                          'adult',    false, '', '', '', ''],
        [103, '2026-05-23', '',                '7:00 pm – 11:00 pm', 'Carmin/Memorial Day Bash',         'Penguin City Brewing Company',           'fests',    true,  '', '', '', ''],
        [104, '2026-05-23', '',                '8:00 pm – 11:00 pm', 'Live Music: Lec O Angelos',        'Twisted Rivets',                          'music',    false, '', '', '', ''],

        // ── Saturday, May 24 ──
        [110, '2026-05-24', 'Saturday, May 24','8:00 am – 12:00 pm', 'Workshop: Writing Through Grief',  'Penguin City Brewing Company',           'wellness', false, '', '', '', ''],
        [111, '2026-05-24', '',                '8:00 am – 4:00 pm',  'Pop Up on Phelps',                 'Phelps Street Gateway',                   'fests',    true,  'Pop-up market in the open air. Family-friendly.', '', '', ''],
        [112, '2026-05-24', '',                '11:00 am – 4:00 pm', 'Downtown Youngstown Farmers Market','Phelps Street Gateway',                  'family',   true,  '', '', '', ''],
        [113, '2026-05-24', '',                '12:00 pm – 4:00 pm', 'Trivia Night with Greg G',         'Twisted Rivets',                          'adult',    false, '', '', '', ''],
        [114, '2026-05-24', '',                '7:30 pm – 11:00 pm', 'Open Mic Night',                   'Penguin City Brewing Company',           'music',    false, '', '', '', ''],

        // ── Sunday, May 25 ──
        [120, '2026-05-25', 'Sunday, May 25',  '11:00 am – 4:00 pm', 'BYOB Brunch',                      'Penguin City Brewing Company',           'adult',    false, '', '', '', ''],
        [121, '2026-05-25', '',                '11:00 am – 5:00 pm', 'Pop Up on Phelps',                 'Phelps Street Gateway',                   'fests',    true,  '', '', '', ''],
        [122, '2026-05-25', '',                '7:00 pm – 9:00 pm',  'Visitor Appreciation Weekend',     'Mahoning Valley Historical Society',      'edu',      true,  '', '', '', ''],

        // ── Friday, May 29 ──
        [130, '2026-05-29', 'Friday, May 29',  '5:00 pm – 8:00 pm',  'Summer Exhibitions Opening',       'Butler Institute of American Art',       'arts',     true,  '', '', '', ''],
        [131, '2026-05-29', '',                '8:00 pm – 11:00 pm', 'Live Music: Frenz',                'Twisted Rivets',                          'music',    false, '', '', '', ''],

        // ── Saturday, May 30 ──
        [140, '2026-05-30', 'Saturday, May 30','9:30 am – 1:00 pm',  '25th Annual Stonewall Painting Day', 'Tod Park',                              'family',   true,  'Community paint-and-mural day. All ages welcome.', '', '', ''],
        [141, '2026-05-30', '',                '10:00 am – 12:00 pm','Youngstown Marathon — Solo to City', 'Downtown Youngstown',                   'wellness', true,  '', '', '', ''],
        [142, '2026-05-30', '',                '8:00 pm – 11:00 pm', 'BYOB Brunch',                      'Penguin City Brewing Company',           'adult',    false, '', '', '', ''],

        // ── Saturday, May 9 (Explore Mahoning) ──
        [200, '2026-05-09', 'Saturday, May 9', '9:00 am – 3:00 pm',  "Mr. Darby's Trunk Sale",                              "Mr. Darby's Vintage & Antiques · 7386 Market St., Boardman", 'fests',    true,  '', '', '', ''],
        [201, '2026-05-09', '',                '10:00 am – 2:00 pm', '2nd Annual Pollinator Palooza',                       'Mahoning Soil & Water Conservation District · 850 Industrial Rd., Youngstown', 'wellness', true,  '', '', '', ''],
        [202, '2026-05-09', '',                '10:00 am – 5:00 pm', "15th Birthday Bash — OH WOW! Children's Center",      "OH WOW! Children's Center · 15 Central Square, Youngstown",   'family',   true,  '', '', '', ''],
        [203, '2026-05-09', '',                '11:00 am – 3:00 pm', '3rd Annual Plant Swap',                               'Penguin City Brewing Company · 460 E. Federal St., Youngstown', 'family',   true,  'Bring a plant, take a plant.', '', '', ''],
        [204, '2026-05-09', '',                '12:00 pm – 2:00 pm', "Mother's Day Weekend Bouquet Bar",                    "L'uva Bella Winery & Bistro · 6597 Center Rd., Lowellville",  'arts',     true,  '', '', '', ''],

        // ── Sunday, May 10 (Explore Mahoning) ──
        [210, '2026-05-10', 'Sunday, May 10',  '11:00 am – 3:00 pm', "Mother's Day Brunch Buffet",                          "L'uva Bella Winery & Bistro · 6597 Center Rd., Lowellville",  'family',   true,  '', '', '', ''],
        [211, '2026-05-10', '',                '11:00 am – 4:00 pm', "Mother's Day Buffet",                                 'Waypoint 4180 · 4180 Westford Pl., Canfield',                  'family',   true,  '', '', '', ''],

        // ── Wednesday, May 13 (Explore Mahoning) ──
        [220, '2026-05-13', 'Wednesday, May 13','5:30 pm',           'Friends of Poland Forest Meeting & Lecture',          'Poland Library · 311 S. Main St., Poland',                     'edu',      false, '', '', '', ''],

        // ── Thursday, May 14 (Explore Mahoning) ──
        [230, '2026-05-14', 'Thursday, May 14','4:00 pm – 7:30 pm',  'Downtown Youngstown Farmers Market',                  'Main Library · 305 Wick Ave., Youngstown',                     'family',   true,  '', '', '', ''],
        [231, '2026-05-14', '',                '5:00 pm',            'Move at the Market — Walking Series',                 'Main Library · 305 Wick Ave., Youngstown',                     'wellness', true,  'Group walk around downtown.', '', '', ''],
        [232, '2026-05-14', '',                '5:30 pm',            'Food for Thought Book Discussion',                    'Noble Creature Wild Ales & Lagers · 126 E. Rayen Ave.',        'edu',      false, 'Lit Youngstown First Wednesday Readers Series.', '', '', ''],

        // ── Friday, May 15 (Explore Mahoning) ──
        [240, '2026-05-15', 'Friday, May 15',  '6:00 pm',            "Music on the Patio — L'uva Bella",                    "L'uva Bella Winery & Bistro · 6597 Center Rd., Lowellville",  'music',    true,  '', '', '', ''],
        [241, '2026-05-15', '',                '7:30 pm',            'Inextinguishable',                                    'Stambaugh Auditorium · 1000 Fifth Ave., Youngstown',           'arts',     false, 'Symphony performance.', '', '', ''],

        // ── Saturday, May 16 (Explore Mahoning, same day as existing entries) ──
        [250, '2026-05-16', '',                '8:00 am – 1:00 pm',  'Baby Bargain Boutique',                               'Boardman Township Park · 375 Boardman-Poland Rd., Boardman',   'family',   true,  '', '', '', ''],
        [251, '2026-05-16', '',                '6:00 pm',            "Music on the Patio — L'uva Bella",                    "L'uva Bella Winery & Bistro · 6597 Center Rd., Lowellville",  'music',    true,  '', '', '', ''],

        // ── Sunday, May 17 (Explore Mahoning, same day as existing entries) ──
        [260, '2026-05-17', '',                '12:00 pm',           'Bike Belmont',                                        'Wick Park · 260 Park Ave., Youngstown',                        'wellness', true,  'Group ride through Belmont — perfect e-bike outing.', '', '', ''],
        [261, '2026-05-17', '',                '3:00 pm',            '#LoveMusic Legacy Concert',                           'Stambaugh Auditorium · 1000 Fifth Ave., Youngstown',           'music',    true,  '', '', '', ''],

        // ── Wednesday, May 20 (Explore Mahoning) ──
        [270, '2026-05-20', 'Wednesday, May 20','9:00 am – 5:00 pm', 'Tent Sale',                                           'Habitat ReStore · 480 Youngstown-Poland Rd., Struthers',       'fests',    true,  '', '', '', ''],
        [271, '2026-05-20', '',                '6:00 pm – 7:30 pm',  'History of Youngstown & Mahoning Valley Restaurants', 'Main Library · 305 Wick Ave., Youngstown',                     'edu',      false, 'Community Cookbooks: Food talk.', '', '', ''],
        [272, '2026-05-20', '',                "6:00 pm – 8:00 pm",  "Mom's Night Out",                                     'Southern Park Mall · 7401 Market St., Boardman',               'adult',    false, '', '', '', ''],
        [273, '2026-05-20', '',                '7:30 pm – 9:30 pm',  'NEUR NetWorks: Connecting & Communicating for Creatives', 'The Concept Studio · 217 W. Federal St., Youngstown',      'adult',    false, '', '', '', ''],

        // ── Friday, May 22 (Explore Mahoning) ──
        [280, '2026-05-22', 'Friday, May 22',  '6:00 pm',            "Music on the Patio — L'uva Bella",                    "L'uva Bella Winery & Bistro · 6597 Center Rd., Lowellville",  'music',    true,  '', '', '', ''],

        // ── Saturday, May 23 (Explore Mahoning, same day as existing entries) ──
        [290, '2026-05-23', '',                '10:00 am',           'Furry Angels Run',                                    'Eastside Civics · 968 E. Midlothian Blvd., Youngstown',        'wellness', true,  'Charity run — bring the family and a dog.', '', '', ''],
        [291, '2026-05-23', '',                '6:00 pm',            "Music on the Patio — L'uva Bella",                    "L'uva Bella Winery & Bistro · 6597 Center Rd., Lowellville",  'music',    true,  '', '', '', ''],

        // ── Monday, May 25 (Explore Mahoning, same day as existing entries) ──
        [300, '2026-05-25', '',                '10:00 am – 1:00 pm', 'Memorial Day Parade & Ceremony',                      'Boardman Township Park · 375 Boardman-Poland Rd., Boardman',   'fests',    true,  '', '', '', ''],
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
 *      - For SiteConfig / Pages (keyed tabs), append seed rows whose
 *        key/slug isn't already in the sheet. Existing rows are never
 *        modified or reordered.
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
  const KEYED = { 'SiteConfig': 'key', 'Pages': 'slug' };
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
