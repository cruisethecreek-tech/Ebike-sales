-- GPS mileage per bike, for service reminders by miles ridden.
--
-- Every new position adds the distance from the tracker's previous position
-- to its bike's running total, but only when the step is real riding:
--   * both fixes are good (5+ satellites, HDOP <= 5; a weak fix is skipped
--     and the next good one measures from the last good one), so GPS drift
--     does not count as miles;
--   * the bike is moving (motion flag, or speed over 3 km/h);
--   * the implied speed is under 60 km/h, so a bad jump is not counted;
--   * the new position is the tracker's latest (late, buffered records are
--     skipped rather than double-counted);
--   * both positions are from after the tracker went onto this bike.
--
-- Mileage lives in its own table rather than on bikes, because customers
-- may update their own bikes rows and must not be able to edit it. Staff
-- record a completed service, which moves service_distance_m up to the
-- current total so the next reminder counts from there.

create table public.bike_mileage (
  bike_id             uuid primary key references public.bikes (id) on delete cascade,
  distance_m          double precision not null default 0,
  service_distance_m  double precision not null default 0,
  last_serviced_on    date,
  updated_at          timestamptz not null default now()
);

comment on table public.bike_mileage is
  'GPS distance ridden per bike (metres), and the total at the last recorded service.';

alter table public.bike_mileage enable row level security;

create policy "bike_mileage: read own or admin"
  on public.bike_mileage for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.bikes b
      where b.id = bike_mileage.bike_id and b.customer_id = auth.uid()
    )
  );

create policy "bike_mileage: admin insert"
  on public.bike_mileage for insert
  to authenticated
  with check (public.is_admin());

create policy "bike_mileage: admin update"
  on public.bike_mileage for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- True when a position is good enough to measure distance with.
create or replace function public.position_is_good_fix(p public.positions)
returns boolean
language sql
immutable
as $$
  select coalesce(p.valid, true)
    and coalesce((p.attributes->>'sat')::numeric, 99) >= 5
    and coalesce((p.attributes->>'hdop')::numeric, 0) <= 5;
$$;

create or replace function public.positions_add_mileage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t      public.trackers;
  prev   public.positions;
  meters double precision;
  hours  double precision;
begin
  select * into t from public.trackers where id = new.tracker_id;
  if t.bike_id is null or new.fix_time < t.assigned_at then
    return new;
  end if;

  -- Skip late records: only the newest position extends the trip.
  if exists (
    select 1 from public.positions
    where tracker_id = new.tracker_id and fix_time > new.fix_time
  ) then
    return new;
  end if;

  select * into prev
  from public.positions
  where tracker_id = new.tracker_id
    and fix_time < new.fix_time
    and fix_time >= t.assigned_at
    and public.position_is_good_fix(positions)
  order by fix_time desc
  limit 1;

  if prev.id is null
     or not public.position_is_good_fix(new)
     or not (coalesce((new.attributes->>'motion')::boolean, false) or coalesce(new.speed_kmh, 0) > 3)
  then
    return new;
  end if;

  meters := 2 * 6371000 * asin(sqrt(
    power(sin(radians(new.latitude - prev.latitude) / 2), 2)
    + cos(radians(prev.latitude)) * cos(radians(new.latitude))
      * power(sin(radians(new.longitude - prev.longitude) / 2), 2)
  ));
  hours := extract(epoch from (new.fix_time - prev.fix_time)) / 3600.0;
  if meters <= 0 or hours <= 0 or meters / 1000.0 / hours > 60 then
    return new;
  end if;

  insert into public.bike_mileage (bike_id, distance_m)
  values (t.bike_id, meters)
  on conflict (bike_id) do update
    set distance_m = public.bike_mileage.distance_m + excluded.distance_m,
        updated_at = now();

  return new;
end;
$$;

revoke execute on function public.positions_add_mileage() from public, anon, authenticated;

create trigger positions_add_mileage
  after insert on public.positions
  for each row execute function public.positions_add_mileage();
