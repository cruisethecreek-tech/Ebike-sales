#!/usr/bin/env node
// Stamp every page's site-enhance.js cache key with the file's content hash.
//
// Run this after ANY edit to site-enhance.js. Without it the change deploys
// but is not served: browsers and Cloudflare's edge keep the old copy under
// the old key, and the site looks exactly as it did before.
//
// site-enhance-cache-key.test.js fails if this has not been run.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'site-enhance.js'), 'utf8');
const hash = crypto.createHash('sha256').update(src, 'utf8').digest('hex').slice(0, 10);

let touched = 0;
for (const f of fs.readdirSync(root).filter((f) => f.endsWith('.html'))) {
  const p = path.join(root, f);
  const s = fs.readFileSync(p, 'utf8');
  const out = s.replace(/site-enhance\.js\?v=[0-9a-zA-Z]+/g, `site-enhance.js?v=${hash}`);
  if (out !== s) {
    fs.writeFileSync(p, out);
    touched++;
  }
}

console.log(`site-enhance.js -> v=${hash}${touched ? ` (${touched} page(s) restamped)` : ' (already current)'}`);
