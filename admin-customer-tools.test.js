// Three staff-side gaps, and the safety each one needs.
//
//   1. There was no way to remove a customer. Sixty-one rows including three
//      Patrick Simms accounts and a duplicate Kristi Simms, and nothing in the
//      portal could tidy any of it up.
//
//   2. There was no way to see the portal as a customer sees it. Everything
//      staff-facing shows their data; none of it shows their page.
//
//   3. The selected customer was `bg-[#2D4A32]/10` — brand green at ten
//      percent, which on a cream page lands as a barely-there grey, a shade off
//      the `#FBF7EF` hover. The one row that mattered looked like the one the
//      mouse was over.
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

// ── Deleting a customer ───────────────────────────────────────────────────
const actions = codeOnly(read('portal/app/admin/customers/actions.ts'));

ok('archive, restore and delete all exist',
  /export async function archiveCustomer/.test(actions) &&
  /export async function restoreCustomer/.test(actions) &&
  /export async function deleteCustomerForever/.test(actions));

// Every one of these is a POST endpoint anyone signed in can reach; the
// /admin layout's redirect never runs for a server action.
for (const fn of ['archiveCustomer', 'restoreCustomer', 'deleteCustomerForever', 'getRemovalImpact']) {
  const body = actions.slice(actions.indexOf(`export async function ${fn}`));
  ok(`${fn} checks admin first`, /^[\s\S]{0,400}?requireAdminUser\(\)/.test(body));
}

// The four guards on permanent deletion.
const del = actions.slice(
  actions.indexOf('export async function deleteCustomerForever'),
);
ok('cannot delete yourself', /customerId === adminId/.test(del));
ok('cannot delete an admin', /customer\.is_admin/.test(del));
ok('must be archived first', /!customer\.archived_at/.test(del));
ok('the name must be typed to confirm', /typed !== name\.toLowerCase\(\)/.test(del));
ok('a wrong confirmation deletes nothing',
  /Nothing was deleted/.test(del));

// Order matters: children before the row they point at, and the login last.
const iBikes = del.indexOf("from('bikes').delete()");
const iInvoices = del.indexOf("from('invoices').delete()");
const iCustomer = del.indexOf("from('customers').delete()");
const iAuth = del.indexOf('auth.admin.deleteUser');
ok('bikes and invoices go before the customer row',
  iBikes > 0 && iInvoices > 0 && iCustomer > iBikes && iCustomer > iInvoices);
ok('the login goes last', iAuth > iCustomer);
ok('people they referred are kept, not deleted',
  /update\(\{ referred_by: null \}\)/.test(del));
ok('a half-finished delete says so rather than reporting success',
  /login could not be removed/.test(del));

// The Sheet is the shop's books. Deleting a portal record must not imply it.
ok('it says the Sheet is untouched',
  /The Google Sheet is not touched|Sheet is not touched/.test(read('portal/app/admin/customers/remove-customer.tsx')));

const remove = codeOnly(read('portal/app/admin/customers/remove-customer.tsx'));
ok('the confirm button stays disabled until the name matches',
  /disabled=\{pending \|\| typed\.trim\(\)\.toLowerCase\(\) !== impact\.name\.toLowerCase\(\)\}/.test(remove));
ok('what will be destroyed is shown before confirming, not after',
  /impact\.invoices/.test(remove) && /impact\.bikes/.test(remove) && /impact\.invoiceTotal/.test(remove));
ok('an admin account offers no delete at all', /if \(isAdmin\)/.test(remove));

// Archiving has to be undoable, which means findable.
const dir = codeOnly(read('portal/app/admin/customers/customer-directory.tsx'));
ok('archived customers are hidden from the directory',
  /Boolean\(c\.archived_at\) !== showArchived/.test(dir));
ok('and reachable through a toggle', /setShowArchived/.test(dir));
ok('the archive is hidden from the search dock too',
  /\.is\('archived_at', null\)/.test(codeOnly(read('portal/app/admin/layout.tsx'))));

// ── Viewing as a customer ────────────────────────────────────────────────
const viewAs = codeOnly(read('portal/lib/view-as.ts'));
ok('the cookie only names a customer', /VIEW_AS_COOKIE/.test(viewAs));
ok('admin is re-checked on every read, not trusted from the cookie',
  /select\('is_admin'\)[\s\S]{0,200}if \(!me\?\.is_admin\) return asMyself\(\)/.test(viewAs));
ok('a non-admin previewing just sees themselves', /asMyself\(\)/.test(viewAs));
ok('the real user is still tracked separately', /realUserId/.test(viewAs));

const viewActions = codeOnly(read('portal/app/dashboard/view-as-actions.ts'));
ok('starting a preview is admin-guarded', /await requireAdminUser\(\)/.test(viewActions));
ok('the preview cookie is httpOnly', /httpOnly: true/.test(viewActions));
ok('and expires on its own', /maxAge/.test(viewActions));
ok('stopping needs no admin check — anyone may stop being someone else',
  !/requireAdminUser/.test(viewActions.slice(viewActions.indexOf('stopViewingAs'))));

const banner = codeOnly(read('portal/app/components/viewing-as-banner.tsx'));
ok('a banner says whose portal this is', /Previewing as \{viewingAs\.name\}/.test(banner));
ok('with a way out of it', /stopViewingAs/.test(banner));
ok('the banner is in the dashboard layout, so it is on every page',
  /<ViewingAsBanner \/>/.test(read('portal/app/dashboard/layout.tsx')));

// The dashboard must read the previewed customer, not the signed-in one.
for (const p of ['page.tsx', 'bikes/page.tsx', 'invoices/page.tsx', 'referrals/page.tsx']) {
  const src = codeOnly(read('portal/app/dashboard/' + p));
  ok(`/dashboard/${p} reads through the viewer context`, /getViewerContext\(\)/.test(src));
  ok(`/dashboard/${p} is never served from cache`, /export const dynamic = 'force-dynamic'/.test(src));
}

// Passkey registration posts as whoever is signed in, so offering it during a
// preview would add a passkey to the admin's account under the customer's name.
ok('passkey setup is hidden while previewing',
  /\{!viewingAs && <BiometricSetup \/>\}/.test(read('portal/app/dashboard/page.tsx')));

// ── The selection is visible ─────────────────────────────────────────────
const style = read('portal/lib/selection-style.ts');
ok('the selection style is defined once', /export const SELECTED_ROW/.test(style));
ok('it is gold, the brand accent, not green-at-ten-percent',
  /#C9A96E/.test(style) && /#F3E6C9/.test(style));
// Green-at-ten-percent survives as a quiet chip behind a brand name, which is
// what it is good at. What it must not be again is how the selected row is
// marked.
ok('nothing is selected with the old near-invisible tint',
  !/isSelected[\s\S]{0,60}bg-\[#2D4A32\]\/10/.test(read('portal/app/admin/customers/customer-directory.tsx')) &&
  !/isCurrent[\s\S]{0,60}bg-\[#2D4A32\]\/10/.test(read('portal/app/admin/now-viewing-dock.tsx')));
// focus:ring-[#2D4A32] on an input is a different thing and stays.
ok('and no selection ring of the same green',
  !/(isSelected|isCurrent)[\s\S]{0,80}[^:]ring-\[#2D4A32\]/.test(
    read('portal/app/admin/customers/customer-directory.tsx')) &&
  !/(isSelected|isCurrent)[\s\S]{0,80}[^:]ring-\[#2D4A32\]/.test(
    read('portal/app/admin/now-viewing-dock.tsx')));
ok('the table row uses it', /isSelected \? SELECTED_ROW : UNSELECTED_ROW/.test(dir));
ok('the mobile card uses it', /isSelected \? SELECTED_CARD : UNSELECTED_CARD/.test(dir));
ok('the dock grid uses it', /\? SELECTED_CARD/.test(codeOnly(read('portal/app/admin/now-viewing-dock.tsx'))));
ok('both panels use the same one',
  /\$\{SELECTED_PANEL\}/.test(dir) &&
  /\$\{SELECTED_PANEL\}/.test(codeOnly(read('portal/app/admin/now-viewing-dock.tsx'))));
ok('the selected row\'s button reads as a state, not an action',
  /'✓ Viewing'/.test(dir));

console.log(fails ? '\n' + fails + ' FAILED' : '\nAll passed');
process.exit(fails ? 1 : 0);
