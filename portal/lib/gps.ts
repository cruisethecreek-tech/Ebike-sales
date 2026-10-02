import type { SupabaseClient } from '@supabase/supabase-js'
import type { Position, Tracker, TrackerAlert } from '@/lib/types'

export type TrackerStatus = {
  tracker: Tracker
  latest: Position | null
  alerts: TrackerAlert[]
}

// Readable names for what Traccar sends in tracker_alerts.kind. Anything not
// listed is shown as-is rather than hidden.
const ALERT_LABELS: Record<string, string> = {
  powerCut: 'Bike battery disconnected',
  movedWhileLocked: 'Moved while locked',
  geofenceExit: 'Left area',
  geofenceEnter: 'Entered area',
  deviceOffline: 'Tracker went offline',
  sos: 'SOS',
  tampering: 'Tampering',
  movement: 'Unexpected movement',
}

export function alertLabel(alert: Pick<TrackerAlert, 'kind' | 'geofence_name'>): string {
  const label = ALERT_LABELS[alert.kind] ?? alert.kind
  return alert.geofence_name ? `${label}: ${alert.geofence_name}` : label
}

/**
 * Latest position and recent alerts for each tracker the caller can see.
 *
 * RLS does the scoping: a customer gets their own bikes' trackers (and only
 * data since each tracker went onto their bike), an admin gets the fleet.
 * One latest-position query per tracker is fine at fleet sizes in the tens;
 * `positions_tracker_time_idx` makes each one an index lookup.
 */
export async function loadTrackerStatuses(
  supabase: SupabaseClient,
  opts: { bikeIds?: string[]; alertDays?: number } = {},
): Promise<{ statuses: TrackerStatus[]; error: string | null }> {
  let trackerQuery = supabase.from('trackers').select('*').eq('active', true)
  if (opts.bikeIds) {
    if (opts.bikeIds.length === 0) return { statuses: [], error: null }
    trackerQuery = trackerQuery.in('bike_id', opts.bikeIds)
  }

  const { data: trackers, error } = await trackerQuery
  if (error) return { statuses: [], error: error.message }
  if (!trackers?.length) return { statuses: [], error: null }

  const since = new Date(Date.now() - (opts.alertDays ?? 7) * 86_400_000).toISOString()

  const statuses = await Promise.all(
    (trackers as Tracker[]).map(async (tracker) => {
      const [posRes, alertRes] = await Promise.all([
        supabase
          .from('positions')
          .select('*')
          .eq('tracker_id', tracker.id)
          .order('fix_time', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('tracker_alerts')
          .select('*')
          .eq('tracker_id', tracker.id)
          .gte('occurred_at', since)
          .order('occurred_at', { ascending: false })
          .limit(5),
      ])
      return {
        tracker,
        latest: (posRes.data as Position | null) ?? null,
        alerts: (alertRes.data as TrackerAlert[] | null) ?? [],
      }
    }),
  )

  return { statuses, error: null }
}

export function timeAgo(iso: string, now = Date.now()): string {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} hr ago`
  return `${Math.round(hours / 24)} days ago`
}

/** Trackers check in at least every 6 h when parked; past 7 h something is wrong. */
export function isStale(iso: string, now = Date.now()): boolean {
  return now - new Date(iso).getTime() > 7 * 3_600_000
}

export function mapLinks(lat: number, lon: number) {
  const d = 0.004
  const bbox = [lon - d, lat - d, lon + d, lat + d].join(',')
  return {
    embed: `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`,
    open: `https://www.google.com/maps?q=${lat},${lon}`,
  }
}

/** Teltonika reports external (bike battery) voltage as `power`, in volts. */
export function bikeBatteryVolts(position: Position | null): number | null {
  const v = position?.attributes?.power
  return typeof v === 'number' ? v : null
}
