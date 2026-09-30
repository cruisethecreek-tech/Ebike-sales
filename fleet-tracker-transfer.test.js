// Moving a GPS tracker from one bike to another.
//
// The hardware outlives the bike it is bolted to: a rental gets sold, a bike is
// written off, a customer trades up. The fleet page could register a tracker
// and nothing else, so the only way to follow the hardware was to delete it and
// register it again — which throws away everywhere the bike had been.
//
// The database was built for this and the UI never used it. trackers.bike_id is
// nullable and unique, `trackers_touch_assigned_at` pushes assigned_at forward
// whenever it changes, and the positions policy only lets a customer read fixes
// from `tracker_visible_since` onward. That combination is what stops a new
// owner reading the previous rider's history, and it only holds if the transfer
// changes bike_id and lets the trigger do the rest.
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

const actions = codeOnly(read('portal/app/admin/fleet/actions.ts'));
const page = codeOnly(read('portal/app/admin/fleet/page.tsx'));
const migration = read('portal/supabase/migrations/00012_gps_tracking.sql');

// ── The action ───────────────────────────────────────────────────────────
ok('a transfer action exists', /export async function transferTracker/.test(actions));

const transfer = actions.slice(actions.indexOf('export async function transferTracker'),
                               actions.indexOf('export async function acknowledgeAlert'));
ok('only an admin can move a tracker', /await requireAdminUser\(\)/.test(transfer));
ok('it updates the bike, not the tracker row wholesale',
  /\.update\(\{ bike_id: bikeId \}\)/.test(transfer));
ok('it targets one tracker', /\.eq\('id', trackerId\)/.test(transfer));

// The database sets assigned_at, and that timestamp is what hides the previous
// rider's history. Writing it here would move the line the wrong way.
ok('it never writes assigned_at itself', !/assigned_at/.test(transfer.replace(/`[^`]*`/g, '')));

// A bike already carrying a tracker is a unique violation, not a crash.
ok('a bike that already has one is explained', /23505/.test(transfer));
ok('and says what to do about it', /Move the other one off first/.test(transfer));

// A tracker between bikes lives on the shelf; the column is nullable for it.
ok('it can take a tracker off every bike', /__shelf__/.test(transfer));
ok('the shelf means null, not a bike id', /picked !== '__shelf__' \? picked : null/.test(transfer));

// The customer's own page shows this, so it cannot keep serving the old answer.
ok("the customer's page is revalidated", /revalidatePath\('\/dashboard\/bikes'\)/.test(transfer));

// ── The schema this leans on ─────────────────────────────────────────────
ok('bike_id is nullable and unique, so a tracker can move or sit out',
  /bike_id\s+uuid unique references public\.bikes \(id\)/.test(migration));
ok('the trigger stamps assigned_at on every change',
  /if new\.bike_id is distinct from old\.bike_id then[\s\S]{0,80}new\.assigned_at = now\(\)/.test(migration));
ok('a customer only sees fixes since the tracker became theirs',
  /fix_time >= public\.tracker_visible_since\(tracker_id\)/.test(migration));

// ── The page ─────────────────────────────────────────────────────────────
ok('every tracked bike has a move control', /action=\{transferTracker\}/.test(page));
ok('it carries the tracker it belongs to', /name="tracker_id" value=\{tracker\.id\}/.test(page));
ok('the shelf is offered', /Back on the shelf/.test(page));

// The owner has to be on the option itself. The optgroup heading says it once,
// but a closed select on a phone shows only the chosen line, and "Discover 3"
// alone does not say whose tracker you just moved.
ok('one option list feeds both the register form and every move control',
  /const bikeOptions = /.test(page) &&
  (page.match(/bikeOptions\.map/g) || []).length >= 2);
ok('each option names the owner', /— \$\{group\.label\}/.test(page));

// What the move means for the customer is the part that is not obvious.
ok('the confirmation says the new owner can now see it',
  /sees the bike on their My Bikes page/.test(read('portal/app/admin/fleet/page.tsx')));
ok('and that they cannot see anything from before',
  /nothing from before the move/.test(read('portal/app/admin/fleet/page.tsx')));
ok('taking it off says nobody can see it',
  /nobody can see its location/.test(read('portal/app/admin/fleet/page.tsx')));

console.log(fails ? '\n' + fails + ' FAILED' : '\nAll passed');
process.exit(fails ? 1 : 0);
