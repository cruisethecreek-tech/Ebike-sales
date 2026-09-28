// Why the item picker had three options in it.
//
// A screenshot from the shop floor: Category… / Installation / Delivery /
// Custom (free text), and "Inventory catalog unavailable — use Custom (free
// text)". Behind those three there should have been 67 bikes, 9 accessories
// and 25 t-shirts.
//
// The picker loaded its catalogue from the CMS Apps Script over JSONP, and
// when that call failed it hid Bike, Accessory and Apparel and left the three
// hardcoded options. One unreachable Google deployment and the only way to
// invoice a $2,499 Velotric was to type the name and the price by hand.
//
// The site already publishes the same data as static files on its own origin —
// /data/inventory.json is written by the daily sync from that very Sheet, and
// every brand page loads it. Falling back to it costs nothing and keeps the
// picker working.
const fs = require('fs');
const path = require('path');

let fails = 0;
const ok = (n, c, e = '') => {
  console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : ''));
  if (!c) fails++;
};
const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const codeOnly = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '')
     .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');

const gen = codeOnly(read('invoice.html'));

// ── Every way the live call can fail now tries the snapshot ──────────────
ok('a failed request falls back', /script\.onerror[\s\S]{0,180}loadStaticCatalog\(/.test(gen));
ok('a timeout falls back', /setTimeout\([\s\S]{0,120}loadStaticCatalog\(/.test(gen));
ok('an empty answer falls back', /loadStaticCatalog\('the live catalogue returned no items'\)/.test(gen));
ok('an unreadable answer falls back', /loadStaticCatalog\('the live catalogue could not be read'\)/.test(gen));

// Giving up is still possible — but only after the snapshot has also failed.
const staticFn = gen.slice(gen.indexOf('function loadStaticCatalog'), gen.indexOf('function loadCatalog'));
ok('the picker is only emptied once both sources are gone',
  /markCatalogOffline\(reason\)/.test(staticFn));
ok('and nothing else empties it any more',
  (gen.match(/markCatalogOffline\(/g) || []).length === 3,
  'one definition plus the two calls inside the fallback');

// ── It reads the files the site already publishes ────────────────────────
ok('bikes come from the daily sync file', /fetch\('\/data\/inventory\.json'/.test(staticFn));
ok('accessories and apparel come from the catalog file', /fetch\('\/data\/catalog\.json'/.test(staticFn));
ok('a failed fetch does not throw', /\.catch\(\(\) => null\)/.test(staticFn));

// Staff must be able to tell last night's prices from this minute's.
ok('the snapshot says it is a snapshot', /from the daily snapshot/.test(staticFn));
ok('and dates itself', /inv\.lastUpdated/.test(staticFn));
ok('and says why the live one was not used', /\+ reason \+/.test(staticFn));

// ── The static catalogue itself ──────────────────────────────────────────
const catalog = JSON.parse(read('data/catalog.json'));
ok('accessories are present', Array.isArray(catalog.accessories) && catalog.accessories.length >= 9,
  String(catalog.accessories && catalog.accessories.length));
ok('apparel is present', Array.isArray(catalog.apparel) && catalog.apparel.length >= 25,
  String(catalog.apparel && catalog.apparel.length));
ok('every item has a name and a price',
  [...catalog.accessories, ...catalog.apparel].every((i) => i.name && typeof i.price === 'number'));
ok('no t-shirt leaked into accessories',
  !catalog.accessories.some((i) => /t-shirt/i.test(i.name)));
ok('the known prices are right',
  catalog.accessories.find((i) => i.name === 'Standard Helmet').price === 30 &&
  catalog.accessories.find((i) => i.name === 'Mirror').price === 25 &&
  catalog.accessories.find((i) => i.name === 'Bike Lock').price === 20);
ok('it says where it came from and that it is a fallback',
  /Catalog tab/.test(catalog._comment) && /falls back/.test(catalog._comment));

// The bike file it leans on has to keep the shape the fallback reads.
const inv = JSON.parse(read('data/inventory.json'));
ok('inventory.json still has bikes with brand, name and price',
  Array.isArray(inv.bikes) && inv.bikes.length > 10 &&
  inv.bikes.every((b) => b.name !== undefined && b.price !== undefined),
  String(inv.bikes && inv.bikes.length));

console.log(fails ? '\n' + fails + ' FAILED' : '\nAll passed');
process.exit(fails ? 1 : 0);
