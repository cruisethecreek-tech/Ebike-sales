// Importing the old Wix customer list.
//
// The failure mode of a CSV import is not that it crashes — it is that it
// quietly succeeds at the wrong thing. Splitting on commas puts an address's
// second comma into the phone column, a re-run makes a second copy of
// everybody, and a bulk account creation mails two hundred people a "set your
// password" link about a shop they half remember. Each of those looks like a
// clean run from the outside.
const fs = require('fs');
const path = require('path');

let fails = 0;
const ok = (n, c, e = '') => {
  console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : ''));
  if (!c) fails++;
};
const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const codeOnly = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');

// Load the real parser.
const { parseCsv, parseCsvRows, guessMapping } = (() => {
  const { execFileSync } = require('child_process');
  const os = require('os');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-'));
  execFileSync(path.join(__dirname, 'portal/node_modules/.bin/esbuild'), [
    path.join(__dirname, 'portal/lib/csv.ts'),
    '--format=cjs', '--platform=node', '--outfile=' + path.join(out, 'csv.js'),
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  return require(path.join(out, 'csv.js'));
})();

// ── The comma that ruins everything ──────────────────────────────────────
{
  const csv = [
    'First Name,Last Name,Email,Phone,Address',
    'Danielle,Howell,danielle24ohio@aol.com,7403389608,"329 kennon st, Bridgeport, OH 43912"',
  ].join('\n');
  const { headers, rows } = parseCsvRows(csv);
  ok('a quoted address does not shift the columns',
    rows[0].Phone === '7403389608', JSON.stringify(rows[0]));
  ok('and arrives whole',
    rows[0].Address === '329 kennon st, Bridgeport, OH 43912', rows[0].Address);
  ok('headers are read', headers.length === 5, headers.join('|'));
}

// Wix writes doubled quotes for a literal quote, and wraps order notes that
// contain newlines.
{
  const csv = 'Email,Note\na@b.com,"He said ""leave it on the porch""\nring twice"\nc@d.com,fine';
  const { rows } = parseCsvRows(csv);
  ok('an escaped quote survives', /leave it on the porch/.test(rows[0].Note), rows[0].Note);
  ok('a newline inside quotes does not split the row', rows.length === 2, String(rows.length));
  ok('the row after it is still right', rows[1].Email === 'c@d.com', rows[1].Email);
}

ok('a BOM does not become part of the first header',
  parseCsvRows('﻿Email,Name\na@b.com,Al').headers[0] === 'Email');
ok('trailing blank lines are dropped', parseCsv('a,b\n1,2\n\n\n').length === 2);
ok('a file with no trailing newline keeps its last row',
  parseCsvRows('Email\na@b.com').rows.length === 1);
ok('an empty file is empty, not a crash', parseCsv('').length === 0);

// ── Guessing the columns ─────────────────────────────────────────────────
{
  const g = guessMapping(['First Name', 'Last Name', 'Email', 'Phone', 'Email Subscriber Status']);
  ok('the address column beats the subscriber-status one', g.email === 'Email', g.email);
  ok('first and last name are found', g.firstName === 'First Name' && g.lastName === 'Last Name');
}
{
  // A Wix Stores orders export names things differently.
  const g = guessMapping(['Order Number', 'Date Created', 'Buyer Email', 'Buyer Phone', 'Item Name', 'Total']);
  ok('an orders export is understood too',
    g.email === 'Buyer Email' && g.orderNumber === 'Order Number' && g.bike === 'Item Name',
    JSON.stringify(g));
}
ok('no column is claimed twice',
  (() => {
    const g = guessMapping(['Name', 'Email', 'Phone']);
    const picked = Object.values(g);
    return new Set(picked).size === picked.length;
  })());

// ── What the import must not do ──────────────────────────────────────────
const actions = codeOnly(read('portal/app/admin/customers/import/actions.ts'));

ok('only an admin can import', /await requireAdminUser\(\)/.test(actions));

// 1. Nobody gets emailed.
ok('accounts are created with the call that sends nothing',
  /auth\.admin\.createUser\(/.test(actions));
ok('and never with the one that sends an invite',
  !/inviteUserByEmail/.test(actions),
  'a bulk invite would mail hundreds of people and hit the 30/hour cap anyway');

// 2. Nobody gets duplicated.
ok('an existing login is found before creating one',
  /findAuthUserByEmail\(supabase, email\)/.test(actions));
ok('a create that loses the race is recovered, not failed',
  /isAlreadyRegistered\(makeErr\)/.test(actions));
ok('the same person twice in one file is only created once',
  /seen\.set\(email, userId!\)/.test(actions) && /seen\.get\(email\)/.test(actions));
ok('a corrected record is not overwritten by older Wix data',
  /if \(!current\.phone && raw\.phone/.test(actions));

// 3. Nothing is claimed that did not happen.
ok('every row reports an outcome', /outcomes\.push/.test(actions));
ok('a row with no email is skipped and says so',
  /status: 'skipped'[\s\S]{0,120}No usable email/.test(actions));
ok('a failed bike insert is reported, not swallowed',
  /Bike not registered: \$\{bikeErr\.message\}/.test(actions));

// A Wix order number must not be mistaken for a Sheet invoice.
ok('order numbers are prefixed WIX-', /`WIX-\$\{raw\.orderNumber/.test(actions));

// A date it cannot read must not become a wrong warranty date.
ok('an unreadable date becomes null, not a guess',
  /return null\s*\n\}/.test(actions) && /Unrecognised beats wrong/.test(read('portal/app/admin/customers/import/actions.ts')));

// Bikes go through the same detector as everything else, so "(Free
// Installation)" behaves the same way here as on an invoice.
ok('bikes use the shared detector', /from '@\/lib\/detect-bike'/.test(actions));

// ── The screen tells the truth before you press the button ───────────────
const ui = codeOnly(read('portal/app/admin/customers/import/import-client.tsx'));
ok('the mapping is shown for checking, not applied silently',
  /Which column is which/.test(ui));
ok('a preview shows rows as the importer reads them', /rows\.slice\(0, 5\)/.test(ui));
ok('rows with no email are counted up front', /unusable/.test(ui));
ok('it says plainly that nobody is emailed', /Nobody is emailed/.test(ui));
ok('the results list the rows that did nothing',
  /o\.status === 'failed' \|\| o\.status === 'skipped'/.test(ui));
ok('the directory links to it',
  /admin\/customers\/import/.test(read('portal/app/admin/customers/page.tsx')));

console.log(fails ? '\n' + fails + ' FAILED' : '\nAll passed');
process.exit(fails ? 1 : 0);
