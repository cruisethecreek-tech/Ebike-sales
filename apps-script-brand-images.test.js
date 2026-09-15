/**
 * Tests for the pure matching logic in apps-script-brand-images.snippet.gs.
 *
 * Run with:  node apps-script-brand-images.test.js
 *
 * The risk this file guards is not "no image" — it is the WRONG image. A
 * colour-name mismatch silently puts another bike's photo on the page, and
 * nobody notices until a customer does. So the ambiguity cases matter more
 * than the happy path.
 *
 * The Colors fixtures below are the real shapes out of data/inventory.json:
 * Heybike nests style -> size -> swatches, and some rows carry booleans as
 * size values, which the walker has to step over rather than crash on.
 */
const fs = require('fs');
const path = require('path');
let src = fs.readFileSync(path.join(__dirname, 'apps-script-brand-images.snippet.gs'), 'utf8');
src = src.slice(0, src.indexOf('function refreshBrandImages'));
eval(src);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.log('FAIL  ' + name); } };
const eq = (name, a, b) => ok(name + '  (got ' + JSON.stringify(a) + ')', JSON.stringify(a) === JSON.stringify(b));

// -- _bimgVariantImages_ -------------------------------------------------
const product = {
  options: [{ name: 'Color' }, { name: 'Size' }],
  images: [{ src: 'https://cdn.shopify.com/PRODUCT-FIRST.jpg' }],
  variants: [
    { option1: 'Merlot Red',  option2: 'Regular', featured_image: { src: 'https://cdn/merlot.jpg' } },
    { option1: 'Merlot Red',  option2: 'Large',   featured_image: { src: 'https://cdn/merlot-lg.jpg' } },
    { option1: 'Stone Blue',  option2: 'Regular', featured_image: { src: 'https://cdn/stone.jpg' } },
    { option1: 'Shark Grey',  option2: 'Regular' },                       // no image
    { option1: 'Default Title', featured_image: { src: 'https://cdn/x.jpg' } },
  ],
};
const map = _bimgVariantImages_(product);
eq('colour option is used, first variant wins', map['merlot red'], 'https://cdn/merlot.jpg');
eq('second colour mapped', map['stone blue'], 'https://cdn/stone.jpg');
ok('variant with no featured_image is skipped, not given the product photo',
   map['shark grey'] === undefined);
ok('"Default Title" is ignored', map['default title'] === undefined);

// Store with no Color option: the variant title carries the colour.
const noOpt = { options: [{ name: 'Title' }], variants: [
  { title: 'Stealth Black', featured_image: { src: 'https://cdn/stealth.jpg' } } ] };
eq('falls back to variant title', _bimgVariantImages_(noOpt)['stealth black'], 'https://cdn/stealth.jpg');

// -- _bimgLookup_ --------------------------------------------------------
const m = { 'merlot red': 'A', 'stone blue': 'B', 'artic blue': 'D' };
eq('exact match', (_bimgLookup_(m, 'Merlot Red') || {}).src, 'A');
eq('punctuation and case ignored', (_bimgLookup_(m, 'merlot-red') || {}).src, 'A');
// 'Blue' is inside both 'stone blue' and 'artic blue' and is neither of them.
// Picking either would put the wrong bike on the page, so it picks neither.
ok('ambiguous containment returns nothing rather than guessing',
   _bimgLookup_(m, 'Blue') === null);
// An exact vendor colour still wins even when other colours contain it.
eq('exact beats containment',
   (_bimgLookup_({ 'blue': 'C', 'stone blue': 'B' }, 'Blue') || {}).src, 'C');
eq('unique containment is allowed', (_bimgLookup_({ 'lemans blue': 'E' }, 'Lemans') || {}).src, 'E');
ok('no match returns null', _bimgLookup_(m, 'Chartreuse') === null);
ok('empty swatch name returns null', _bimgLookup_(m, '') === null);

// -- product title matching ----------------------------------------------
// Every pair below is a real miss from the first Heybike dry run, where the
// matcher only stripped a trailing "Ebike" and 6 of 11 models went unfound.
const vendorProducts = [
  { title: 'Heybike Hero Electric Bike',     handle: 'hero' },
  { title: 'Hero Hub',                       handle: 'hero-hub' },
  { title: 'City Run',                       handle: 'cityrun' },
  { title: 'Mars 2.0 Folding Electric Bike', handle: 'mars-2-0' },
  { title: 'Mars 3.0',                       handle: 'mars-3-0' },
  { title: 'Helio Folding',                  handle: 'helio-folding' },
  { title: 'Horizon Electric Bike',          handle: 'horizon' },
  { title: 'Ranger S',                       handle: 'ranger-s' },
];
const index = {};
vendorProducts.forEach(p => {
  _bimgTitleKeys_(p.title, 'Heybike').forEach(k => { if (!index[k]) index[k] = p; });
  [_bimgNorm_(p.handle), _bimgSquash_(p.handle)].forEach(k => { if (k && !index[k]) index[k] = p; });
});
const found = n => (_bimgFindProduct_(index, n, 'Heybike') || {}).title;

eq('brand name and "Electric Bike" stripped', found('Hero'), 'Heybike Hero Electric Bike');
eq('spacing difference collapses', found('Cityrun'), 'City Run');
eq('vendor title carries extra words', found('Mars 2.0'), 'Mars 2.0 Folding Electric Bike');
eq('abbreviated sheet name', found('Helio F'), 'Helio Folding');
eq('plain suffix still works', found('Horizon'), 'Horizon Electric Bike');
eq('already-identical title', found('Ranger S'), 'Ranger S');

// The disambiguation that matters: "Hero" is a substring of "Hero Hub", and
// "Mars 2.0" of nothing else. Exact must win over containment, or the Hero Hub
// row would quietly inherit the Hero's photos.
eq('longer sibling is not swallowed', found('Hero Hub'), 'Hero Hub');
eq('sibling model keeps its own product', found('Mars 3.0'), 'Mars 3.0');
ok('an unknown model matches nothing', found('Chartreuse Cruiser') === undefined);

eq('strip leaves distinguishing words alone', _bimgStripBrand_('Mars 2.0 Folding Electric Bike', 'Heybike'), 'mars 2 0 folding');
eq('squash removes spacing', _bimgSquash_('City Run'), 'cityrun');

// -- _bimgWalkSwatches_ --------------------------------------------------
const heybikeShape = {
  '750W':  { 'One Size': [{ name: 'Merlot Red', hex: '#7b1e2b', img: 'images/old1.png' }] },
  '1000W': { 'One Size': [{ name: 'Stone Blue', hex: '#4a6a8a', img: 'images/old2.png', soldOut: true }] },
};
let seen = [];
_bimgWalkSwatches_(heybikeShape, sw => seen.push(sw.name));
eq('walks style -> size -> swatches', seen, ['Merlot Red', 'Stone Blue']);

const withBooleans = { 'Step-Thru': { 'Regular': [{ name: 'Crimson', img: 'a' }], 'Large': true } };
seen = [];
_bimgWalkSwatches_(withBooleans, sw => seen.push(sw.name));
eq('steps over boolean size values', seen, ['Crimson']);

const flat = { 'Default': [{ name: 'White', img: 'a' }, { name: 'Grey', img: 'b' }] };
seen = [];
_bimgWalkSwatches_(flat, sw => seen.push(sw.name));
eq('handles style -> swatches with no size level', seen, ['White', 'Grey']);

_bimgWalkSwatches_({}, () => ok('empty object must not call back', false));
_bimgWalkSwatches_(null, () => ok('null must not call back', false));
pass += 2;

// -- the whole point: only img changes -----------------------------------
const before = JSON.parse(JSON.stringify(heybikeShape));
_bimgWalkSwatches_(heybikeShape, sw => {
  const hit = _bimgLookup_(map, sw.name);
  if (hit) sw.img = hit.src;
});
eq('image repointed', heybikeShape['750W']['One Size'][0].img, 'https://cdn/merlot.jpg');
eq('hex untouched', heybikeShape['750W']['One Size'][0].hex, before['750W']['One Size'][0].hex);
eq('name untouched', heybikeShape['750W']['One Size'][0].name, before['750W']['One Size'][0].name);
eq('soldOut flag survives', heybikeShape['1000W']['One Size'][0].soldOut, true);
eq('structure unchanged', Object.keys(heybikeShape), Object.keys(before));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
