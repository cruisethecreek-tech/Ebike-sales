// Traccar → Supabase ingest (Supabase Edge Function, Deno).
//
// Traccar POSTs here from two forwarders configured in traccar.xml:
//   forward.type=json        → { position, device }          → public.positions
//   event.forward.url        → { event, position, device, geofence? }
//                                                             → public.tracker_alerts
// Both point at this one URL; the presence of `event` tells them apart.
//
// Auth is a shared secret header rather than a Supabase JWT, because Traccar
// sends a fixed header. Deploy with --no-verify-jwt and set TRACCAR_SECRET.
//
// Status codes matter: Traccar retries non-2xx position forwards (when
// forward.retry.enable is on). A tracker we have not registered, or an event
// we do not keep, is answered 2xx so it is dropped instead of retried forever.
//
// Traccar forwards a position before saving it, so position.id and event.id
// usually arrive as 0. They are stored as null in that case, and duplicates
// are caught on (tracker_id, fix_time) for positions and (tracker_id, kind,
// occurred_at) for alerts (migration 00019).
//
// Theft alerts: when an admin has locked a bike (trackers.locked_at,
// migration 00020), a good fix more than LOCK_RADIUS_M from the lock point,
// or riding faster than LOCK_SPEED_KMH, raises a movedWhileLocked alert.
// Every newly saved alert is pushed to staff phones through ntfy
// (https://ntfy.sh) when the NTFY_TOPIC secret is set; a failed push never
// fails the ingest.

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const KNOTS_TO_KMH = 1.852;

const LOCK_RADIUS_M = 150;
const LOCK_SPEED_KMH = 10;
// One movedWhileLocked alert per bike per this window, so a ride away from
// the lock point is one push, not one per check-in.
const LOCK_ALERT_REPEAT_MS = 15 * 60_000;

// Alerts worth waking someone up for; the rest push at normal priority.
const URGENT_KINDS = new Set(["movedWhileLocked", "powerCut", "sos", "tampering"]);

const ALERT_TEXT: Record<string, string> = {
  movedWhileLocked: "Moved while locked",
  powerCut: "Bike battery disconnected",
  geofenceExit: "Left area",
  geofenceEnter: "Entered area",
  sos: "SOS",
  tampering: "Tampering",
};

// Everything else Traccar emits (moving/stopped, ignition, online, …) is
// either derivable from positions or noise for a person watching alerts.
//
// deviceOffline is deliberately not kept. Traccar raises it whenever the
// tracker's TCP session closes, and Teltonika closes the link after every
// upload once the open-link timeout passes, so a parked bike would raise one
// on every heartbeat. A tracker that has really gone quiet shows up as a
// stale last check-in in the portal instead (isStale in lib/gps.ts).
const KEPT_EVENT_TYPES = new Set([
  "alarm",
  "geofenceEnter",
  "geofenceExit",
]);

type TraccarPosition = {
  id: number;
  fixTime: string;
  latitude: number;
  longitude: number;
  speed?: number;
  course?: number;
  valid?: boolean;
  attributes?: Record<string, unknown>;
};

type TraccarEvent = {
  id: number;
  type: string;
  eventTime: string;
  attributes?: Record<string, unknown>;
};

type Tracker = {
  id: string;
  active: boolean;
  label: string | null;
  locked_at: string | null;
  lock_latitude: number | null;
  lock_longitude: number | null;
  bikes: { brand: string; model: string } | null;
};

type NewAlert = {
  kind: string;
  occurredAt: string;
  latitude: number | null;
  longitude: number | null;
  traccarEventId?: number | null;
  geofenceName?: string | null;
  attributes?: Record<string, unknown>;
};

function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
}

// A weak fix can land a parked bike a block away (4 satellites, HDOP 19.6
// did exactly that on the first test), so only trust good fixes for theft.
function goodFix(p: TraccarPosition): boolean {
  if (p.valid === false) return false;
  const sat = Number(p.attributes?.sat);
  const hdop = Number(p.attributes?.hdop);
  if (Number.isFinite(sat) && sat < 5) return false;
  if (Number.isFinite(hdop) && hdop > 5) return false;
  return true;
}

async function pushToPhones(tracker: Tracker, alert: NewAlert): Promise<void> {
  const topic = Deno.env.get("NTFY_TOPIC");
  if (!topic) return;
  const bike = tracker.label ||
    (tracker.bikes ? `${tracker.bikes.brand} ${tracker.bikes.model}` : "Tracked bike");
  const what = ALERT_TEXT[alert.kind] ?? alert.kind;
  const map = alert.latitude != null && alert.longitude != null
    ? `https://www.google.com/maps?q=${alert.latitude},${alert.longitude}`
    : undefined;
  const urgent = URGENT_KINDS.has(alert.kind);
  try {
    await fetch(Deno.env.get("NTFY_SERVER") ?? "https://ntfy.sh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic,
        title: `${bike}: ${what}${alert.geofenceName ? ` (${alert.geofenceName})` : ""}`,
        message: map ? "Tap to open the map." : "No location with this alert.",
        priority: urgent ? 5 : 3,
        tags: [urgent ? "rotating_light" : "bike"],
        click: map,
      }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err) {
    console.error(`push failed for ${alert.kind}: ${err}`);
  }
}

// Saves the alert and pushes it, unless it was already saved (a retried
// forward), so a phone never gets the same alert twice.
async function raiseAlert(tracker: Tracker, alert: NewAlert): Promise<string | null> {
  const { data, error } = await supabase.from("tracker_alerts").upsert({
    tracker_id: tracker.id,
    traccar_event_id: alert.traccarEventId || null,
    kind: alert.kind,
    occurred_at: alert.occurredAt,
    latitude: alert.latitude,
    longitude: alert.longitude,
    geofence_name: alert.geofenceName ?? null,
    attributes: alert.attributes ?? {},
  }, { onConflict: "tracker_id,kind,occurred_at", ignoreDuplicates: true })
    .select("id");
  if (error) return error.message;
  if (data && data.length > 0) await pushToPhones(tracker, alert);
  return null;
}

async function checkLock(tracker: Tracker, p: TraccarPosition): Promise<string | null> {
  if (!tracker.locked_at) return null;
  if (new Date(p.fixTime) <= new Date(tracker.locked_at)) return null;
  if (!goodFix(p)) return null;

  const speedKmh = p.speed == null ? 0 : p.speed * KNOTS_TO_KMH;
  const movedM = tracker.lock_latitude != null && tracker.lock_longitude != null
    ? distanceM(tracker.lock_latitude, tracker.lock_longitude, p.latitude, p.longitude)
    : 0;
  if (movedM <= LOCK_RADIUS_M && speedKmh <= LOCK_SPEED_KMH) return null;

  const since = new Date(new Date(p.fixTime).getTime() - LOCK_ALERT_REPEAT_MS).toISOString();
  const { data: recent, error } = await supabase
    .from("tracker_alerts")
    .select("id")
    .eq("tracker_id", tracker.id)
    .eq("kind", "movedWhileLocked")
    .gte("occurred_at", since)
    .limit(1);
  if (error) return error.message;
  if (recent && recent.length > 0) return null;

  return await raiseAlert(tracker, {
    kind: "movedWhileLocked",
    occurredAt: p.fixTime,
    latitude: p.latitude,
    longitude: p.longitude,
    attributes: { moved_m: Math.round(movedM), speed_kmh: Math.round(speedKmh) },
  });
}

type Payload = {
  device?: { uniqueId?: string };
  position?: TraccarPosition | null;
  event?: TraccarEvent;
  geofence?: { name?: string } | null;
};

Deno.serve(async (req) => {
  const secret = Deno.env.get("TRACCAR_SECRET");
  if (!secret || req.headers.get("x-traccar-secret") !== secret) {
    return new Response("unauthorized", { status: 401 });
  }
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const imei = body.device?.uniqueId;
  if (!imei) return new Response("missing device.uniqueId", { status: 400 });

  const { data, error: lookupError } = await supabase
    .from("trackers")
    .select("id, active, label, locked_at, lock_latitude, lock_longitude, bikes(brand, model)")
    .eq("imei", imei)
    .maybeSingle();
  const tracker = data as Tracker | null;
  if (lookupError) return new Response(lookupError.message, { status: 500 });
  if (!tracker || !tracker.active) {
    console.warn(`ignoring unregistered or inactive tracker ${imei}`);
    return new Response("ignored", { status: 202 });
  }

  if (body.event) {
    const event = body.event;
    if (!KEPT_EVENT_TYPES.has(event.type)) {
      return new Response("ignored", { status: 202 });
    }
    // For alarms the useful name is the alarm itself (powerCut, sos, …).
    const kind = event.type === "alarm"
      ? String(event.attributes?.alarm ?? "alarm")
      : event.type;

    const error = await raiseAlert(tracker, {
      kind,
      occurredAt: event.eventTime,
      latitude: body.position?.latitude ?? null,
      longitude: body.position?.longitude ?? null,
      traccarEventId: event.id,
      geofenceName: body.geofence?.name ?? null,
      attributes: event.attributes ?? {},
    });
    if (error) return new Response(error, { status: 500 });
    return new Response("ok");
  }

  const p = body.position;
  if (!p) return new Response("missing position", { status: 400 });

  const { data: inserted, error } = await supabase.from("positions").upsert({
    tracker_id: tracker.id,
    traccar_position_id: p.id || null,
    fix_time: p.fixTime,
    latitude: p.latitude,
    longitude: p.longitude,
    speed_kmh: p.speed == null ? null : p.speed * KNOTS_TO_KMH,
    course: p.course ?? null,
    valid: p.valid ?? null,
    attributes: p.attributes ?? {},
  }, { onConflict: "tracker_id,fix_time", ignoreDuplicates: true }).select("id");
  if (error) return new Response(error.message, { status: 500 });

  // Only a newly saved position can raise a theft alert. A failed check is
  // logged rather than answered 500: the retry would find the position
  // already saved and skip the check anyway.
  if (inserted && inserted.length > 0) {
    const lockError = await checkLock(tracker, p);
    if (lockError) console.error(`lock check failed for ${imei}: ${lockError}`);
  }
  return new Response("ok");
});
