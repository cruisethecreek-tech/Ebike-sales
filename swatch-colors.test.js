// Swatches must never render as an invisible circle.
//
// The brand pages drew every swatch with `background-color:${swatch.hex}`.
// 105 of 239 swatches have no hex — the supplier feeds carry a colour NAME and
// a PHOTO but never a hex, so the importer writes an empty one and leaves it
// for a human (apps-script-brand-import.snippet.gs:270). A blank hex produces
// `background-color:;`, which is invalid and ignored, so the swatch rendered as
// an empty ring: the Heybike Saturn offered "Leather Black" as a blank circle
// above a photo of a black bike, and the Jasion Patrol drew "White Sprite" and
// "Black Knight" identically.
//
// The fix resolves a missing hex from the colour NAME, in site-enhance.js, and
// deliberately NOT in data/inventory.json — the sync workflow regenerates that
// file from the Google Sheet daily, so anything written there is gone within 24
// hours. These tests pin down that arrangement.
const fs = require('fs');
const path = require('path');

let fails = 0;
const ok = (n, c, e = '') => {
  console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : ''));
  if (!c) fails++;
};
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

const enhance = read('site-enhance.js');

// ── Load the real table and the real function out of the shipped file ────
const SWATCH_COLORS = (() => {
  const i = enhance.indexOf('const SWATCH_COLORS = {');
  const body = enhance.slice(i, enhance.indexOf('\n  };', i) + 5);
  const sandbox = {};
  new Function('exports', body + '\n exports.t = SWATCH_COLORS;')(sandbox);
  return sandbox.t;
})();

const ctcSwatchStyle = (() => {
  const win = {};
  const i = enhance.indexOf('function ctcNormalizeColorName');
  const body = enhance.slice(i, enhance.indexOf('\n  };', enhance.indexOf('window.ctcSwatchStyle')) + 5);
  new Function('SWATCH_COLORS', 'window', body)(SWATCH_COLORS, win);
  return win.ctcSwatchStyle;
})();

ok('the colour table loads from the shipped file', Object.keys(SWATCH_COLORS).length > 40,
   `${Object.keys(SWATCH_COLORS).length} names`);

// ── Every value is a usable colour ───────────────────────────────────────
{
  const bad = Object.entries(SWATCH_COLORS).filter(([, v]) => {
    const list = Array.isArray(v) ? v : [v];
    return list.length === 0 || list.some((h) => !/^#[0-9a-fA-F]{6}$/.test(h));
  });
  ok('every entry is a 6-digit hex, or a pair of them', bad.length === 0,
     bad.map(([k]) => k).join(', '));
}

// Keys must already be normalised, or the lookup silently misses them.
{
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const bad = Object.keys(SWATCH_COLORS).filter((k) => norm(k) !== k);
  ok('every key is already in normalised form', bad.length === 0, bad.join(', '));
}

// Pure white would vanish against the white card even with the swatch border.
{
  const white = Object.entries(SWATCH_COLORS)
    .filter(([, v]) => !Array.isArray(v) && /^#f{6}$/i.test(v));
  ok('no entry is pure #FFFFFF', white.length === 0, white.map(([k]) => k).join(', '));
}

// ── The function itself never returns an empty background ────────────────
ok('a hex renders as a solid colour', ctcSwatchStyle({ hex: '#123456' }) === 'background-color:#123456');
ok('a two-tone name renders as a split chip',
   /linear-gradient\(135deg,#1A1A1A 0 50%,#A62231 50% 100%\)/.test(ctcSwatchStyle({ name: 'Black and Red' })));
ok('a known name with no hex resolves from the table',
   ctcSwatchStyle({ name: 'Leather Black' }) === 'background-color:#23211F');
ok('an unknown name falls back to a visible hatched chip',
   /repeating-linear-gradient/.test(ctcSwatchStyle({ name: 'Jungle Camo' })));
ok('a swatch with neither name nor hex is still visible',
   /repeating-linear-gradient/.test(ctcSwatchStyle({})));

// The Sheet is the system of record; the table is only a fallback.
ok('a hex from the Sheet beats the table',
   ctcSwatchStyle({ name: 'Leather Black', hex: '#00FF00' }) === 'background-color:#00FF00',
   'salespro must always be able to correct a colour');

// ── Coverage against the real catalogue ──────────────────────────────────
{
  const inv = JSON.parse(read('data/inventory.json'));
  const bikes = Array.isArray(inv) ? inv : inv.bikes || [];
  const unresolved = {};
  let total = 0, blank = 0, resolved = 0;

  const walk = (v) => {
    if (Array.isArray(v)) {
      for (const s of v) {
        if (!s || s.name === undefined) continue;
        total++;
        if (String(s.hex || '').trim()) continue;
        blank++;
        if (/repeating-linear-gradient/.test(ctcSwatchStyle(s))) {
          unresolved[s.name] = (unresolved[s.name] || 0) + 1;
        } else {
          resolved++;
        }
      }
    } else if (v && typeof v === 'object') {
      Object.values(v).forEach(walk);
    }
  };
  bikes.forEach((b) => walk(b.colors || {}));

  ok('the catalogue still has swatches to check', total > 200, `${total} swatches`);

  // Only names with no honest single colour may fall through. A plain colour
  // word appearing here means the table has a gap.
  const ALLOWED_UNRESOLVED = /camo|^standard$/i;
  const gaps = Object.keys(unresolved).filter((n) => !ALLOWED_UNRESOLVED.test(n));
  ok('no plain colour name is left unresolved', gaps.length === 0,
     gaps.length ? `add to SWATCH_COLORS: ${gaps.join(', ')}` : `unresolved: ${JSON.stringify(unresolved)}`);

  const pct = Math.round((resolved / blank) * 100);
  ok('at least 85% of the blank swatches resolve', pct >= 85, `${resolved}/${blank} = ${pct}%`);
}

// ── Every brand page goes through the shared helper ──────────────────────
for (const f of ['jasion.html', 'heybike.html', 'mokwheel.html', 'mooncool.html', 'velotric.html']) {
  const src = read(f);
  ok(`${f} no longer interpolates a raw hex into the style`,
     !/background-color:\s*\$\{swatch\.hex\}/.test(src),
     'that is what produced "background-color:;" and an invisible swatch');
  ok(`${f} routes every swatch through ctcSwatch`,
     (src.match(/\$\{ctcSwatch\(swatch\)\}/g) || []).length === 4,
     'four render sites per page: flat and nested, normal and sold-out');
  ok(`${f} defines a fallback if site-enhance.js fails to load`,
     /var ctcSwatch = window\.ctcSwatchStyle \|\|/.test(src));
}

// ── The table must not be put somewhere the sync will erase ──────────────
{
  const inv = read('data/inventory.json');
  ok('no hexes were written into data/inventory.json for the blank names',
     !/"hex2"/.test(inv),
     'that file is regenerated from the Sheet daily; anything added is lost');
}

console.log(fails ? `\n${fails} failing` : '\nall passing');
process.exit(fails ? 1 : 0);
