// Drive salespro.html's five sheet-write paths in a real browser against a
// fake Apps Script, and assert each one reports what actually happened.
//
// The bug these guard: every write used to go out with mode:'no-cors'. An
// opaque response resolves identically whether the sheet took the write or
// the handler threw, so `.then(() => 'saved')` reported success no matter
// what. saveColors was throwing '"colors" column not found.' server-side on
// every call for months while the editor said "synced".
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Playwright and Chromium are installed outside the project here, so resolve
// both rather than assuming a local node_modules.
function loadPlaywright() {
  try { return require('playwright'); } catch (e) {}
  try {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return require(path.join(root, 'playwright'));
  } catch (e) {
    console.error('playwright not found - install it or run `npm i -g playwright`');
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
  return hit; // null lets Playwright fall back to its own lookup
}
const { chromium } = loadPlaywright();
const CHROME = findChromium();

let fails = 0;
const ok = (n, c, e = '') => { console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : '')); if (!c) fails++; };

const FILE = 'file://' + path.resolve('salespro.html');

// What the fake Apps Script should do on the next write.
// mode: 'ok' | 'refuse' | 'opaque-and-wrote' | 'opaque-and-lost' | 'dead'
async function boot(browser, mode, versionReply) {
  const page = await browser.newPage();
  const calls = [];
  // One row, so read-back has something to find.
  const sheet = {
    rowIndex: 33, id: 'mesalite', name: 'Mesa Lite', brand: 'Mokwheel',
    price: 1299, discontinued: '',
    colors: { 'One Size': { 'One Size': [{ name: 'Black', hex: '#111111' }] } },
    sizeGuide: {}
  };

  await page.route('**/macros/**', async route => {
    const url = new URL(route.request().url());
    const action = url.searchParams.get('action');
    calls.push(action || 'addBike');

    if (action === 'getSidebarInventory') {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify([sheet]) });
    }

    // The deployment self-check runs against this same fake, which is the
    // whole point of it: the check and the failing write share one URL.
    if (action === 'inventoryVersion') {
      if (versionReply === 'absent') {
        // An older deployment that has never heard of this action.
        return route.fulfill({ status: 200, contentType: 'text/html',
          body: '<html>unknown action</html>' });
      }
      if (versionReply === 'stale') {
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ ok: true, version: '2026-09-21c',
            handlersAreCurrent: false, staleHandlers: ['saveColors'],
            missingColumns: [], headers: ['Brand', 'Colors (JSON)'] }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, version: '2026-09-21c',
          handlersAreCurrent: true, staleHandlers: [],
          missingColumns: [], headers: ['Brand', 'Colors (JSON)'] }) });
    }

    // Apply the write to our fake sheet when the scenario says it landed.
    const apply = () => {
      if (action === 'saveColors')    sheet.colors    = JSON.parse(url.searchParams.get('json'));
      if (action === 'saveSizeGuide') sheet.sizeGuide = JSON.parse(url.searchParams.get('json'));
      if (action === 'updatePrice')   sheet.price     = Number(url.searchParams.get('price'));
      if (action === 'setDiscontinued') sheet.discontinued = url.searchParams.get('discontinued') || '';
    };

    if (mode === 'ok') { apply(); return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, rowIndex: 33 }) }); }

    if (mode === 'refuse') return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: '"colors" column not found.' }) });

    // Unreadable reply (what a CORS block looks like from our side): serve
    // HTML, which is not parseable JSON, so the code falls to read-back.
    if (mode === 'opaque-and-wrote') { apply();
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<html>Moved</html>' }); }
    if (mode === 'opaque-and-lost')
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<html>Moved</html>' });

    return route.abort('failed'); // 'dead'
  });

  await page.goto(FILE);
  await page.waitForFunction(() => typeof window.edSheetWrite === 'function'
    || typeof edSheetWrite === 'function', null, { timeout: 5000 }).catch(() => {});
  return { page, calls, sheet };
}

async function statusAfter(page, fn) {
  await page.evaluate(fn);
  await page.waitForFunction(() => {
    const el = document.getElementById('edStatus');
    return el && el.textContent && !/Saving|\.\.\./.test(el.textContent);
  }, null, { timeout: 8000 }).catch(() => {});
  return page.evaluate(() => {
    const el = document.getElementById('edStatus');
    return el ? el.textContent.trim() : '(no status element)';
  });
}

(async () => {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});

  // ---- edSheetWrite: the four verdicts, in isolation ----------------
  for (const [mode, want] of [['ok', 'ok'], ['refuse', 'refused'],
                              ['opaque-and-lost', 'opaque'], ['dead', 'network']]) {
    const { page } = await boot(browser, mode);
    const out = await page.evaluate(() =>
      edSheetWrite(AS_URL + '?action=saveColors&rowIndex=33&json=%7B%7D'));
    ok(`edSheetWrite reports "${want}" for a ${mode} server`, out.status === want,
       JSON.stringify(out));
    if (want === 'refused') {
      ok('edSheetWrite passes the server\'s own reason through',
         /column not found/.test(out.error), out.error);
    }
    await page.close();
  }

  // ---- edSheetWriteVerified: the opaque path resolves by read-back --
  {
    const { page } = await boot(browser, 'opaque-and-wrote');
    const out = await page.evaluate(() => edSheetWriteVerified(
      AS_URL + '?action=updatePrice&rowIndex=33&price=1199', 33,
      row => Number(row.price) === 1199));
    ok('unreadable reply + write landed → ok via read-back',
       out.status === 'ok' && out.viaReadBack === true, JSON.stringify(out));
    await page.close();
  }
  {
    const { page } = await boot(browser, 'opaque-and-lost');
    const out = await page.evaluate(() => edSheetWriteVerified(
      AS_URL + '?action=updatePrice&rowIndex=33&price=1199', 33,
      row => Number(row.price) === 1199));
    ok('unreadable reply + write lost → refused, not success',
       out.status === 'refused', JSON.stringify(out));
    ok('and it says the reason is hidden', /hidden/.test(out.error || ''), out.error);
    await page.close();
  }

  // ---- The regression, end to end: a refused save must NOT say saved --
  {
    const { page, sheet } = await boot(browser, 'refuse');
    const status = await statusAfter(page, () => {
      window.prompt = () => ADMIN_PASS;
      edActiveBike = { rowIndex: 33, name: 'Mesa Lite', basePrice: 1299, price: 1299 };
      edSwatchData = { 'One Size': { 'One Size': [{ name: 'Sand', hex: '#D9C7A3' }] } };
      edSaveColors();
    });
    ok('a refused colour save does NOT claim success', !/✅/.test(status), status);
    ok('a refused colour save shows the server reason verbatim',
       /column not found/.test(status), status);
    ok('the sheet really was left alone', sheet.colors['One Size']['One Size'][0].name === 'Black');
    await page.close();
  }

  // ---- The happy path still reads as success ------------------------
  {
    const { page, sheet } = await boot(browser, 'ok');
    const status = await statusAfter(page, () => {
      window.prompt = () => ADMIN_PASS;
      edActiveBike = { rowIndex: 33, name: 'Mesa Lite', basePrice: 1299, price: 1299 };
      edSwatchData = { 'One Size': { 'One Size': [{ name: 'Sand', hex: '#D9C7A3' }] } };
      edSaveColors();
    });
    ok('an accepted colour save reports success', /✅/.test(status), status);
    ok('and the sheet actually holds the new swatch',
       sheet.colors['One Size']['One Size'][0].name === 'Sand');
    await page.close();
  }

  // ---- Price: local state must not move on a refused write ----------
  {
    const { page } = await boot(browser, 'refuse');
    const status = await statusAfter(page, () => {
      window.prompt = () => ADMIN_PASS;
      edActiveBike = { rowIndex: 33, name: 'Mesa Lite', basePrice: 1299, price: 1299 };
      document.getElementById('edPriceInput').value = '999';
      edSavePrice();
    });
    ok('a refused price does NOT claim success', !/✅/.test(status), status);
    const local = await page.evaluate(() => edActiveBike.basePrice);
    ok('a refused price leaves local state on the OLD number', local === 1299, String(local));
    await page.close();
  }
  {
    const { page, sheet } = await boot(browser, 'ok');
    const status = await statusAfter(page, () => {
      window.prompt = () => ADMIN_PASS;
      edActiveBike = { rowIndex: 33, name: 'Mesa Lite', basePrice: 1299, price: 1299 };
      document.getElementById('edPriceInput').value = '999';
      edSavePrice();
    });
    ok('an accepted price reports success', /✅/.test(status), status);
    ok('an accepted price updates local state', await page.evaluate(() => edActiveBike.basePrice) === 999);
    ok('and the sheet holds it', sheet.price === 999);
    await page.close();
  }

  // ---- Size guide: same rule ----------------------------------------
  {
    const { page } = await boot(browser, 'refuse');
    const status = await statusAfter(page, () => {
      window.prompt = () => ADMIN_PASS;
      edActiveBike = { rowIndex: 33, name: 'Mesa Lite', basePrice: 1299, sizeGuide: {} };
      document.getElementById('edSizeGuideJson').value = '{"S":"5ft"}';
      edSaveSizeGuide();
    });
    ok('a refused size guide does NOT claim success', !/✅/.test(status), status);
    const local = await page.evaluate(() => JSON.stringify(edActiveBike.sizeGuide));
    ok('a refused size guide leaves local state empty', local === '{}', local);
    await page.close();
  }

  // ---- A refusal diagnoses itself, on this page's own AS_URL -------
  {
    const { page, calls } = await boot(browser, 'refuse', 'stale');
    const status = await statusAfter(page, () => {
      window.prompt = () => ADMIN_PASS;
      edActiveBike = { rowIndex: 33, name: 'Mesa Lite', basePrice: 1299 };
      edSwatchData = { 'One Size': { 'One Size': [{ name: 'Sand', hex: '#D9C7A3' }] } };
      edSaveColors();
    });
    // Wait for the follow-up report to land on the status line.
    await page.waitForFunction(() =>
      /AS_URL reports|could not reach|older deployment/.test(
        document.getElementById('edStatus').textContent), null, { timeout: 8000 }).catch(() => {});
    const full = await page.evaluate(() => document.getElementById('edStatus').textContent);
    ok('a refusal checks the deployment on the SAME url the write used',
       calls.includes('inventoryVersion'), calls.join(','));
    ok('and names the handler running old code', /saveColors/.test(full), full);
    ok('while keeping the original refusal reason', /column not found/.test(full), full);
    await page.close();
  }
  {
    // The case that has been invisible: this page points at a DIFFERENT
    // deployment than the one that was checked in a browser tab.
    const { page } = await boot(browser, 'refuse', 'absent');
    await statusAfter(page, () => {
      window.prompt = () => ADMIN_PASS;
      edActiveBike = { rowIndex: 33, name: 'Mesa Lite', basePrice: 1299 };
      edSwatchData = { 'One Size': { 'One Size': [{ name: 'Sand', hex: '#D9C7A3' }] } };
      edSaveColors();
    });
    await page.waitForFunction(() =>
      /older deployment/i.test(document.getElementById('edStatus').textContent),
      null, { timeout: 8000 }).catch(() => {});
    const full = await page.evaluate(() => document.getElementById('edStatus').textContent);
    ok('an endpoint with no inventoryVersion is called out as running old code',
       /still on OLD code/.test(full), full);
    // The part that kept going wrong: knowing WHICH deployment to update.
    const tail = await page.evaluate(() => edDeploymentId());
    ok('the message names the deployment this page actually writes to',
       tail.length > 4 && full.indexOf(tail) !== -1, tail + ' | ' + full);
    ok('and says a New version elsewhere will not help',
       /more than one web-app deployment/.test(full), full);
    ok('the deployment id is a recognisable tail of AS_URL',
       await page.evaluate(() => AS_URL.indexOf(edDeploymentId().replace('…', '')) !== -1), tail);
    await page.close();
  }

  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nAll passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
