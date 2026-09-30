// The free 30-day break-in tune-up countdown.
//
// A new e-bike settles in its first weeks — spokes seat, cables stretch, disc
// brakes bed in — and the shop does that first tune-up free. Only a customer
// who knows about it books it, and nothing told them.
//
// Two rules matter and both are easy to get wrong:
//
//   The window is 40 days from PURCHASE, not 30, because a bike that shipped
//   can be a week in a box and the customer should not lose that week.
//
//   When it runs out it disappears without a word. A countdown that turns into
//   "EXPIRED" is not information, it is a reproach for an offer the customer
//   may never have been told about.
const fs = require('fs');
const path = require('path');

let fails = 0;
const ok = (n, c, e = '') => {
  console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : ''));
  if (!c) fails++;
};
const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const codeOnly = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '')
     .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');

const { breakInOffer, BREAK_IN_WINDOW_DAYS } = (() => {
  const { execFileSync } = require('child_process');
  const os = require('os');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-'));
  execFileSync(path.join(__dirname, 'portal/node_modules/.bin/esbuild'), [
    path.join(__dirname, 'portal/lib/break-in-tuneup.ts'),
    '--format=cjs', '--platform=node', '--outfile=' + path.join(out, 'b.js'),
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  return require(path.join(out, 'b.js'));
})();

const NOW = new Date(2026, 8, 30); // 30 September 2026, local midnight
const bike = (d) => [{ brand: 'Velotric', model: 'Discover 3', purchase_date: d }];
const daysBefore = (n) => {
  const d = new Date(2026, 8, 30 - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

ok('the window is 40 days, not 30', BREAK_IN_WINDOW_DAYS === 40, String(BREAK_IN_WINDOW_DAYS));

// ── The boundaries ───────────────────────────────────────────────────────
ok('bought today → the full window', breakInOffer(bike(daysBefore(0)), NOW).daysLeft === 40);
ok('bought yesterday → 39 left', breakInOffer(bike(daysBefore(1)), NOW).daysLeft === 39);
ok('day 30 still has 10 left — the shipping allowance',
  breakInOffer(bike(daysBefore(30)), NOW).daysLeft === 10);
ok('day 38 → 2 left', breakInOffer(bike(daysBefore(38)), NOW).daysLeft === 2);
ok('day 39 → the last day', breakInOffer(bike(daysBefore(39)), NOW).daysLeft === 1);
ok('and knows to say "day" not "days"', breakInOffer(bike(daysBefore(39)), NOW).lastDay === true);

// The whole point: it goes quiet rather than nagging.
ok('day 40 → gone, silently', breakInOffer(bike(daysBefore(40)), NOW) === null);
ok('day 41 → still gone', breakInOffer(bike(daysBefore(41)), NOW) === null);
ok('a year later → gone', breakInOffer(bike('2025-01-01'), NOW) === null);

// ── Nothing to say, said nothing ─────────────────────────────────────────
ok('no bikes → nothing', breakInOffer([], NOW) === null);
ok('null bikes → nothing', breakInOffer(null, NOW) === null);
ok('no purchase date → nothing, not a guess',
  breakInOffer([{ brand: 'Heybike', model: 'Ranger', purchase_date: null }], NOW) === null);
ok('an unparseable date → nothing',
  breakInOffer([{ brand: 'Heybike', model: 'Ranger', purchase_date: 'last spring' }], NOW) === null);

// ── Which bike ───────────────────────────────────────────────────────────
{
  // An old bike must not drag a new one out of its window.
  const offer = breakInOffer(
    [
      { brand: 'Heybike', model: 'Ranger 3.0', purchase_date: '2024-03-01' },
      { brand: 'Velotric', model: 'Summit 2', purchase_date: daysBefore(5) },
    ],
    NOW,
  );
  ok('the newest bike is the one that counts', offer && offer.daysLeft === 35, JSON.stringify(offer));
  ok('and the banner names it', offer && offer.model === 'Summit 2', offer && offer.model);
}
ok('an old bike alone gets nothing',
  breakInOffer([{ brand: 'Heybike', model: 'Ranger', purchase_date: '2024-03-01' }], NOW) === null);

// A date typed in the future is a typo or a pre-order — either way the customer
// has not got the bike yet, so the clock has not started.
ok('a future purchase date gets the full window',
  breakInOffer(bike('2026-12-25'), NOW).daysLeft === 40);

// The count must not shift with the hour the page is opened.
{
  const early = breakInOffer(bike(daysBefore(10)), new Date(2026, 8, 30, 0, 5));
  const late = breakInOffer(bike(daysBefore(10)), new Date(2026, 8, 30, 23, 55));
  ok('same answer at one minute past midnight and five to midnight',
    early.daysLeft === late.daysLeft, `${early.daysLeft} vs ${late.daysLeft}`);
}

// ── The banner ───────────────────────────────────────────────────────────
const banner = codeOnly(read('portal/app/components/break-in-countdown.tsx'));
ok('it renders nothing when there is no offer', /if \(!offer\) return null/.test(banner));
ok('it never says expired', !/expired/i.test(banner));
ok('the booking link carries the free promo', /promo=BREAKIN/.test(banner));
ok('it explains the 40 days are for shipping', /allows for shipping/.test(banner));
ok('it is on the dashboard', /<BreakInCountdown/.test(read('portal/app/dashboard/page.tsx')));

// ── The booking page has to honour it ────────────────────────────────────
//
// Sending someone from a banner that says "free" to a page quoting $125 would
// be worse than never offering it.
const intake = codeOnly(read('repair-intake.html'));
ok('the intake form knows the promo', /promo === 'BREAKIN'/.test(intake));
ok('it takes the whole price off, not a fifth',
  /isBreakInTuneup \? basePrice/.test(intake));
ok('the two discounts cannot stack', /\} else if \(promo === '20OFF'/.test(intake));
ok('the flag is declared', /let isBreakInTuneup = false;/.test(intake));
ok('the work order records why it was free',
  /100% — free 30-day break-in tune-up/.test(intake));

console.log(fails ? '\n' + fails + ' FAILED' : '\nAll passed');
process.exit(fails ? 1 : 0);
