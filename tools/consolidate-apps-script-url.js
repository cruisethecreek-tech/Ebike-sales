#!/usr/bin/env node
/**
 * Point every page at one Apps Script deployment.
 *
 * RUN THIS LAST. The target deployment must already serve every action the
 * moved pages send — processOrder above all, which is the customer bike
 * order on five brand pages and whose handler is not in this repo. Sweeping
 * the URLs first would leave those pages posting orders to an endpoint that
 * does not know the action, and the brand pages show a confirmation on
 * failure, so nobody would find out.
 *
 * Usage:
 *   node tools/consolidate-apps-script-url.js --to <deploymentId> [--apply]
 *
 * Without --apply it prints what would change and touches nothing.
 */
const fs = require('fs');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const toIdx = args.indexOf('--to');
const target = toIdx !== -1 ? args[toIdx + 1] : null;

if (!target || !/^AKfycb[A-Za-z0-9_-]+$/.test(target)) {
  console.error('Usage: node tools/consolidate-apps-script-url.js --to <AKfycb…> [--apply]');
  console.error('Pass the FULL deployment id, exactly as it appears in the /exec URL.');
  process.exit(2);
}

const files = fs.readdirSync('.').filter(f => f.endsWith('.html'));
const ID = /AKfycb[A-Za-z0-9_-]+/g;

// Survey first, so the report is about the whole sweep rather than file by file.
const found = new Map();
for (const f of files) {
  for (const m of fs.readFileSync(f, 'utf8').matchAll(ID)) {
    if (!found.has(m[0])) found.set(m[0], new Set());
    found.get(m[0]).add(f);
  }
}
if (!found.has(target)) {
  console.error('Refusing: ' + target.slice(0, 16) + '… does not appear anywhere in this repo.');
  console.error('That usually means a typo, or a brand new deployment id that has not been');
  console.error('verified against a live page yet. Known ids:');
  for (const id of found.keys()) console.error('  ' + id);
  process.exit(1);
}

let changedFiles = 0, changedRefs = 0;
for (const f of files) {
  const before = fs.readFileSync(f, 'utf8');
  let n = 0;
  const after = before.replace(ID, id => { if (id !== target) n++; return target; });
  if (!n) continue;
  changedFiles++; changedRefs += n;
  console.log((apply ? 'rewrite  ' : 'would fix ') + f + '  (' + n + ' reference' + (n === 1 ? '' : 's') + ')');
  if (apply) fs.writeFileSync(f, after);
}

console.log('\n' + (apply ? 'Rewrote ' : 'Would rewrite ') + changedRefs +
            ' reference(s) across ' + changedFiles + ' file(s) to …' + target.slice(-12) + '.');
if (!apply) console.log('Nothing was written. Re-run with --apply once the target serves every action.');
else console.log('Now run: node apps-script-action-coverage.test.js');
