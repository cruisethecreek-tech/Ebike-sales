-- ─────────────────────────────────────────────────────────────
-- Migration 00006: close the leaderboard's anonymous read, and
--                  pin search_path on the two SECURITY DEFINER-ish
--                  functions.
--
-- Scope note: this migration touches ONLY the portal's own objects.
-- The 38 unrelated tables in `public` that the linter also flags
-- (clients, matchmakers, role_assignments, member_login_tokens, …)
-- belong to a different application that shares this database. They
-- are deliberately left alone here: enabling RLS on them with no
-- policies would take that application offline. They need their own
-- owner's decision.
-- ─────────────────────────────────────────────────────────────

-- ── 1. public.leaderboard ────────────────────────────────────
--
-- 00002 created this view and granted SELECT to `authenticated`,
-- with the comment "readable by all authenticated". Supabase's
-- default privileges on the `public` schema then ALSO granted the
-- full set to `anon` and `authenticated` behind the migration's
-- back, which is not what it asked for.
--
-- That matters more than a stray grant normally would. A view is
-- SECURITY DEFINER by default (security_invoker = false), so it runs
-- as its owner and bypasses RLS on customers and ride_logs. With
-- SELECT granted to `anon`, every customer's first name, last name,
-- mileage, ride count and last ride date was readable by anyone
-- holding the publishable anon key — which is embedded in the
-- portal's own client bundle, so: anyone.
--
-- The fix is the grant, not the view. Leaving it SECURITY DEFINER is
-- deliberate and correct: `customers` restricts SELECT to
-- `auth.uid() = id OR is_admin()`, so flipping this to
-- security_invoker = true would collapse the leaderboard to a single
-- row — the viewer's own — for every non-admin. Bypassing RLS is
-- exactly the mechanism that lets a community ranking aggregate over
-- everyone while exposing only a name and a mileage total.
revoke all on public.leaderboard from anon;
revoke all on public.leaderboard from authenticated;
grant select on public.leaderboard to authenticated;

comment on view public.leaderboard is
  'Community ranking. SECURITY DEFINER by design so it can aggregate '
  'across all customers; therefore readable by `authenticated` only — '
  'never grant to `anon`.';

-- ── 2. search_path on the helper functions ───────────────────
--
-- A SECURITY DEFINER function with a mutable search_path can be
-- steered to a different `customers` table by anyone able to create
-- objects in a schema that resolves earlier. On Supabase `anon` and
-- `authenticated` cannot create schemas, so this is hardening rather
-- than an open door — but it is one line, and is_admin() is the
-- gate every admin RLS policy leans on.
--
-- Both bodies already schema-qualify everything they touch
-- (public.customers, auth.uid(), pg_catalog.now()), so an empty
-- search_path changes no behaviour.
create or replace function public.is_admin()
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.customers
    where id = auth.uid() and is_admin = true
  );
$$;

create or replace function public.set_updated_at()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
