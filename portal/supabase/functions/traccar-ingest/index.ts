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

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const KNOTS_TO_KMH = 1.852;

// Everything else Traccar emits (moving/stopped, ignition, online, …) is
// either derivable from positions or noise for a person watching alerts.
const KEPT_EVENT_TYPES = new Set([
  "alarm",
  "geofenceEnter",
  "geofenceExit",
  "deviceOffline",
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

  const { data: tracker, error: lookupError } = await supabase
    .from("trackers")
    .select("id, active")
    .eq("imei", imei)
    .maybeSingle();
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

    const { error } = await supabase.from("tracker_alerts").upsert({
      tracker_id: tracker.id,
      traccar_event_id: event.id,
      kind,
      occurred_at: event.eventTime,
      latitude: body.position?.latitude ?? null,
      longitude: body.position?.longitude ?? null,
      geofence_name: body.geofence?.name ?? null,
      attributes: event.attributes ?? {},
    }, { onConflict: "traccar_event_id", ignoreDuplicates: true });
    if (error) return new Response(error.message, { status: 500 });
    return new Response("ok");
  }

  const p = body.position;
  if (!p) return new Response("missing position", { status: 400 });

  const { error } = await supabase.from("positions").upsert({
    tracker_id: tracker.id,
    traccar_position_id: p.id,
    fix_time: p.fixTime,
    latitude: p.latitude,
    longitude: p.longitude,
    speed_kmh: p.speed == null ? null : p.speed * KNOTS_TO_KMH,
    course: p.course ?? null,
    valid: p.valid ?? null,
    attributes: p.attributes ?? {},
  }, { onConflict: "traccar_position_id", ignoreDuplicates: true });
  if (error) return new Response(error.message, { status: 500 });
  return new Response("ok");
});
