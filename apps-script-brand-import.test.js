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
];

// Titles that must survive. Mokwheel's current lineup plus the historical
// near-misses that motivated IMP_BIKE_PHRASES.
const bikes = [
  'Basalt', 'Basalt ST', 'Granite', 'Mesa Lite', 'Asphalt', 'Scoria',
  'Onyx', 'Tarmac', 'Obsidian', 'Tor Plus', 'Mesa Plus ST', 'Flint',
  'Upland Fat Tire', 'Lightweight Commuter E-Bike', 'Folding Bike 20"',
  'Backpacker Cargo Bike',
];

let pass = 0, fail = 0;
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
