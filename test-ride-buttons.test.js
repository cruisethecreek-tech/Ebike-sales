// Every bike preview offers both actions, and the test ride goes to the shop
// that bike is actually listed at.
//
// The Venus is listed under BOTH Kirk Road and Bears Den, so a bike-to-
// location lookup would have to pick one and be wrong for the other copy.
// The link is read off the section the row sits in instead. These tests exist
// to keep it that way: a customer sent to the wrong park for a bike that
// isn't there is a wasted trip.
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) {}
  try {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return require(path.join(root, 'playwright'));
  } catch (e) {
    console.error('playwright not found — install it or run `npm i -g playwright`');
    process.exit(1);
  }
}
function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  let hit = null;
  try {
    for (const d of fs.readdirSync(base)) {
      if (!/^chromium-/.test(d)) continue;
      const p = path.join(base, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(p)) hit = p;
    }
  } catch (e) {}
  return hit;
}
const { chromium } = loadPlaywright();
const CHROME = findChromium();

// The page fetches data/inventory.json, which a file:// origin blocks, so
// serve the directory over http for the duration of the run.
const http = require('http');
const TYPES = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript',
                '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
                '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function serve(root) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
      const file = path.resolve(root, rel);
      if (!file.startsWith(path.resolve(root))) { res.writeHead(403).end(); return; }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404).end('not found'); return; }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
        res.end(buf);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

let fails = 0;
const ok = (n, c, e = '') => { console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : '')); if (!c) fails++; };

const KIRK  = 'https://book.peek.com/s/57e3b62e-4f48-4cc4-8876-7b79f4c11baa/wqwLA';
const BEARS = 'https://book.peek.com/s/57e3b62e-4f48-4cc4-8876-7b79f4c11baa/Y2l4w';

(async () => {
  const server = await serve('.');
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const page = await browser.newPage();
  await page.goto(base + '/test-ride.html');
  await page.waitForSelector('li.has-preview', { timeout: 10000 });
  await page.waitForFunction(
    () => document.querySelectorAll('li.has-preview').length > 10, null, { timeout: 10000 });

  // The two section links this all derives from must still be there.
  const sectionLinks = await page.evaluate(() => ({
    kirk:  document.querySelector('#kirk-bikes')
             .closest('section.loc').querySelector('.loc-cta a.book').href,
    bears: document.querySelector('#bears-bikes')
             .closest('section.loc').querySelector('.loc-cta a.book').href,
  }));
  ok('Kirk Road still has its booking link', sectionLinks.kirk === KIRK, sectionLinks.kirk);
  ok('Bears Den still has its booking link', sectionLinks.bears === BEARS, sectionLinks.bears);
  ok('the two shops have different links', sectionLinks.kirk !== sectionLinks.bears);

  // Walk every previewed row and collect both buttons.
  const rows = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('li.has-preview').forEach(li => {
      const section = li.closest('section.loc');
      const ride = li.querySelector('.b-photo .b-actions a[href*="peek.com"]');
      const order = li.querySelector('.b-photo .b-actions a:not([href*="peek.com"])');
      out.push({
        name: li.dataset.name,
        list: section.querySelector('ul.bikes').id,
        rideHref: ride ? ride.href : null,
        rideText: ride ? ride.textContent.trim() : null,
        rideTarget: ride ? ride.target : null,
        rideRel: ride ? ride.rel : null,
        rideLabel: ride ? ride.getAttribute('aria-label') : null,
        orderHref: order ? order.getAttribute('href') : null,
        orderText: order ? order.textContent.trim() : null,
        orderOutlined: order ? order.classList.contains('b-order-alt') : null,
      });
    });
    return out;
  });

  ok('every listed bike got a preview', rows.length >= 18, String(rows.length));
  ok('every preview has a test ride button',
     rows.every(r => r.rideHref), rows.filter(r => !r.rideHref).map(r => r.name).join(', '));
  ok('every preview has an order button',
     rows.every(r => r.orderHref), rows.filter(r => !r.orderHref).map(r => r.name).join(', '));

  // The whole point: the link matches the list the row is in.
  const wrong = rows.filter(r =>
    r.rideHref !== (r.list === 'bears-bikes' ? BEARS : KIRK));
  ok('every test ride link points at the bike\'s own shop',
     wrong.length === 0,
     wrong.map(r => `${r.name} in ${r.list} → ${r.rideHref}`).join(' | '));

  // The bike that proves a location map would have been wrong.
  const venus = rows.filter(r => /Venus/.test(r.name));
  ok('the Venus appears in both lists', venus.length === 2,
     venus.map(v => v.list).join(', '));
  ok('each Venus links to its own shop, not one shared answer',
     venus.length === 2 && venus[0].rideHref !== venus[1].rideHref,
     venus.map(v => v.list + '→' + (v.rideHref || '').slice(-6)).join(' | '));

  // Wording and behaviour.
  ok('the test ride button says what it does',
     rows.every(r => /^Test ride this bike/.test(r.rideText)), rows[0].rideText);
  ok('the order button says what it does',
     rows.every(r => /^Order this bike/.test(r.orderText)), rows[0].orderText);
  ok('test ride links open in a new tab', rows.every(r => r.rideTarget === '_blank'));
  ok('and carry rel=noopener', rows.every(r => /noopener/.test(r.rideRel || '')));
  ok('the aria-label names the bike and the shop',
     rows.every(r => r.rideLabel && r.rideLabel.includes('at ')), rows[0].rideLabel);
  ok('the two identical-looking links are distinguishable to a screen reader',
     venus.length === 2 && venus[0].rideLabel !== venus[1].rideLabel,
     venus.map(v => v.rideLabel).join(' | '));

  // Order links still go to the right brand page.
  ok('order links point at a brand page with ?bike=',
     rows.every(r => /^(mokwheel|mooncool|jasion|heybike|velotric)\.html\?bike=/.test(r.orderHref)),
     rows.map(r => r.orderHref).find(h => !/^(mokwheel|mooncool|jasion|heybike|velotric)\.html\?bike=/.test(h)));
  ok('the order button is the outlined one, test ride keeps the lead',
     rows.every(r => r.orderOutlined === true));

  // Both must be reachable, not stacked off-screen, on a phone.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('li.has-preview .b-row');
  const geom = await page.evaluate(() => {
    const a = document.querySelector('li.has-preview .b-photo.open .b-actions');
    const links = [...a.querySelectorAll('a')].map(el => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) };
    });
    return { links, pageWidth: document.documentElement.clientWidth };
  });
  ok('both buttons render on a phone', geom.links.length === 2, JSON.stringify(geom.links));
  ok('neither button overflows the screen',
     geom.links.every(l => l.right <= geom.pageWidth + 1), JSON.stringify(geom));
  ok('both are big enough to tap',
     geom.links.every(l => l.h >= 32 && l.w >= 120), JSON.stringify(geom.links));

  await browser.close();
  server.close();
  console.log(fails ? `\n${fails} FAILED` : '\nAll passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
