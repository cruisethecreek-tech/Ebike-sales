import { createClient } from '@/lib/supabase/server'
import { GpsLiveRefresh } from '@/app/components/gps-live-refresh'
import { alertLabel, bikeBatteryVolts, isStale, loadTrackerStatuses, mapLinks, timeAgo } from '@/lib/gps'
import type { TrackerAlert } from '@/lib/types'
import { acknowledgeAlert, registerTracker } from './actions'

export const metadata = {
  title: 'Fleet GPS — Cruise the Creek Admin',
}

type BikeRow = {
  id: string
  brand: string
  model: string
  serial_number: string | null
  customers: { first_name: string; last_name: string } | null
}

export default async function AdminFleet({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; added?: string }>
}) {
  const { error: formError, added } = await searchParams
  const supabase = await createClient()

  const [gps, bikesRes, alertsRes] = await Promise.all([
    loadTrackerStatuses(supabase, { alertDays: 30 }),
    supabase
      .from('bikes')
      .select('id, brand, model, serial_number, customers(first_name, last_name)')
      .order('created_at', { ascending: false }),
    supabase
      .from('tracker_alerts')
      .select('*')
      .is('acknowledged_at', null)
      .order('occurred_at', { ascending: false })
      .limit(50),
  ])

  const loadError = [
    gps.error && `trackers: ${gps.error}`,
    bikesRes.error && `bikes: ${bikesRes.error.message}`,
    alertsRes.error && `alerts: ${alertsRes.error.message}`,
  ].filter(Boolean).join(' · ') || null
  if (loadError) console.error('[admin fleet] query failed —', loadError)

  const bikes = (bikesRes.data ?? []) as unknown as BikeRow[]
  const bikeById = new Map(bikes.map((b) => [b.id, b]))
  const trackedBikeIds = new Set(gps.statuses.map((s) => s.tracker.bike_id))
  const untrackedBikes = bikes.filter((b) => !trackedBikeIds.has(b.id))
  const openAlerts = (alertsRes.data ?? []) as TrackerAlert[]
  const trackerById = new Map(gps.statuses.map((s) => [s.tracker.id, s.tracker]))

  const bikeName = (bikeId: string | null) => {
    const bike = bikeId ? bikeById.get(bikeId) : undefined
    return bike ? `${bike.brand} ${bike.model}` : 'Unassigned'
  }
  const ownerName = (bikeId: string | null) => {
    const c = bikeId ? bikeById.get(bikeId)?.customers : null
    return c ? `${c.first_name} ${c.last_name}` : '—'
  }

  const online = gps.statuses.filter((s) => s.latest && !isStale(s.latest.fix_time)).length

  return (
    <div className="space-y-8 w-full max-w-full">
      <GpsLiveRefresh />

      <div>
        <h1
          className="uppercase tracking-wide text-3xl text-[#1A2E1C]"
          style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.04em' }}
        >
          📍 Fleet GPS
        </h1>
        <p className="text-xs text-[#4A4A4A]">Live location of every tracked bike, open alerts, and tracker setup</p>
      </div>

      {loadError && (
        <div className="p-4 bg-red-50 text-red-700 rounded-xl text-sm">Could not load everything: {loadError}</div>
      )}

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {[
          { label: 'Tracked Bikes', value: gps.statuses.length, color: '#2D4A32' },
          { label: 'Checked In (7 hr)', value: online, color: '#2D4A32' },
          { label: 'Open Alerts', value: openAlerts.length, color: openAlerts.length ? '#B91C1C' : '#2D4A32' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white p-4 rounded-xl border border-[#E5E5E5] shadow-xs">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">{kpi.label}</h3>
            <p className="text-2xl sm:text-3xl font-bold mt-1" style={{ fontFamily: "'Bebas Neue', sans-serif", color: kpi.color }}>
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Open alerts ── */}
      <section className="bg-white rounded-2xl p-5 border border-[#E5E5E5] shadow-sm space-y-3">
        <h2 className="uppercase tracking-wide text-xl text-[#1A2E1C]" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
          ⚠️ Open Alerts
        </h2>
        {openAlerts.length === 0 ? (
          <p className="text-sm text-gray-500">No open alerts.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {openAlerts.map((a) => {
              const tracker = trackerById.get(a.tracker_id)
              return (
                <li key={a.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                  <div>
                    <p className="font-bold text-red-700">{alertLabel(a)}</p>
                    <p className="text-xs text-gray-500">
                      {tracker?.label || bikeName(tracker?.bike_id ?? null)} · {ownerName(tracker?.bike_id ?? null)} · {timeAgo(a.occurred_at)}
                      {a.latitude != null && a.longitude != null && (
                        <>
                          {' · '}
                          <a href={mapLinks(a.latitude, a.longitude).open} target="_blank" rel="noopener noreferrer" className="underline">
                            map ↗
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                  <form action={acknowledgeAlert}>
                    <input type="hidden" name="id" value={a.id} />
                    <button type="submit" className="text-xs px-3 py-1.5 rounded-lg bg-[#2D4A32] text-white font-bold hover:bg-[#1A2E1C]">
                      Acknowledge
                    </button>
                  </form>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* ── Tracked bikes ── */}
      <section className="bg-white rounded-2xl p-5 border border-[#E5E5E5] shadow-sm space-y-3">
        <h2 className="uppercase tracking-wide text-xl text-[#1A2E1C]" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
          🚲 Tracked Bikes
        </h2>
        {gps.statuses.length === 0 ? (
          <p className="text-sm text-gray-500">No trackers registered yet. Add one below.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b">
                  <th className="py-2 pr-3">Bike</th>
                  <th className="py-2 pr-3">Owner</th>
                  <th className="py-2 pr-3">Last Check-in</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Battery</th>
                  <th className="py-2">Map</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {gps.statuses.map(({ tracker, latest }) => {
                  const stale = !latest || isStale(latest.fix_time)
                  const volts = bikeBatteryVolts(latest)
                  return (
                    <tr key={tracker.id}>
                      <td className="py-2.5 pr-3">
                        <p className="font-semibold text-[#1A2E1C]">{tracker.label || bikeName(tracker.bike_id)}</p>
                        <p className="text-[11px] text-gray-500">IMEI {tracker.imei}</p>
                      </td>
                      <td className="py-2.5 pr-3">{ownerName(tracker.bike_id)}</td>
                      <td className={`py-2.5 pr-3 ${stale ? 'text-amber-700 font-semibold' : ''}`}>
                        {latest ? timeAgo(latest.fix_time) : 'Never'}
                      </td>
                      <td className="py-2.5 pr-3">
                        {!latest ? '—' : latest.speed_kmh != null && latest.speed_kmh > 1
                          ? `Moving ${Math.round(latest.speed_kmh * 0.621371)} mph`
                          : 'Parked'}
                      </td>
                      <td className="py-2.5 pr-3">{volts != null ? `${volts.toFixed(1)} V` : '—'}</td>
                      <td className="py-2.5">
                        {latest ? (
                          <a
                            href={mapLinks(latest.latitude, latest.longitude).open}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-bold text-[#2D4A32] underline"
                          >
                            Open ↗
                          </a>
                        ) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Register a tracker ── */}
      <section className="bg-white rounded-2xl p-5 border border-[#E5E5E5] shadow-sm space-y-3">
        <h2 className="uppercase tracking-wide text-xl text-[#1A2E1C]" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
          ➕ Register a Tracker
        </h2>
        <p className="text-xs text-gray-500">
          Add the tracker here before powering it on. Check-ins from an unregistered IMEI are ignored. Rental bikes go
          under your own account; a customer&apos;s bike shows the location on their My Bikes page.
        </p>
        {formError && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{formError}</div>}
        {added && <div className="p-3 bg-[#DCFCE7] text-[#15803D] rounded-lg text-sm">Tracker registered.</div>}
        <form action={registerTracker} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <label className="space-y-1">
            <span className="text-xs font-bold text-gray-600">IMEI (15 digits, on the tracker label)</span>
            <input name="imei" required inputMode="numeric" pattern="[0-9 ]{15,}" className="w-full border rounded-lg px-3 py-2" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold text-gray-600">Bike</span>
            <select name="bike_id" required className="w-full border rounded-lg px-3 py-2 bg-white" defaultValue="">
              <option value="" disabled>Choose a bike…</option>
              {untrackedBikes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.brand} {b.model}
                  {b.customers ? ` — ${b.customers.first_name} ${b.customers.last_name}` : ''}
                  {b.serial_number ? ` (${b.serial_number})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold text-gray-600">Label (optional)</span>
            <input name="label" placeholder="Rental Ranger S #1" className="w-full border rounded-lg px-3 py-2" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold text-gray-600">SIM ICCID (optional)</span>
            <input name="sim_iccid" className="w-full border rounded-lg px-3 py-2" />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary text-xs px-5 py-2.5 font-bold">
              Register Tracker
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
