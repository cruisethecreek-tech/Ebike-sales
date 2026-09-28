// supabase.auth.admin.listUsers() returns 50 users by default. The shop has 61.
//
// So the eleven oldest customers — the list comes back newest first — were
// invisible to every caller that used it unpaginated. Saving one of their
// invoices found no account for a customer who plainly exists, went on to
// create one, and Supabase answered "A user with this email address has
// already been registered". The route threw, the browser showed HTTP 500, and
// an invoice that had in fact saved looked like a failure.
//
// Don Eagle is rank 52 of 61. Every invoice from CTR-018 upward worked and
// every older one did not, which is exactly that boundary.
//
// The nastiest part is that it was correct at 50 customers and broke at 51,
// and the boundary moves with every new account.
const fs = require('fs');
const path = require('path');

let fails = 0;
const ok = (n, c, e = '') => {
  console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : ''));
  if (!c) fails++;
};
const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');

// Load the real implementation out of the TypeScript source.
const { findAuthUserByEmail, isAlreadyRegistered } = (() => {
  const src = read('portal/lib/find-auth-user.ts')
    .replace(/import type[^\n]*\n/g, '')
    .replace(/export /g, '')
    .replace(/: SupabaseClient/g, '')
    .replace(/: Promise<\{ id: string; email\?: string \} \| null>/g, '')
    .replace(/: string(?=[,)])/g, '')
    .replace(/: boolean/g, '')
    .replace(/: any/g, '')
    .replace(/ as \{ id: string; email\?: string \}/g, '');
  const ex = {};
  new Function('exports', src + '\nexports.findAuthUserByEmail = findAuthUserByEmail; exports.isAlreadyRegistered = isAlreadyRegistered;')(ex);
  return ex;
})();

/** A Supabase whose listUsers honours page/perPage, like the real one. */
function fakeSupabase(totalUsers, { defaultPerPage = 50 } = {}) {
  // Newest first, which is the order the real API returns.
  const users = Array.from({ length: totalUsers }, (_, i) => ({
    id: `id-${i + 1}`,
    email: `user${String(i + 1).padStart(3, '0')}@example.com`,
  }));
  let calls = 0;
  return {
    calls: () => calls,
    users,
    auth: {
      admin: {
        listUsers: async (opts) => {
          calls++;
          const perPage = opts?.perPage ?? defaultPerPage;
          const page = opts?.page ?? 1;
          const start = (page - 1) * perPage;
          return { data: { users: users.slice(start, start + perPage) }, error: null };
        },
      },
    },
  };
}

// ── The exact failure ────────────────────────────────────────────────────
(async () => {
  {
    const sb = fakeSupabase(61);

    // Rank 52 newest-first — Don Eagle's position.
    const target = sb.users[51].email;
    const found = await findAuthUserByEmail(sb, target);
    ok('a customer past the first 50 is found', found && found.email === target,
       found ? found.email : 'not found');

    // What the old code did, for contrast.
    const firstPageOnly = (await sb.auth.admin.listUsers()).data.users;
    ok('...and the unpaginated call genuinely could not see them',
       !firstPageOnly.some((u) => u.email === target),
       'this is the bug, reproduced');
  }

  {
    const sb = fakeSupabase(61);
    ok('the very last account is reachable',
       (await findAuthUserByEmail(sb, sb.users[60].email)) !== null);
    ok('the very first is too',
       (await findAuthUserByEmail(sb, sb.users[0].email)) !== null);
  }

  // It must still say no when the answer really is no — otherwise a genuinely
  // new customer would never get an account.
  {
    const sb = fakeSupabase(61);
    ok('an address nobody has returns null',
       (await findAuthUserByEmail(sb, 'nobody@example.com')) === null);
    // A fresh instance: the lookup above already spent a call on this one.
    const fresh = fakeSupabase(61);
    ok('an empty address returns null without asking Supabase',
       (await findAuthUserByEmail(fresh, '')) === null && fresh.calls() === 0);
  }

  ok('matching ignores case',
     (await findAuthUserByEmail(fakeSupabase(61), 'USER052@EXAMPLE.COM')) !== null,
     'addresses are stored lower-cased but not always typed that way');

  // One page covers this shop; the loop is what stops it becoming a new limit.
  {
    const sb = fakeSupabase(61);
    await findAuthUserByEmail(sb, sb.users[60].email);
    ok('61 users take a single request at perPage 1000', sb.calls() === 1, `${sb.calls()} calls`);
  }
  {
    const sb = fakeSupabase(2500);
    ok('a list larger than one page is still searched to the end',
       (await findAuthUserByEmail(sb, sb.users[2499].email)) !== null);
    ok('...and that took more than one request', sb.calls() > 1, `${sb.calls()} calls`);
  }

  // ── The collision fallback ─────────────────────────────────────────────
  for (const msg of [
    'A user with this email address has already been registered',
    'User already exists',
    'a user with this email address has already registered',
  ]) {
    ok(`"${msg.slice(0, 40)}…" is recognised`, isAlreadyRegistered({ message: msg }));
  }
  ok('the email_exists code is recognised', isAlreadyRegistered({ code: 'email_exists' }));
  ok('an unrelated error is NOT swallowed',
     !isAlreadyRegistered({ message: 'permission denied for table users' }),
     'only the collision may be treated as success');

  // ── No unpaginated lookup left ─────────────────────────────────────────
  for (const f of ['portal/lib/sync-invoice.ts',
                   'portal/app/admin/customers/actions.ts',
                   'portal/app/api/customers/route.ts']) {
    ok(`${f.split('/').pop()} no longer calls listUsers() unpaginated`,
       !/admin\.listUsers\(\s*\)/.test(read(f)));
  }

  const sync = read('portal/lib/sync-invoice.ts');
  ok('a create that collides falls back to the existing account',
     /isAlreadyRegistered\(makeErr\)/.test(sync) && /isAlreadyRegistered\(createErr\)/.test(sync),
     'two saves of one new customer can race');

  console.log(fails ? `\n${fails} failing` : '\nall passing');
  process.exit(fails ? 1 : 0);
})();
