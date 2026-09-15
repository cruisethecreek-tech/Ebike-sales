/**
 * Tests for the spec extraction in apps-script-brand-specs.snippet.gs.
 *
 * Run with:  node apps-script-brand-specs.test.js
 *
 * These patterns read a vendor's marketing copy, which they rewrite whenever
 * they feel like it. When fillBrandSpecs starts returning blanks or obviously
 * wrong numbers for a brand, paste a failing product's body_html in here as a
 * new case before touching the regexes — the decoy case below exists because
 * the first version happily reported a comparison figure from another model.
 */
const fs = require('fs');
const path = require('path');
let src = fs.readFileSync(path.join(__dirname, 'apps-script-brand-specs.snippet.gs'), 'utf8');
// Load only the pure extraction helpers — everything above fillBrandSpecs.
src = src.slice(0, src.indexOf('function fillBrandSpecs'));
eval(src);

const cases = [
  // From a real Mokwheel run: an accessory listing with the word "pack" in it
  // wrote {"Battery":"undefinedWh"} into the sheet. 'battery|pack' was spliced
  // into the pattern ungrouped, so the alternation swallowed the whole regex
  // and "pack" matched with no capture group.
  { n: 'Accessory copy containing "pack" — must not invent a battery',
    html: `<p>Charge your Mokwheel battery pack anywhere with this 230W solar panel and inverter.</p>`,
    want: { Range: '', 'Top Speed': '', Motor: '', Battery: '' } },

  // Also from a real run: a Basalt reported an 1100W motor. Mokwheel's copy
  // leads with the peak figure, and the nominal rating is never stated in
  // body_html, so the honest answer is to report nothing.
  { n: 'Peak wattage printed before "motor" — must not become the nominal rating',
    html: `<p>Climb anything with up to 1100W peak motor power.</p>`,
    want: { Range: '', 'Top Speed': '', Motor: '', Battery: '' } },

  // The guard must not swallow a genuine nominal rating that happens to sit
  // near a peak figure.
  { n: 'Nominal before peak still reports both',
    html: `<p>A 750W motor (up to 1100W peak) pulls away from stops.</p>`,
    want: { Range: '', 'Top Speed': '', Motor: '750W / 1100W peak', Battery: '' } },

  { n: 'Basalt — prose, V/Ah pack, peak watts',
    html: `<p>The Basalt features a removable 48V 19.6Ah lithium battery, delivering a long-range ride of 60 to 80 miles on a single charge. The 750W motor (up to 1100W peak) helps you pull away from stops.</p><p>Top speed: 28 mph. Tires 26x4".</p>`,
    want: { Range: '60-80 mi', 'Top Speed': '28 mph', Motor: '750W / 1100W peak', Battery: '941Wh' } },

  { n: 'Spec table in a list, stated Wh',
    html: `<ul><li>Motor: 500W brushless hub</li><li>Battery: 48V 15Ah (720Wh)</li><li>Max Speed: 20 mph</li><li>Range: 55 miles</li></ul>`,
    want: { Range: '55 mi', 'Top Speed': '20 mph', Motor: '500W', Battery: '720Wh' } },

  { n: 'Table markup, en-dash range',
    html: `<table><tr><td>Range</td><td>45 – 65 miles</td></tr><tr><td>Top Speed</td><td>28mph</td></tr><tr><td>Motor</td><td>1000W</td></tr><tr><td>Battery</td><td>940Wh</td></tr></table>`,
    want: { Range: '45-65 mi', 'Top Speed': '28 mph', Motor: '1000W', Battery: '940Wh' } },

  { n: 'Decoy numbers far from their labels',
    html: `<p>Compare with our 90 mile touring model or the 32 mph moped class.</p><p>This bike: Motor 750W. Battery 720Wh. Top Speed 20 mph. Range 50 miles.</p>`,
    want: { Range: '50 mi', 'Top Speed': '20 mph', Motor: '750W', Battery: '720Wh' } },

  { n: 'Marketing copy with no specs at all',
    html: `<p>Built for the trail. Ride further, worry less. Lifetime frame warranty.</p>`,
    want: { Range: '', 'Top Speed': '', Motor: '', Battery: '' } },
];

let pass = 0, fail = 0;
for (const c of cases) {
  const got = fsExtractSpecs(c.html, '').specs;
  const ok = JSON.stringify(got) === JSON.stringify(c.want);
  console.log((ok ? 'PASS  ' : 'FAIL  ') + c.n);
  if (!ok) { console.log('   want ' + JSON.stringify(c.want)); console.log('   got  ' + JSON.stringify(got)); }
  ok ? pass++ : fail++;
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
