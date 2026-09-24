// Three things the admin portal got wrong, locked down.
//
// 1. "Total Spent" counted only invoices whose status was 'paid'. 12 of 55
//    invoices are marked paid, so customers with a real bike on a real
//    invoice read $0.00 — the screenshot shows three of them in a row, each
//    with "1 invoice" right beside "$0.00". A figure that contradicts the
//    line under it is worse than no figure.
//
// 2. There was no way to get from an invoice to the customer who owns it.
//    The only route to a profile was scrolling the directory by hand.
//
// 3. "Activate Biometrics" created a passkey, threw it away, and set a
//    localStorage flag. Nothing reached a server, so sign-in had nothing to
//    check against — and every failure other than a cancelled prompt was
//    caught and reported as "✅ Device registered!". These tests assert the
//    real thing exists: a stored public key, a verified signature, and a
//    session minted only after verification.
const fs = require('fs');
const path = require('path');

let fails = 0;
const ok = (n, c, e = '') => {
  console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : ''));
  if (!c) fails++;
};
const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');

// Several assertions below are about what the CODE does. Matching the raw
// file makes them trip over the comments that explain the very bug being
// asserted away — a comment saying "no longer uses credentials.get({password:
// true})" would fail a test looking for that string. Strip comments first.
const codeOnly = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

// ─────────────────────────────────────────────────────────────────────────
// 1. Totals
// ─────────────────────────────────────────────────────────────────────────
const customersPage = read('portal/app/admin/customers/page.tsx');

ok(
  'the customer total no longer filters the whole figure down to paid-only',
  /const totalInvoiced = custInvoices\s*\n?\s*\.reduce/.test(customersPage),
  'totalInvoiced must reduce over every invoice'
);

ok(
  'paid is still tracked separately, so the gap can be shown',
  /const totalPaid = custInvoices[\s\S]{0,120}status === 'paid'[\s\S]{0,80}reduce/.test(customersPage)
);

ok(
  'what is owed is derived, never negative',
  /totalOutstanding: Math\.max\(0, totalInvoiced - totalPaid\)/.test(customersPage)
);

// Reproduce the actual arithmetic the page does, on the shape that broke it:
// one customer, one unpaid invoice for a real bike.
{
  const invoices = [{ customer_id: 'c1', total_amount: '2113.94', status: 'pending' }];
  const mine = invoices.filter((i) => i.customer_id === 'c1');
  const totalInvoiced = mine.reduce((s, i) => s + Number(i.total_amount || 0), 0);
  const totalPaid = mine
    .filter((i) => i.status === 'paid')
    .reduce((s, i) => s + Number(i.total_amount || 0), 0);

  ok('a customer with one unpaid invoice does not read $0.00', totalInvoiced === 2113.94, String(totalInvoiced));
  ok('...and their paid total is honestly zero', totalPaid === 0, String(totalPaid));
  ok('...and the gap is the whole amount', Math.max(0, totalInvoiced - totalPaid) === 2113.94);
}

const directory = read('portal/app/admin/customers/customer-directory.tsx');
ok(
  'the column is labelled for what it now counts',
  /Total Invoiced/.test(directory),
  'calling billed money "spent" is the same lie in the other direction'
);
ok(
  'the unpaid remainder is shown rather than hidden',
  /not marked paid/.test(directory)
);

// ─────────────────────────────────────────────────────────────────────────
// 2. Invoice → customer profile
// ─────────────────────────────────────────────────────────────────────────
const invoicesPage = read('portal/app/admin/invoices/page.tsx');

ok(
  'the invoices query asks for the customer id it needs to link with',
  /select\('[^']*\bcustomer_id\b/.test(invoicesPage),
  'without it every name would fall back to plain text'
);

ok(
  'the customer name links to that customer profile',
  /href=\{`\/admin\/customers\?customer=\$\{inv\.customer_id\}`\}/.test(invoicesPage)
);

ok(
  'an invoice with no customer still renders its name instead of a dead link',
  /inv\.customer_id \? \([\s\S]{0,600}\) : \(\s*customerName\(inv\)\s*\)/.test(invoicesPage)
);

ok(
  'the directory honours the customer named in the URL',
  /searchParams\.get\('customer'\)/.test(directory) || /get\('customer'\)/.test(directory)
);

ok(
  'arriving by link also updates the dock, so "Now viewing" matches the drawer',
  /fromUrl[\s\S]{0,400}ctc-select-customer/.test(directory)
);

ok(
  'the parameter is cleared once used, so closing the drawer sticks',
  /searchParams\.delete\('customer'\)/.test(directory)
);

// ─────────────────────────────────────────────────────────────────────────
// 3. Passkeys
// ─────────────────────────────────────────────────────────────────────────
const setup = read('portal/app/components/biometric-setup.tsx');
const authPage = read('portal/app/auth/page.tsx');
const regVerify = read('portal/app/api/webauthn/register/verify/route.ts');
const authVerify = read('portal/app/api/webauthn/authenticate/verify/route.ts');
const authOptions = read('portal/app/api/webauthn/authenticate/options/route.ts');
const helpers = read('portal/lib/webauthn.ts');

ok(
  'setting up a passkey now sends it to the server',
  /\/api\/webauthn\/register\/verify/.test(setup),
  'the old version called credentials.create() and discarded the result'
);

ok(
  'the card no longer reports success from a localStorage flag',
  !/localStorage\.setItem\('ctc_biometric_enabled'/.test(setup)
);

ok(
  'a dismissed prompt is reported as a dismissal, not as success',
  /NotAllowedError[\s\S]{0,200}nothing was saved/.test(setup)
);

ok(
  'sign-in asks the server for a challenge instead of reading a saved password',
  /\/api\/webauthn\/authenticate\/options/.test(authPage)
);

ok(
  'sign-in no longer depends on the Chromium-only password credential API',
  !/credentials\.get\(\{\s*\n?\s*password: true/.test(codeOnly(authPage)),
  'iPhones never implemented it, which is why this never worked on one'
);

ok(
  'the assertion is verified server-side before anything is issued',
  /verifyAuthenticationResponse\(/.test(authVerify)
);

ok(
  'user verification is required — a tap alone is not a fingerprint',
  /requireUserVerification: true/.test(authVerify) && /requireUserVerification: true/.test(regVerify)
);

ok(
  'a session is only minted after verification passes',
  codeOnly(authVerify).indexOf('verification.verified') <
    codeOnly(authVerify).indexOf('generateLink'),
  'order matters: verify, then issue'
);

ok(
  'the registration upsert is checked rather than assumed',
  /if \(error\) throw error/.test(regVerify)
);

ok(
  'the signature counter is stored and moved forward',
  /counter: newCounter/.test(authVerify)
);

ok(
  'a counter that fails to advance is refused',
  /previous > 0 && newCounter <= previous/.test(authVerify)
);

ok(
  'challenges live server-side and are deleted when redeemed',
  /from\('webauthn_challenges'\)\s*\n?\s*\.delete\(\)/.test(helpers),
  'a challenge the client could choose is not a challenge'
);

ok(
  'the cookie carries the challenge id, never the challenge itself',
  /Cookie holding the id of the pending challenge row/.test(helpers) &&
    !/set\(CHALLENGE_COOKIE, options\.challenge/.test(helpers)
);

ok(
  'the relying party is checked against an allowlist, not taken on trust',
  /function isAllowedHost/.test(helpers) && /Passkeys are not enabled for/.test(helpers)
);

ok(
  'sign-in options name no credentials, so they cannot enumerate accounts',
  !/allowCredentials/.test(codeOnly(authOptions))
);

ok(
  'the service-role key is never exposed to the browser',
  !/NEXT_PUBLIC_SUPABASE_SERVICE/.test(helpers) &&
    /process\.env\.SUPABASE_SERVICE_ROLE_KEY/.test(helpers)
);

// The audit rule stands: nothing on this path may email a customer.
ok(
  'signing in with a passkey emails nobody',
  /generateLink/.test(authVerify) && !/inviteUserByEmail|resend\(/.test(authVerify),
  'generateLink generates; it does not send'
);

const migration = read('portal/supabase/migrations/00007_webauthn_passkeys.sql');
ok(
  'riders can read and remove only their own passkeys',
  /for select[\s\S]{0,80}auth\.uid\(\) = user_id/.test(migration) &&
    /for delete[\s\S]{0,80}auth\.uid\(\) = user_id/.test(migration)
);
ok(
  'no client-side insert or update policy exists on the credentials table',
  !/for insert/.test(migration) && !/for update/.test(migration),
  'a self-asserted public key would be a sign-in bypass'
);
ok(
  'one authenticator cannot be claimed by two accounts',
  /credential_id text not null unique/.test(migration)
);
ok(
  'the challenge table is unreachable through PostgREST',
  /alter table public\.webauthn_challenges enable row level security/.test(migration) &&
    !/on public\.webauthn_challenges for/.test(migration)
);


// ─────────────────────────────────────────────────────────────────────────
// 4. Password sign-in, removed
// ─────────────────────────────────────────────────────────────────────────
// The Password tab could not work for a single one of the 60 accounts. 55 were
// created by scripts/import-invoices.ts, which sets a random password and
// throws it away ("they'll use magic link to sign in"); the other 5 were
// invited, and the callback sends them straight to /dashboard without ever
// asking for one. So every customer was shown a form guaranteed to fail — the
// same shape of bug as the biometrics card that reported success while storing
// nothing.
const authActions = read('portal/app/auth/actions.ts')

ok(
  'the sign-in page offers no password field',
  !/type="password"/.test(authPage),
  'nobody has a password to type into it'
)

ok(
  'the password mode is gone from the tab state',
  !/'magic' \| 'password' \| 'biometric'/.test(authPage) &&
    !/mode === 'password'/.test(authPage)
)

ok(
  'signInWithPassword is no longer called anywhere in the portal',
  !/signInWithPassword/.test(codeOnly(authPage)) &&
    !/signInWithPassword/.test(codeOnly(authActions)),
  'the only mention left is the comment telling the next person not to re-add it'
)

ok(
  'the dead signIn and signUp server actions were removed, not left orphaned',
  !/export async function signIn\b/.test(authActions) &&
    !/export async function signUp\b/.test(authActions)
)

ok(
  'the email link and sign-out actions still exist',
  /export async function sendMagicLink\b/.test(authActions) &&
    /export async function signOut\b/.test(authActions)
)

ok(
  'why it was removed is written down where someone would re-add it',
  /Password sign-in was removed/.test(authActions) &&
    /import-invoices\.ts/.test(authActions),
  'otherwise the next person rebuilds the same dead end'
)

// A passkey belongs to one device. Opening every visitor on the Biometrics tab
// when none of them has registered one is the same trap the password tab was.
ok(
  'the page opens on the email link tab by default',
  /useState<'magic' \| 'biometric'>\('magic'\)/.test(authPage)
)

ok(
  '...and only opens on Biometrics where a passkey was actually set up',
  /localStorage\.getItem\('ctc_has_passkey'\) === '1'/.test(authPage) &&
    /setMode\('biometric'\)/.test(authPage)
)

ok(
  'registering a passkey records it for this device',
  /localStorage\.setItem\('ctc_has_passkey', '1'\)/.test(setup)
)

ok(
  'removing the last passkey clears that flag',
  /left\.length === 0[\s\S]{0,120}removeItem\('ctc_has_passkey'\)/.test(setup),
  'otherwise sign-in keeps opening on a tab that no longer works here'
)

console.log(fails ? `\n${fails} failing` : '\nall passing');
process.exit(fails ? 1 : 0);
