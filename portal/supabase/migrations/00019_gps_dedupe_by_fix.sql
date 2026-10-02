-- Dedupe GPS check-ins by tracker and fix time, not by Traccar's id.
--
-- Traccar's json forwarder sends each position before saving it, so
-- position.id arrives as 0 (events the same). The ingest function upserted
-- on traccar_position_id with ignoreDuplicates, so after the first 0 every
-- later check-in from every tracker was silently dropped while Traccar got
-- a 200. The function now stores 0 as null and dedupes on these keys
-- instead, which still makes a retried forward land once.

update public.positions set traccar_position_id = null where traccar_position_id = 0;
update public.tracker_alerts set traccar_event_id = null where traccar_event_id = 0;

create unique index if not exists positions_tracker_fix_key
  on public.positions (tracker_id, fix_time);

create unique index if not exists tracker_alerts_tracker_kind_time_key
  on public.tracker_alerts (tracker_id, kind, occurred_at);
