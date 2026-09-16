/**
 * Tests for the accessory classifier in apps-script-brand-import.snippet.gs.
 *
 * Run with:  node apps-script-brand-import.test.js
 *
 * Every title in the "accessory" list below is one that actually made it into
 * the Inventory sheet during a real Mokwheel import and had to be deleted by
 * hand. When a brand invents a new kind of junk SKU, add it here first, then
 * widen IMP_HARD_PARTS until this file passes again.
 *
 * The bike list is the guard rail in the other direction: the classifier has
 * previously thrown away a real bike because its name contained an accessory
 * word, so every model we actually sell is asserted to survive.
 */
const fs = require('fs');
const path = require('path');
let src = fs.readFileSync(path.join(__dirname, 'apps-script-brand-import.snippet.gs'), 'utf8');
// Load only the pure classification helpers — everything above _impSlug_.
src = src.slice(0, src.indexOf('/** Same slug rule'));
eval(src);

// Titles that must be skipped. The "Free Accessories(...)" family is listed
// once per colourway by Mokwheel, which is why a single missed word is worth
// eleven junk rows.
const accessories = [
  'Urban Cycling Pack',
  'Free Accessories(Granite)',
  'Free Accessories(Mesa Lite)',
  'Free Accessories(Asphalt)',
  'Free Accessories(Scoria)',
  'Free Accessories(Onyx)',
  'Free Accessories(Tarmac)',
  'Free Accessories(Obsidian)',
  'Free Accessories(Tor Plus/Mesa Plus ST)',
  'Free Accessories(Basalt)',
  'Free Accessories(FLINT)',
  'Rear Rack Accessory',
  'Commuter Bundle',
  '48V 19.6Ah Spare Battery',
  'Fat Tire Inner Tube',
  '230W Solar Panel + Inverter',
  '100W Solar Panel + Inverter',
  // Straight out of the first real Heybike dry run. The plurals are the
  // interesting ones: the keyword lists say 'mirror' and 'basket', matching is
  // whole-word, so both of these imported as bicycles.
  'Mirrors（3FOR99）',
  'Dual Rear Side Baskets Set',
  'LED Bike Long Headlight（3FOR99）',
  'LED Bike Headlight',
  'Seel E-Mobility Protection',
  'Limited Miami Sunset Gift Pack',
  // The same bike relisted with a promotion attached. Not new models.
  'Saturn-combo',
  'ALPHA-Combo（Deal）',
  'ALPHA (VIP only)',
  'Cityscape 2.0（Deal）',
  'Mars 3.0 for Spurs Fans',
  'Saturn for Spurs Fans',
  'Saturn-Dual Battery-VIP Only',
  // Live on the public shop when this was written. Jasion names every accessory
  // "<something> Ebike <thing>", and IMP_BIKE_PHRASES was rescuing all of them
  // as bicycles before the keyword list was consulted.
  'Jasion Ebike Front Basket',
  'Jasion Ebike Rear Basket Iron Bottom',
  'Jasion Ebike Pet Bike Basket',
  'Ebike Mirrors',
  'Jasion Ebike Universal Mirrors',
  'E-Bike Kickstand',
  'E-Bike Pannier Backpack',
  'EBike Motor Controller',
  'EBike Handlebar Bag',
  'eBike Chain',
  'Universal eBike Handlebar Bottle Holder',
  'Jasion Ebike Phone Mount Holder',
  'Jasion Ebike Crank Arm and Pedals',
  'MC Front Basket For POP Ebike',
  'Ebike Scabbards Shotgun Scabbard',
  'KastKing Spartacus Defender Twin-Tip Baitcaster Rod and Reel Combo',
  'Ultra-Bright Wide-Beam E-Bike Headlight',
  // Multi-packs and two-bike bundles, sold as their own products.
  'Thunder Pro*2',
  'X-Hunter ST*2',
  'Thunder Pro+Thunder Pro ST',
  'X-Hunter + X-Hunter ST',
  'Velotric Fold 1 Plus Ebike + Pannier Bag',
];

// Titles that must survive. Mokwheel's current lineup plus the historical
// near-misses that motivated IMP_BIKE_PHRASES.
const bikes = [
  'Basalt', 'Basalt ST', 'Granite', 'Mesa Lite', 'Asphalt', 'Scoria',
  'Onyx', 'Tarmac', 'Obsidian', 'Tor Plus', 'Mesa Plus ST', 'Flint',
  'Upland Fat Tire', 'Lightweight Commuter E-Bike', 'Folding Bike 20"',
  'Backpacker Cargo Bike',
  // Real Heybike and Mokwheel models that must survive the promo words above.
  // 'deal' and 'vip' are broad, so the whole live lineup is asserted here.
  'Saturn', 'Titan', 'Villain', 'Ranger S', 'Ranger 3.0 Pro', 'Mars 2.0',
  'Mars 3.0', 'Mars 2.5', 'Cityrun', 'Venus', 'Alpha', 'Horizon', 'Hero',
  'Hero Hub', 'Helio F', 'Hybrid', 'Ranger S 2.0', 'Cityscape 2.0',
  // Real bikes whose names collide with the accessory nouns above. Every one
  // of these was live and correct when the cleanup was written, and the
  // cleanup hides whatever this classifier calls an accessory — so a mistake
  // here takes a real bike off the shop.
  'Kago Ebike', 'JT18 eTrike', 'RetroVolt Max Ebike', 'Patrol Ebike',
  'X-Hunter ST Ebike', 'POP Folding Electric Bike', 'TK2 Folding Electric Trike',
  'TK1 Fat Tire Electric Trike', 'Velotric Discover 2 Ebike',
  'Velotric Nomad 1 Plus Ebike', 'Velotric Packer 1 Ebike', 'Velotric T1 Ebike',
  'Velotric Go 1 Ebike', 'Velotric Discover 1 Plus Ebike', 'Mars 2.5',
];

// ── Duplicate protection ────────────────────────────────────────────────
// The four established brands already have rows, so the import's real job is
// recognising them. The sheet's names are what a human typed; the feed's are
// marketing copy. An exact comparison calls every one of these "new" and adds
// a second row for a bike already on the site.
const sheetRows = ['Hero', 'Hero Hub', 'Cityrun', 'Mars 2.0', 'Mars 3.0', 'Ranger S'];
const nameIndex = {};
sheetRows.forEach(n => _impTitleKeys_(n, 'Heybike').forEach(k => { if (!nameIndex[k]) nameIndex[k] = n; }));
const existing = t => _impFindExisting_(nameIndex, t, 'Heybike');

const dupCases = [
  ['Heybike Hero Electric Bike',     'Hero'],
  ['Mars 2.0 Folding Electric Bike', 'Mars 2.0'],
  ['City Run',                       'Cityrun'],
  ['Hero Hub',                       'Hero Hub'],
  ['Ranger S',                       'Ranger S'],
];
let dupPass = 0;
dupCases.forEach(([feedTitle, want]) => {
  const got = existing(feedTitle);
  if (got === want) dupPass++;
  else console.log('FAIL  "' + feedTitle + '" should match row "' + want + '", got ' + JSON.stringify(got));
});

// The other direction matters just as much: a genuinely new model must NOT be
// mistaken for an existing row, or the import silently skips it. These are the
// models the user noticed were missing.
const newCases = ['Saturn', 'Villain', 'Titan', 'Galaxy Pro', 'Mars 4.0'];
let newPass = 0;
newCases.forEach(t => {
  const got = existing(t);
  if (got === null) newPass++;
  else console.log('FAIL  new model "' + t + '" was mistaken for existing row "' + got + '"');
});

console.log('dedupe: ' + dupPass + '/' + dupCases.length + ' existing recognised, '
          + newPass + '/' + newCases.length + ' new models let through');

let pass = dupPass + newPass, fail = (dupCases.length - dupPass) + (newCases.length - newPass);
accessories.forEach(function (t) {
  if (_impIsAccessory_(t)) { pass++; }
  else { fail++; console.log('FAIL  should be skipped as an accessory: ' + t); }
});
bikes.forEach(function (t) {
  if (!_impIsAccessory_(t)) { pass++; }
  else { fail++; console.log('FAIL  real bike classified as an accessory: ' + t); }
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
