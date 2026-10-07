// "Open in Invoice Generator" on a portal customer card opened a blank
// invoice. The card sent ?customer= for the name; the generator only reads
// ?name=. This drives the real invoice.html with the portal stubbed out.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) {}
  try { return require(path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); }
  catch (e) { console.error('playwright not found'); process.exit(1); }
}

let fails = 0;
const ok = (n, c, e = '') => { console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : '')); if (!c) fails++; };
const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');

// The portal side: every generator link from a customer card goes through
// the one helper, and none still sends ?customer=.
for (const f of ['portal/app/admin/customers/customer-directory.tsx', 'portal/app/admin/now-viewing-dock.tsx']) {
  const src = read(f);
  ok(`${f} no longer sends ?customer=`, !/invoice\.html\?customer=/.test(src));
  ok(`${f} uses newInvoiceUrl`, /newInvoiceUrl\(STORE_URL,/.test(src));
}
const helper = read('portal/lib/generator-link.ts');
ok('helper sends ?name=', /params\.set\('name'/.test(helper));
ok('helper never passes the customer\'s own code as ?ref=', !/params\.set\('ref'/.test(helper));

const ANNA = { name: 'Anna James', email: 'anna@example.com', phone: '(330) 881-8812', address: '1 Creek Rd, Canfield, OH' };

async function open(browser, query) {
  const page = await browser.newPage();
  page.on('dialog', (d) => d.dismiss());
  await page.addInitScript(() => { try { localStorage.setItem('ctc_portal_admin_key', 'k'); } catch (e) {} });
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith('https://shop.test/invoice.html')) {
      return route.fulfill({ status: 200, contentType: 'text/html', body: read('invoice.html') });
    }
    if (u.includes('/api/customers')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, customers: [{ name: 'Bob Other', email: 'bob@example.com', phone: '' }, ANNA] }) });
    }
    if (u.includes('/data/') || u.endsWith('.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
  });
  await page.goto('https://shop.test/invoice.html' + query);
  await page.waitForTimeout(800);
  const v = (id) => page.$eval('#' + id, (el) => el.value);
  return { page, v };
}

(async () => {
  const browser = await loadPlaywright().chromium.launch();
  try {
    // What the portal now sends.
    let { page, v } = await open(browser, '?name=Anna%20James&email=anna%40example.com&phone=(330)%20881-8812');
    ok('name is filled', (await v('customerName')) === 'Anna James', await v('customerName'));
    ok('email is filled', (await v('customerEmail')) === 'anna@example.com');
    ok('phone is filled', (await v('customerPhone')) === '(330) 881-8812');
    ok('the matching customer is picked in the directory', (await v('existingCustSelect')) === '1');
    ok('their address on file fills in', (await v('customerAddress')) === ANNA.address);
    ok('Referred By stays empty', (await v('referredBy')) === '');
    await page.close();

    // A link from a tab opened before this fix still works.
    ({ page, v } = await open(browser, '?customer=Anna%20James&phone=3308818812&email='));
    ok('old ?customer= links fill the name', (await v('customerName')) === 'Anna James');
    ok('matches by phone when there is no email', (await v('existingCustSelect')) === '1');
    await page.close();

    // Opening an existing invoice must not be overridden by the picker.
    ({ page, v } = await open(browser, '?edit=CTR-001&email=anna%40example.com'));
    ok('edit links do not auto-pick a customer', (await v('existingCustSelect')) === '');
    await page.close();
  } finally {
    await browser.close();
  }
  console.log(fails ? `\n${fails} failing` : '\nall passing');
  process.exit(fails ? 1 : 0);
})();
