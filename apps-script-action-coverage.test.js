// Every action a page sends must have a handler somewhere we can see.
//
// This repo talks to TWO separate Apps Script projects, and the source of
// only one of them is checked in. That gap is not theoretical: processOrder
// is the customer "Submit Order Request" on all five brand pages, and its
// handler exists in neither .gs file here. Pointing those pages at the other
// project — which is what "consolidate the deployments" means — would have
// silently killed every bike order, and nothing in the repo would have said
// so beforehand.
//
// So: enumerate the actions the HTML sends, enumerate the handlers the .gs
// files define, and fail on anything sent but not handled unless it is listed
// below as knowingly living only in a live project. New gaps fail loudly.
const fs = require('fs');
const path = require('path');

let fails = 0;
const ok = (n, c, e = '') => { console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : '')); if (!c) fails++; };

// Actions with no handler in this repo, and where each one really lives.
// Shrinking this map is the point of the consolidation; adding to it without
// a reason is how the gap got here.
const ONLY_IN_LIVE_PROJECT = {
  processOrder:    'Bike order submission — brand pages. Lives in the inventory project only. MUST be copied before those pages can move.',
  addBike:         'Adds a row from salespro. Lives in the inventory project only, if at all — no evidence it was ever written.',
  sendBalanceLink: 'Emails a balance link from balance.html. Lives in the CMS project only.'
};

const htmlFiles = fs.readdirSync('.').filter(f => f.endsWith('.html'));
const gsFiles = fs.readdirSync('.').filter(f => f.endsWith('.gs'));
ok('found pages to scan', htmlFiles.length > 10, String(htmlFiles.length));
ok('found Apps Script sources to scan', gsFiles.length > 0, String(gsFiles.length));

// --- what the pages send ------------------------------------------------
const sentBy = new Map(); // action -> Set(file)
for (const f of htmlFiles) {
  const t = fs.readFileSync(f, 'utf8');
  const add = a => {
    if (!sentBy.has(a)) sentBy.set(a, new Set());
    sentBy.get(a).add(f);
  };
  for (const m of t.matchAll(/action\s*[:=]\s*['"]([a-zA-Z][a-zA-Z0-9]*)['"]/g)) add(m[1]);
  for (const m of t.matchAll(/\?action=([a-zA-Z][a-zA-Z0-9]*)/g)) add(m[1]);
}
ok('found actions being sent', sentBy.size > 20, String(sentBy.size));

// --- what the .gs files handle ------------------------------------------
const gsSource = gsFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n');
const handled = new Set();
for (const m of gsSource.matchAll(/action\s*===\s*['"]([a-zA-Z][a-zA-Z0-9]*)['"]/g)) handled.add(m[1]);
for (const m of gsSource.matchAll(/^function\s+handle([A-Z][a-zA-Z0-9]*)/gm)) {
  handled.add(m[1][0].toLowerCase() + m[1].slice(1));
}
ok('found handlers defined', handled.size > 20, String(handled.size));

// --- the gap ------------------------------------------------------------
const gaps = [...sentBy.keys()].filter(a => !handled.has(a)).sort();
const unexpected = gaps.filter(a => !(a in ONLY_IN_LIVE_PROJECT));
ok('no action is sent without a handler or a documented reason',
   unexpected.length === 0,
   unexpected.map(a => a + ' (' + [...sentBy.get(a)].join(', ') + ')').join('; '));

// Keep the map honest in the other direction too: an entry that IS now
// handled here should be deleted, not left implying a gap that closed.
const stale = Object.keys(ONLY_IN_LIVE_PROJECT).filter(a => handled.has(a));
ok('the live-project map has no stale entries', stale.length === 0, stale.join(', '));

// And every entry must still be something a page actually sends.
const orphan = Object.keys(ONLY_IN_LIVE_PROJECT).filter(a => !sentBy.has(a));
ok('the live-project map has no orphan entries', orphan.length === 0, orphan.join(', '));

// --- the specific hazard, named -----------------------------------------
ok('processOrder is still flagged as unported',
   'processOrder' in ONLY_IN_LIVE_PROJECT && !handled.has('processOrder'));
ok('processOrder is still sent by all five brand pages',
   sentBy.has('processOrder') && sentBy.get('processOrder').size === 5,
   [...(sentBy.get('processOrder') || [])].join(', '));

// --- deployment inventory ------------------------------------------------
// Consolidation is done when this reads 1. Until then the count is the work.
const deployments = new Set();
for (const f of htmlFiles) {
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/AKfycb[A-Za-z0-9_-]+/g)) deployments.add(m[0]);
}
console.log('\nApps Script deployments referenced: ' + deployments.size);
for (const d of [...deployments].sort()) {
  const users = htmlFiles.filter(f => fs.readFileSync(f, 'utf8').includes(d));
  console.log('  …' + d.slice(-12) + '  ' + users.length + ' pages');
}
ok('deployment count is known and not growing', deployments.size <= 2, String(deployments.size));

console.log(fails ? `\n${fails} FAILED` : '\nAll passed');
process.exit(fails ? 1 : 0);
