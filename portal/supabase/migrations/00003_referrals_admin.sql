-- ============================================================================
-- Cruise the Creek Adventures — Customer Portal
-- Migration 00003: referral program + admin role
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- Admin flag on customers
-- ─────────────────────────────────────────────────────────────

alter table public.customers add column if not exists is_admin boolean not null default false;

-- ─────────────────────────────────────────────────────────────
-- Referral columns on customers
-- ─────────────────────────────────────────────────────────────

alter table public.customers add column if not exists referral_code text unique;
alter table public.customers add column if not exists referred_by uuid references public.customers(id);

-- Generate referral codes for existing customers who don't have one
-- Format: FIRSTNAME-XXX (3 random alphanumeric chars)
do $$
declare
  r record;
  code text;
  attempts int;
begin
  for r in select id, first_name from public.customers where referral_code is null
  loop
    attempts := 0;
    loop
      code := upper(regexp_replace(r.first_name, '[^a-zA-Z]', '', 'g'))
              || '-'
              || upper(substr(md5(random()::text), 1, 3));
      begin
        update public.customers set referral_code = code where id = r.id;
        exit; -- success
      exception when unique_violation then
        attempts := attempts + 1;
        if attempts > 10 then
          code := upper(substr(md5(random()::text), 1, 8));
          update public.customers set referral_code = code where id = r.id;
          exit;
        end if;
      end;
    end loop;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Referral credits ledger
-- ─────────────────────────────────────────────────────────────

create table if not exists public.referral_credits (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references public.customers(id) on delete cascade,
  amount        numeric(10,2) not null default 100.00,
  reason        text not null default '2 referrals milestone',
  redeemed      boolean not null default false,
  redeemed_at   timestamptz,
  redeemed_note text,
  created_at    timestamptz not null default now()
);

create index if not exists referral_credits_customer_idx
  on public.referral_credits(customer_id);

alter table public.referral_credits enable row level security;

-- Customers can see their own credits
create policy "credits: read own"
  on public.referral_credits for select
  to authenticated
  using (auth.uid() = customer_id);

-- ─────────────────────────────────────────────────────────────
-- Admin RLS policies — admins can read all rows
-- ─────────────────────────────────────────────────────────────

-- Helper function to check if current user is admin
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.customers
    where id = auth.uid() and is_admin = true
  );
$$;

-- Admin can read ALL customers
create policy "admin: read all customers"
  on public.customers for select
  to authenticated
  using (auth.uid() = id or public.is_admin());

-- Admin can read ALL invoices
create policy "admin: read all invoices"
  on public.invoices for select
  to authenticated
  using (auth.uid() = customer_id or public.is_admin());

-- Admin can UPDATE invoices (mark as paid, etc.)
create policy "admin: update all invoices"
  on public.invoices for update
  to authenticated
  using (public.is_admin());

-- Admin can INSERT invoices
create policy "admin: insert invoices"
  on public.invoices for insert
  to authenticated
  with check (public.is_admin());

-- Admin can read ALL referral credits
create policy "admin: read all credits"
  on public.referral_credits for select
  to authenticated
  using (public.is_admin());

-- Admin can INSERT credits (award)
create policy "admin: insert credits"
  on public.referral_credits for insert
  to authenticated
  with check (public.is_admin());

-- Admin can UPDATE credits (redeem)
create policy "admin: update credits"
  on public.referral_credits for update
  to authenticated
  using (public.is_admin());

-- Admin can read ALL ride logs
create policy "admin: read all rides"
  on public.ride_logs for select
  to authenticated
  using (public.is_admin());

-- Admin can read ALL photos
create policy "admin: read all photos"
  on public.community_photos for select
  to authenticated
  using (public.is_admin());

-- Admin can DELETE any photo (moderation)
create policy "admin: delete any photo"
  on public.community_photos for delete
  to authenticated
  using (public.is_admin());

-- Admin can read ALL bikes
create policy "admin: read all bikes"
  on public.bikes for select
  to authenticated
  using (public.is_admin());

-- Admin can read ALL service tickets
create policy "admin: read all tickets"
  on public.service_tickets for select
  to authenticated
  using (public.is_admin());

-- ─────────────────────────────────────────────────────────────
-- Flag test@test.com as admin
-- ─────────────────────────────────────────────────────────────

update public.customers
set is_admin = true
where id = (
  select id from auth.users where email = 'test@test.com' limit 1
);
