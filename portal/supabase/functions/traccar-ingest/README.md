# traccar-ingest

Receives positions and events forwarded by the Traccar server and writes them to
`positions` and `tracker_alerts` (migration `00012_gps_tracking.sql`).

## Deploy

```sh
cd portal
supabase secrets set TRACCAR_SECRET=<long random string>
supabase functions deploy traccar-ingest --no-verify-jwt
```

Phone alerts (optional): pick a long, hard-to-guess ntfy topic name, subscribe
to it in the ntfy app (iOS/Android) on each staff phone, then

```sh
supabase secrets set NTFY_TOPIC=<topic name>
```

Every new alert (a theft-lock trip, a Traccar alarm or geofence event) is then
pushed to those phones. Anyone who knows the topic name can read the pushes,
so treat it like a password.

`--no-verify-jwt` is needed because Traccar sends a fixed shared-secret header,
not a Supabase JWT. The function rejects any request without the secret.

## Traccar config (`traccar.xml`, then restart Traccar)

```xml
<entry key='forward.type'>json</entry>
<entry key='forward.url'>https://PROJECT_REF.supabase.co/functions/v1/traccar-ingest</entry>
<entry key='forward.header'>x-traccar-secret: SAME_SECRET</entry>
<entry key='forward.retry.enable'>true</entry>

<entry key='event.forward.url'>https://PROJECT_REF.supabase.co/functions/v1/traccar-ingest</entry>
<entry key='event.forward.header'>x-traccar-secret: SAME_SECRET</entry>
```

Optional, and it keeps Traccar's own web UI from flapping a parked bike
between online and offline after each upload:

```xml
<entry key='status.ignoreOffline'>teltonika</entry>
```

## Registering a tracker

Positions from an IMEI that has no active row in `trackers` are dropped (202),
so add the tracker before powering it on:

```sql
insert into public.trackers (imei, bike_id, label)
values ('350000000000001', '<bike uuid>', 'Rental Ranger S #1');
```

Rental fleet bikes are bikes owned by the shop's admin account.
