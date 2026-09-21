// The invoice generator must be able to SAVE an existing invoice without
// creating a payment link.
//
// Every path that persisted an invoice ran through Stripe, so "Create Payment
// Link" was the only button that wrote anything. Editing an existing invoice
// — to add a warranty tracking URL, say — meant either issuing the customer a
// second payment link for something they may already have paid, or not saving
// at all. Edit mode did relabel the submit button "Update Invoice", but
// onPaymentModeChange renamed it straight back moments later, so even that
// hint was gone by the time anyone looked.
const path = require('path');
const fs = require('fs');
const http = require('http');
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
const TYPES = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript',
                '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
function serve(root) {
  return new Promise(resolve => {
    const s = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
      fs.readFile(path.resolve(root, rel), (e, b) => {
        if (e) { res.writeHead(404).end('nf'); return; }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(rel)] || 'application/octet-stream' });
        res.end(b);
      });
    });
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
}

let fails = 0;
const ok = (n, c, e = '') => { console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : '')); if (!c) fails++; };

const INVOICE = {
  invoiceNumber: 'CTR-068', invoiceDate: '2026-09-17', dueDate: '2026-10-01',
  customerName: 'Allan Zinz', customerEmail: 'allan@example.com',
  customerPhone: '3305189496', customerAddress: '1 Creek Rd',
  paymentMode: 'full', paymentLink: 'https://pay.example.com/existing-link',
  supplierUrl: '', discountPct: 0, discountAmt: 0, deposit: 0,
  lineItems: [{ description: 'Mooncool TK2Pro (Blue Haze)', qty: 1, price: 1999 }],
};

(async () => {
  const server = await serve('.');
  const base = 'http://127.0.0.1:' + server.address().port;
  const { chromium } = loadPlaywright();
  const CHROME = findChromium();
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

  // Stand in for Apps Script: answer the JSONP getInvoice, and record writes.
  const writes = [];
  await page.route('**/macros/**', async route => {
    const url = new URL(route.request().url());
    const action = url.searchParams.get('action');
    if (action === 'getInvoice') {
      const cb = url.searchParams.get('callback');
      return route.fulfill({ status: 200, contentType: 'text/javascript',
        body: `${cb}(${JSON.stringify({ status: 'ok', invoice: INVOICE })})` });
    }
    writes.push({ action, url: route.request().url(), method: route.request().method() });
    // addOrder and setInvoiceMeta are JSONP — they run a callback rather than
    // returning JSON to a fetch. Answering with plain JSON leaves their
    // callbacks unfired, and the supplier URL is saved from inside
    // addOrder's, so the mock has to match the real transport.
    const cb = url.searchParams.get('callback');
    if (cb) {
      const payload = action === 'setInvoiceMeta'
        ? { status: 'ok', supplierUrl: url.searchParams.get('supplierUrl') || '' }
        : { ok: true, status: 'ok', invoiceNumber: url.searchParams.get('invoiceNumber') || 'CTR-068' };
      return route.fulfill({ status: 200, contentType: 'text/javascript',
        body: `${cb}(${JSON.stringify(payload)})` });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"status":"ok"}' });
  });
  // Stripe and the portal sync.
  const stripeCalls = [], portalCalls = [];
  await page.route('**/api/invoices/sync', async route => {
    portalCalls.push(JSON.parse(route.request().postData() || '{}'));
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.route('**/create-invoice**', async route => {
    stripeCalls.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: '{"hostedInvoiceUrl":"https://pay.example.com/NEW"}' });
  });

  await page.goto(base + '/invoice.html?edit=CTR-068');
  await page.waitForFunction(
    () => document.getElementById('invoiceNumber')?.value === 'CTR-068', null, { timeout: 15000 });

  // --- the button exists and is visible in edit mode ---------------------
  const btn = await page.evaluate(() => {
    const b = document.getElementById('saveBtn');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { hidden: b.hidden, type: b.type, text: b.textContent.trim(),
             visible: r.width > 0 && r.height > 0 };
  });
  ok('a Save Changes button exists', btn !== null);
  ok('it is visible when editing an existing invoice', btn && btn.visible && !btn.hidden,
     JSON.stringify(btn));
  ok('it says what it does', btn && /save changes/i.test(btn.text), btn && btn.text);
  ok('it does not submit the form', btn && btn.type === 'button', btn && btn.type);

  // The bug that hid the old hint: the payment-mode handler renames submit.
  await page.click('input[name="paymentMode"][value="full"]');
  const stillThere = await page.evaluate(() => !document.getElementById('saveBtn').hidden);
  ok('changing payment mode does not hide it', stillThere);

  // --- saving writes, without Stripe -------------------------------------
  writes.length = 0; portalCalls.length = 0; stripeCalls.length = 0;
  await page.fill('#supplierUrl', 'https://shop.app/orders/55155678466');
  await page.click('#saveBtn');
  await page.waitForFunction(
    () => /Saved CTR-068/.test(document.getElementById('statusMessage').textContent),
    null, { timeout: 10000 }).catch(() => {});

  const status = await page.evaluate(() => document.getElementById('statusMessage').textContent.trim());
  ok('it reports the invoice it saved', /Saved CTR-068/.test(status), status);
  ok('it says no payment link was created', /No payment link was created/i.test(status), status);
  ok('NO Stripe invoice was created', stripeCalls.length === 0, stripeCalls.join(', '));
  ok('the Sheet was written', writes.some(w => /addOrder/i.test(w.action || w.url)),
     writes.map(w => w.action).join(', '));
  ok('the portal was synced once', portalCalls.length === 1, String(portalCalls.length));

  // Give the JSONP follow-up (setInvoiceMeta, fired from addOrder's callback)
  // a moment to land.
  await page.waitForFunction(
    () => true, null, { timeout: 100 }).catch(() => {});
  await page.waitForTimeout(600);

  const sent = portalCalls[0] || {};
  const meta = writes.find(w => w.action === 'setInvoiceMeta');
  ok('the staff-only supplier URL is persisted too', !!meta,
     writes.map(w => w.action).join(', '));
  ok('and it carries the value that was just typed',
     meta && /55155678466/.test(meta.url), meta && meta.url);
  ok('the saved payload carries the line items',
     Array.isArray(sent.items) && sent.items.length === 1, JSON.stringify(sent.items));
  ok('the line item keeps its description',
     sent.items && /Mooncool TK2Pro/.test(sent.items[0].description), JSON.stringify(sent.items));
  ok('the existing payment link is preserved, not blanked',
     sent.paymentLink === INVOICE.paymentLink, sent.paymentLink);
  ok('the invoice number is unchanged', sent.invoiceNumber === 'CTR-068', sent.invoiceNumber);
  ok('it did not roll on to the next invoice number',
     (await page.inputValue('#invoiceNumber')) === 'CTR-068');

  // --- a blank form has nothing to save ----------------------------------
  const fresh = await browser.newPage();
  await fresh.goto(base + '/invoice.html');
  await fresh.waitForSelector('#saveBtn', { state: 'attached', timeout: 10000 });
  ok('the button is hidden on a new blank invoice',
     await fresh.evaluate(() => document.getElementById('saveBtn').hidden));
  await fresh.close();

  await browser.close();
  server.close();
  console.log(fails ? `\n${fails} FAILED` : '\nAll passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
