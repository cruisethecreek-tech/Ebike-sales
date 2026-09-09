-- ============================================================================
-- Cruise the Creek Adventures — Customer Portal
-- Migration 00002: leaderboard + community photos
--
-- New tables: ride_logs, community_photos
-- New view:   leaderboard
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- ride_logs — one entry per ride, customers track their mileage
-- ─────────────────────────────────────────────────────────────

create table public.ride_logs (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  miles       numeric(8,2) not null check (miles > 0),
  ride_date   date not null default current_date,
  notes       text,
  created_at  timestamptz not null default now()
);

create index ride_logs_customer_idx on public.ride_logs(customer_id);
create index ride_logs_date_idx on public.ride_logs(ride_date desc);

alter table public.ride_logs enable row level security;

create policy "ride_logs: read own"
  on public.ride_logs for select
  to authenticated
  using (auth.uid() = customer_id);

create policy "ride_logs: insert own"
  on public.ride_logs for insert
  to authenticated
  with check (auth.uid() = customer_id);

create policy "ride_logs: delete own"
  on public.ride_logs for delete
  to authenticated
  using (auth.uid() = customer_id);

-- ─────────────────────────────────────────────────────────────
-- leaderboard — aggregated view, readable by all authenticated
-- Shows first name + last name for community ranking
-- ─────────────────────────────────────────────────────────────

create or replace view public.leaderboard as
  select
    c.id as customer_id,
    c.first_name,
    c.last_name,
    coalesce(sum(r.miles), 0)::numeric(10,2) as total_miles,
    count(r.id)::int as total_rides,
    max(r.ride_date) as last_ride
  from public.customers c
  left join public.ride_logs r on r.customer_id = c.id
  group by c.id, c.first_name, c.last_name;

-- Grant read access to authenticated users for the leaderboard
grant select on public.leaderboard to authenticated;

-- ─────────────────────────────────────────────────────────────
-- community_photos — riders share trail photos
-- ─────────────────────────────────────────────────────────────

create table public.community_photos (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  image_url   text not null,
  caption     text,
  created_at  timestamptz not null default now()
);

create index community_photos_created_idx on public.community_photos(created_at desc);
create index community_photos_customer_idx on public.community_photos(customer_id);

alter table public.community_photos enable row level security;

-- Everyone signed in can view all photos (community gallery)
create policy "photos: read all"
  on public.community_photos for select
  to authenticated
  using (true);

create policy "photos: upload own"
  on public.community_photos for insert
  to authenticated
  with check (auth.uid() = customer_id);

create policy "photos: delete own"
  on public.community_photos for delete
  to authenticated
  using (auth.uid() = customer_id);

-- ─────────────────────────────────────────────────────────────
-- Storage bucket for photo uploads
-- Run this in the Supabase SQL editor after the migration:
--
--   insert into storage.buckets (id, name, public)
--   values ('photos', 'photos', true);
--
--   create policy "Anyone can read photos"
--     on storage.objects for select
--     using (bucket_id = 'photos');
--
--   create policy "Authenticated users can upload photos"
--     on storage.objects for insert
--     to authenticated
--     with check (bucket_id = 'photos');
--
--   create policy "Users can delete own photos"
--     on storage.objects for delete
--     to authenticated
--     using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
-- ─────────────────────────────────────────────────────────────
