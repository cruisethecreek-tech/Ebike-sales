// Every public page must offer a way into the customer portal, and nothing
// may invite a visitor to register for it.
//
// The portal is invite-only: accounts are created when someone buys a bike.
// A "sign up" link would send people to a form that does not exist.
//
// The reach test has to look in the right place. site-enhance.js retires
// every per-page .top-nav with display:none !important and builds one menu
// for the whole site, so a link added to a page's own nav renders nowhere —
// which is exactly the mistake this file caught the first time it ran.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) {}
  try { return require(path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); }
  catch (e) { console.error('playwright not found'); process.exit(1); }
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

let fails = 0;
const ok = (n, c, e = '') => { console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : '')); if (!c) fails++; };

// Staff-only tools. Not public pages, so they get no customer portal link.
const STAFF = new Set(['analytics.html', 'balance.html', 'invoice.html',
                       'salespro.html', 'migrate-images.html']);
// Pages with neither the shared menu nor a footer to hang a link on.
const NO_CHROME = new Set(['goodcall-knowledge.html', 'poles.html', 'quiz.html']);

const pages = fs.readdirSync('.').filter(f => f.endsWith('.html'));
const read = f => fs.readFileSync(f, 'utf8');

// --- reach ---------------------------------------------------------------
const enhanced = pages.filter(f => read(f).includes('site-enhance.js'));
ok('the shared menu covers most of the site', enhanced.length > 35, String(enhanced.length));

const missing = pages.filter(f => {
  if (f === 'portal.html' || STAFF.has(f) || NO_CHROME.has(f)) return false;
  const t = read(f);
  return !t.includes('site-enhance.js') && !t.includes('portal.html');
});
ok('pages outside the shared menu still link to the portal',
   missing.length === 0, missing.join(', '));

const leaked = [...STAFF].filter(f => fs.existsSync(f) && /href="portal\.html"/.test(read(f)));
ok('staff tools are not given a customer portal link', leaked.length === 0, leaked.join(', '));

// --- no registration anywhere -------------------------------------------
const REGISTER = /(sign\s*up|create an account|register (for )?(an |a )?account|new account)/i;
const offenders = [];
for (const f of pages) {
  read(f).split(/\n/).forEach((line, i) => {
    if (/portal/i.test(line) && REGISTER.test(line)) offenders.push(`${f}:${i + 1}`);
  });
}
ok('nothing invites a visitor to register for the portal',
   offenders.length === 0, offenders.join(', '));

// --- the menu entry ------------------------------------------------------
const enh = read('site-enhance.js');
ok('the menu entry exists', /label: 'Customer Portal'/.test(enh));
ok('the menu entry is defined once',
   (enh.match(/label: 'Customer Portal'/g) || []).length === 1);
ok('it points at the explainer, not straight at the login',
   /label: 'Customer Portal', url: 'portal\.html'/.test(enh));

// --- the page itself -----------------------------------------------------
const p = read('portal.html');
ok('the portal page points at the real portal', p.includes('https://portal.cruisethecreek.com'));
ok('it states there is no sign-up form', /no sign-up form/i.test(p));
ok('it explains access comes by email invitation', /invitation/i.test(p) && /email/i.test(p));
ok('it says what to do if the invite never arrived', /resend/i.test(p));
ok('it covers the dealer case', /authorized dealer/i.test(p));
ok('it names the brands we are authorized for',
   ['Heybike','Velotric','Mooncool','Mokwheel','Jasion'].every(b => p.includes(b)));
ok('it gives a route for people who have not bought yet',
   /test-ride\.html/.test(p) && /shop\.html/.test(p));
ok('it does not invent a warranty length',
   !/\b\d+[- ]year warranty\b/i.test(p), (p.match(/\b\d+[- ]year warranty\b/i) || [])[0]);

(async () => {
  const { chromium } = loadPlaywright();
  const CHROME = findChromium();
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});

  for (const [w, h, label] of [[1280, 800, 'desktop'], [390, 844, 'phone']]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto('file://' + path.resolve('index.html'));
    await page.waitForSelector('#ctc-menu-btn', { timeout: 15000 });

    ok(`${label}: the legacy per-page nav stays retired`,
       await page.evaluate(() => {
         const n = document.getElementById('topNav');
         return !n || getComputedStyle(n).display === 'none';
       }));

    await page.click('#ctc-menu-btn');
    await page.waitForTimeout(450);
    const item = await page.evaluate(() => {
      const a = [...document.querySelectorAll('.ctc-menu-panel a')]
        .find(x => /customer portal/i.test(x.textContent));
      if (!a) return null;
      const r = a.getBoundingClientRect();
      return { href: a.getAttribute('href'), h: Math.round(r.height),
               left: Math.round(r.left), right: Math.round(r.right),
               pageW: document.documentElement.clientWidth,
               visible: r.width > 0 && r.height > 0 };
    });
    ok(`${label}: Customer Portal is in the site menu`, !!(item && item.visible),
       JSON.stringify(item));
    ok(`${label}: it is tappable and on screen`,
       !!(item && item.h >= 32 && item.left >= 0 && item.right <= item.pageW + 1),
       JSON.stringify(item));
    await page.close();
  }

  // --- the portal page renders and its CTA works -------------------------
  const pp = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await pp.goto('file://' + path.resolve('portal.html'));
  const cta = await pp.evaluate(() => {
    const a = document.querySelector('.signin a.btn');
    const r = a.getBoundingClientRect();
    return { href: a.href, target: a.target, rel: a.rel, h: Math.round(r.height),
             right: Math.round(r.right), pageW: document.documentElement.clientWidth };
  });
  ok('the sign-in button points at the portal',
     cta.href.startsWith('https://portal.cruisethecreek.com'), cta.href);
  ok('it opens in a new tab with rel=noopener',
     cta.target === '_blank' && /noopener/.test(cta.rel), cta.target + ' ' + cta.rel);
  ok('it is tappable and on screen',
     cta.h >= 40 && cta.right <= cta.pageW + 1, JSON.stringify(cta));
  const overflow = await pp.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('the portal page has no horizontal scroll on a phone', overflow <= 1, String(overflow));

  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nAll passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
