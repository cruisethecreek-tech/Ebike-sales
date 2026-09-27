-- ============================================================================
-- Migration 00011: GPS tracking
--
-- Tables: trackers, positions, tracker_alerts
--
-- Teltonika trackers report to a self-hosted Traccar server, which forwards
-- every position and event to the traccar-ingest Edge Function
-- (supabase/functions/traccar-ingest). That function writes here with the
-- service-role key; nothing in this migration lets a signed-in user insert.
--
-- Access model
--   A tracker belongs to a bike, and the bike belongs to a customer. A
--   customer sees the tracker, positions and alerts of their own bikes; an
--   admin (public.is_admin(), migration 00003) sees everything. The rental
--   fleet is simply bikes owned by the shop's own admin account.
--
--   Only admins attach a tracker to a bike. If customers could write
--   trackers.bike_id, anyone could claim a stranger's IMEI and watch that
--   bike move.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- trackers
--
-- One row per physical tracker, keyed by IMEI, which is what Traccar sends
-- as device.uniqueId. bike_id is unique: one tracker per bike.
--
-- assigned_at moves whenever the tracker changes bikes, and customers only
-- see positions recorded after it. A tracker that spent a season on a rental
-- bike and then went onto a customer's bike must not hand that customer the
-- rental history.
-- ─────────────────────────────────────────────────────────────

create table public.trackers (
  id           uuid primary key default gen_random_uuid(),
  imei         text not null unique check (imei ~ '^[0-9]{15}$'),
  bike_id      uuid unique references public.bikes (id) on delete set null,
  label        text,
  sim_iccid    text,
  active       boolean not null default true,
  assigned_at  timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.trackers is
  'GPS tracker (Teltonika) fitted to a bike. imei = Traccar device.uniqueId.';
comment on column public.trackers.assigned_at is
  'When the tracker went onto its current bike. Customers only see positions and alerts after this.';

create trigger trackers_set_updated_at
  before update on public.trackers
  for each row execute function public.set_updated_at();

create or replace function public.trackers_touch_assigned_at()
returns trigger
language plpgsql
as $$
begin
  if new.bike_id is distinct from old.bike_id then
    new.assigned_at = now();
  end if;
  return new;
end;
$$;

create trigger trackers_touch_assigned_at
  before update on public.trackers
  for each row execute function public.trackers_touch_assigned_at();

-- ─────────────────────────────────────────────────────────────
-- positions
--
-- traccar_position_id is unique so a retried forward from Traccar lands once.
-- Traccar reports speed in knots; the ingest function converts to km/h.
-- ─────────────────────────────────────────────────────────────

create table public.positions (
  id                   bigint generated always as identity primary key,
  tracker_id           uuid not null references public.trackers (id) on delete cascade,
  traccar_position_id  bigint unique,
  fix_time             timestamptz not null,
  latitude             double precision not null check (latitude between -90 and 90),
  longitude            double precision not null check (longitude between -180 and 180),
  speed_kmh            real,
  course               real,
  valid                boolean,
  attributes           jsonb not null default '{}'::jsonb,
  received_at          timestamptz not null default now()
);

comment on column public.positions.attributes is
  'Raw Traccar position attributes: battery, power, ignition, motion, io values.';

create index positions_tracker_time_idx on public.positions (tracker_id, fix_time desc);

-- ─────────────────────────────────────────────────────────────
-- tracker_alerts
--
-- The Traccar events worth a person's attention: alarms (kind is the alarm
-- name, e.g. 'powerCut' when the bike battery is pulled), geofence enter and
-- exit. The ingest function drops the rest, including Traccar's deviceOffline,
-- which fires every time a Teltonika closes its connection between uploads.
-- ─────────────────────────────────────────────────────────────

create table public.tracker_alerts (
  id                bigint generated always as identity primary key,
  tracker_id        uuid not null references public.trackers (id) on delete cascade,
  traccar_event_id  bigint unique,
  kind              text not null,
  occurred_at       timestamptz not null,
  latitude          double precision,
  longitude         double precision,
  geofence_name     text,
  attributes        jsonb not null default '{}'::jsonb,
  acknowledged_at   timestamptz,
  created_at        timestamptz not null default now()
);

create index tracker_alerts_tracker_time_idx on public.tracker_alerts (tracker_id, occurred_at desc);
create index tracker_alerts_unacknowledged_idx on public.tracker_alerts (occurred_at desc)
  where acknowledged_at is null;

-- ─────────────────────────────────────────────────────────────
-- Ownership helper
--
-- Returns the time from which the signed-in customer may see a tracker's
-- data, or null when the tracker is not on one of their bikes. security
-- definer so the lookup is not itself filtered by the caller's RLS.
-- ─────────────────────────────────────────────────────────────

create or replace function public.tracker_visible_since(p_tracker_id uuid)
returns timestamptz
language sql
security definer
stable
set search_path = public
as $$
  select t.assigned_at
  from public.trackers t
  join public.bikes b on b.id = t.bike_id
  where t.id = p_tracker_id
    and b.customer_id = auth.uid();
$$;

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.trackers       enable row level security;
alter table public.positions      enable row level security;
alter table public.tracker_alerts enable row level security;

-- ── trackers ────────────────────────────────────────────────

create policy "trackers: read own or admin"
  on public.trackers for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.bikes b
      where b.id = trackers.bike_id and b.customer_id = auth.uid()
    )
  );

create policy "trackers: admin insert"
  on public.trackers for insert
  to authenticated
  with check (public.is_admin());

create policy "trackers: admin update"
  on public.trackers for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "trackers: admin delete"
  on public.trackers for delete
  to authenticated
  using (public.is_admin());

-- ── positions ───────────────────────────────────────────────
-- Read-only for everyone signed in; written by the ingest function only.

create policy "positions: read own since assignment or admin"
  on public.positions for select
  to authenticated
  using (
    public.is_admin()
    or fix_time >= public.tracker_visible_since(tracker_id)
  );

-- ── tracker_alerts ──────────────────────────────────────────
-- Customers read their own; only admins acknowledge, so a renter cannot
-- clear a power-cut alert on a bike they are riding.

create policy "tracker_alerts: read own since assignment or admin"
  on public.tracker_alerts for select
  to authenticated
  using (
    public.is_admin()
    or occurred_at >= public.tracker_visible_since(tracker_id)
  );

create policy "tracker_alerts: admin acknowledge"
  on public.tracker_alerts for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================================
-- Realtime
--
-- Live map and alert badges subscribe to inserts. Realtime applies the
-- select policies above, so a customer only receives their own bikes' rows.
-- ============================================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.positions, public.tracker_alerts;
  end if;
end;
$$;
