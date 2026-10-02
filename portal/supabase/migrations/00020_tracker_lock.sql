-- Lock a tracked bike so that moving it raises a theft alert.
--
-- An admin taps Lock on Admin > Fleet GPS. The bike's last known position
-- becomes the lock point. While locked_at is set, traccar-ingest raises a
-- 'movedWhileLocked' alert (and a phone push) when a good fix puts the bike
-- more than 150 m from that point, or reports it riding faster than 10 km/h.
-- The existing admin-only update policy on trackers covers these columns.

alter table public.trackers
  add column if not exists locked_at      timestamptz,
  add column if not exists lock_latitude  double precision,
  add column if not exists lock_longitude double precision;

comment on column public.trackers.locked_at is
  'When an admin locked the bike. Null = unlocked. Movement after this raises movedWhileLocked.';
