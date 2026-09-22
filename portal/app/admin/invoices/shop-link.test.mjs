// The Shop badge must never tell staff to redo paperwork they already did.
//
// The Shop.com order / warranty link lives in the Google Sheet and only
// reaches the portal on sync. An invoice that has not synced since the column
// existed may well already have one, so it cannot be shown as missing — the
// badge exists to answer "does this still need a shop invoice", and a false
// "no" sends someone to redo finished work.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
let fails = 0
const ok = (n, c, e = '') => { console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : '')); if (!c) fails++ }

// Mirrors shopLinkState in shop-link-badge.tsx, pinned to it below.
const state = (v) => (v === null || v === undefined) ? 'unknown' : (String(v).trim() ? 'present' : 'none')

ok('a link reads as present', state('https://shop.app/orders/55155678466') === 'present')
ok('an empty string reads as confirmed none', state('') === 'none')
ok('whitespace only reads as confirmed none', state('   ') === 'none')
ok('null reads as unknown, not missing', state(null) === 'unknown')
ok('undefined reads as unknown, not missing', state(undefined) === 'unknown')

const badge = readFileSync(join(here, 'shop-link-badge.tsx'), 'utf8')
ok('the component distinguishes all three states',
   /'present'/.test(badge) && /'none'/.test(badge) && /'unknown'/.test(badge))
ok('never-synced invoices are not labelled as missing',
   /Not known/.test(badge) && !/No shop invoice on file[\s\S]{0,80}unknown/i.test(badge))
ok('a present link is clickable', /target="_blank"/.test(badge))
ok('and carries rel=noopener', /rel="noopener noreferrer"/.test(badge))
ok('every state has a hover title', (badge.match(/title=/g) || []).length >= 3,
   String((badge.match(/title=/g) || []).length))
ok('every state has an aria-label', (badge.match(/aria-label=/g) || []).length >= 3,
   String((badge.match(/aria-label=/g) || []).length))

// --- the column sits where it was asked for ------------------------------
const page = readFileSync(join(here, 'page.tsx'), 'utf8')
const iIssued = page.indexOf('>Issued Date<')
const iShop = page.indexOf('>Shop<')
const iActions = page.indexOf('>Actions<')
ok('the Shop header exists', iShop !== -1)
ok('it sits between Issued Date and Actions',
   iIssued !== -1 && iShop > iIssued && iActions !== -1 && iShop < iActions,
   `issued=${iIssued} shop=${iShop} actions=${iActions}`)
ok('the cell reads supplier_url', /supplierUrl=\{inv\.supplier_url\}/.test(page))

// --- the value has to actually get there ---------------------------------
const route = readFileSync(join(here, '../../api/invoices/sync/route.ts'), 'utf8')
ok('the sync endpoint reads supplierUrl from the body', /body\.supplierUrl/.test(route))
ok('it treats missing and empty differently',
   /body\.supplierUrl === undefined/.test(route) && /String\(body\.supplierUrl\)\.trim\(\)/.test(route))
ok('an absent field does not overwrite the stored one',
   /supplierUrl === undefined \? \{\} : \{ supplier_url: supplierUrl \}/.test(route))

const gen = readFileSync(join(here, '../../../../invoice.html'), 'utf8')
const sync = gen.slice(gen.indexOf('function syncInvoiceToPortal'))
ok('the generator sends supplierUrl to the portal',
   /supplierUrl\s*:\s*invoiceData\.supplierUrl/.test(sync.slice(0, 1600)))

console.log(fails ? `\n${fails} FAILED` : '\nAll passed')
process.exit(fails ? 1 : 0)
