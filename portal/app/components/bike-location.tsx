import { GpsMap } from '@/app/components/gps-map'
import { alertLabel, bikeBatteryVolts, isStale, mapLinks, timeAgo, type TrackerStatus } from '@/lib/gps'

/** Location panel for one tracked bike: live map with ride history, last check-in, recent alerts. */
export function BikeLocation({ status }: { status: TrackerStatus }) {
  const { latest, alerts } = status

  if (!latest) {
    return (
      <div className="p-4 bg-[#F5F0E8] rounded-xl border border-[#E5E5E5] text-xs text-[#4A4A4A]">
        📍 GPS tracker installed. Waiting for its first check-in.
      </div>
    )
  }

  const links = mapLinks(latest.latitude, latest.longitude)
  const stale = isStale(latest.fix_time)
  const volts = bikeBatteryVolts(latest)

  return (
    <div className="p-4 bg-[#F5F0E8] rounded-xl space-y-3 border border-[#E5E5E5]">
      <div className="flex justify-between items-center text-xs">
        <span className="font-bold text-[#1A2E1C]">📍 Bike Location</span>
        <span className={`font-bold ${stale ? 'text-amber-700' : 'text-[#2D4A32]'}`}>
          {stale ? 'Last seen ' : 'Updated '}
          {timeAgo(latest.fix_time)}
        </span>
      </div>

      <GpsMap trackerId={status.tracker.id} latest={latest} />

      <div className="flex flex-wrap justify-between items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
        <span>
          {latest.speed_kmh != null && latest.speed_kmh > 1
            ? `Moving · ${Math.round(latest.speed_kmh * 0.621371)} mph`
            : 'Parked'}
          {volts != null && ` · Bike battery ${volts.toFixed(1)} V`}
        </span>
        <a href={links.open} target="_blank" rel="noopener noreferrer" className="font-bold text-[#2D4A32] underline">
          Open in Maps ↗
        </a>
      </div>

      {alerts.length > 0 && (
        <ul className="space-y-1 pt-2 border-t border-[#E5E5E5]">
          {alerts.map((a) => (
            <li key={a.id} className="flex justify-between text-[11px]">
              <span className="font-semibold text-red-700">⚠️ {alertLabel(a)}</span>
              <span className="text-gray-500">{timeAgo(a.occurred_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
