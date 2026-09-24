// The navigation is in site-enhance.js, and every page requests it with a
// ?v= cache key. If the file changes and the key does not, returning visitors
// and Cloudflare's edge keep serving the old copy — so the change ships, the
// deploy succeeds, and the site looks identical. There is nothing to see in
// the diff, in CI, or in the deploy log. It just quietly does not happen.
//
// That is exactly what went wrong: the key was last bumped 2026-09-15, while
// site-enhance.js changed on 09-21 (Customer Portal menu item) and twice on
// 09-23 (Ownership Options menu item). Two menu entries were invisible.
//
// Fix: the key IS the file's content hash, so it cannot be forgotten — change
// the file without regenerating and this test fails with the command to run.
//
//   node tools/stamp-site-enhance.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let fails = 0;
const ok = (n, c, e = '') => {
  console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : ''));
  if (!c) fails++;
};

const root = __dirname;
const src = fs.readFileSync(path.join(root, 'site-enhance.js'), 'utf8');
const expected = crypto.createHash('sha256').update(src, 'utf8').digest('hex').slice(0, 10);

const pages = fs
  .readdirSync(root)
  .filter((f) => f.endsWith('.html'))
  .filter((f) => /site-enhance\.js\?v=/.test(fs.readFileSync(path.join(root, f), 'utf8')));

ok('every page that needs the shared script was found', pages.length > 0, `${pages.length} pages`);

const stale = [];
for (const f of pages) {
  const s = fs.readFileSync(path.join(root, f), 'utf8');
  for (const m of s.matchAll(/site-enhance\.js\?v=([0-9a-zA-Z]+)/g)) {
    if (m[1] !== expected) stale.push(`${f} (${m[1]})`);
  }
}

ok(
  `all ${pages.length} pages request the current site-enhance.js`,
  stale.length === 0,
  stale.length
    ? `expected v=${expected}; stale: ${stale.slice(0, 4).join(', ')}${stale.length > 4 ? ` +${stale.length - 4} more` : ''} — run: node tools/stamp-site-enhance.js`
    : `v=${expected}`
);

// A page that loads the script without any key would be cached under whatever
// the edge decides, which is the same failure with no way to fix it.
const unkeyed = fs
  .readdirSync(root)
  .filter((f) => f.endsWith('.html'))
  .filter((f) => /src="site-enhance\.js"/.test(fs.readFileSync(path.join(root, f), 'utf8')));
ok('no page loads the script without a cache key', unkeyed.length === 0, unkeyed.join(', '));

console.log(fails ? `\n${fails} failing` : '\nall passing');
process.exit(fails ? 1 : 0);
