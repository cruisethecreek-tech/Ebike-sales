// The portal's swatch table must stay the storefront's swatch table.
//
// My Bikes shows the colour a customer's bike was sold in. If the portal's
// copy of SWATCH_COLORS drifts from site-enhance.js, the same "Pink" is one
// colour on the shop page and another in the portal.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { SWATCH_COLORS, resolveSwatchHex } from './swatch-colors.ts'

const here = dirname(fileURLToPath(import.meta.url))
let fails = 0
const ok = (n, c, e = '') => { console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : '')); if (!c) fails++ }

const enhance = readFileSync(join(here, '..', '..', 'site-enhance.js'), 'utf8')
const i = enhance.indexOf('const SWATCH_COLORS = {')
const shop = new Function(enhance.slice(i, enhance.indexOf('\n  };', i) + 5) + '; return SWATCH_COLORS')()

ok('the portal table matches the storefront table',
   JSON.stringify(SWATCH_COLORS) === JSON.stringify(shop),
   'change portal/lib/swatch-colors.ts and site-enhance.js together')

ok('a catalogue hex wins', resolveSwatchHex('Pink', '#123456') === '#123456')
ok('the #888888 placeholder falls back to the name', resolveSwatchHex('Pink', '#888888') === '#E58FB0')
ok('a two-tone name uses its first colour', resolveSwatchHex('Black and Red', '') === '#1A1A1A')
ok('an unknown name with no hex gives no colour', resolveSwatchHex('Jungle Camo', '') === null)

if (fails) { console.log(`\n${fails} failing`); process.exit(1) }
console.log('\nall passing')
