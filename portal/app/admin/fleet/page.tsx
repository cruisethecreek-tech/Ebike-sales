import { createClient } from '@/lib/supabase/server'
import { GpsLiveRefresh } from '@/app/components/gps-live-refresh'
import { FleetMap, type FleetBike } from '@/app/components/fleet-map'
import { alertLabel, bikeBatteryVolts, isStale, loadTrackerStatuses, mapLinks, timeAgo } from '@/lib/gps'
import type { Tracker, TrackerAlert } from '@/lib/types'
import {
  acknowledgeAlert,
  deleteTracker,
  lockTracker,
  registerTracker,
  restoreTracker,
  retireTracker,
  unlockTracker,
  updateTracker,
} from './actions'

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
  searchParams: Promise<{ error?: string; added?: string; notice?: string; manage_error?: string }>
}) {
  const { error: formError, added, notice, manage_error: manageError } = await searchParams
  const supabase = await createClient()

  const [gps, bikesRes, alertsRes, retiredRes] = await Promise.all([
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
    supabase
      .from('trackers')
      .select('*')
      .eq('active', false)
      .order('updated_at', { ascending: false }),
  ])

  const loadError = [
    gps.error && `trackers: ${gps.error}`,
    bikesRes.error && `bikes: ${bikesRes.error.message}`,
    alertsRes.error && `alerts: ${alertsRes.error.message}`,
    retiredRes.error && `retired trackers: ${retiredRes.error.message}`,
  ].filter(Boolean).join(' · ') || null
  if (loadError) console.error('[admin fleet] query failed —', loadError)

  const bikes = (bikesRes.data ?? []) as unknown as BikeRow[]
  const bikeById = new Map(bikes.map((b) => [b.id, b]))
  const trackedBikeIds = new Set(gps.statuses.map((s) => s.tracker.bike_id))
  const untrackedBikes = bikes.filter((b) => !trackedBikeIds.has(b.id))

  const retiredTrackers = (retiredRes.data ?? []) as Tracker[]

  // Bike pickers are grouped by owner and sorted by last name, so a bike is
  // found by who owns it rather than by when it was added.
  const ownerKey = (b: BikeRow) =>
    b.customers ? `${b.customers.last_name} ${b.customers.first_name}`.trim().toLowerCase() : '\uffff'
  const groupBikes = (list: BikeRow[]) => {
    const groups = new Map<string, { label: string; bikes: BikeRow[] }>()
    for (const b of [...list].sort(
      (x, y) =>
        ownerKey(x).localeCompare(ownerKey(y)) ||
        `${x.brand} ${x.model}`.localeCompare(`${y.brand} ${y.model}`),
    )) {
      const key = ownerKey(b)
      const label = b.customers ? `${b.customers.first_name} ${b.customers.last_name}`.trim() : 'No owner'
      if (!groups.has(key)) groups.set(key, { label, bikes: [] })
      groups.get(key)!.bikes.push(b)
    }
    return groups
  }
  const bikeOptions = (list: BikeRow[]) =>
    [...groupBikes(list).entries()].map(([key, group]) => (
      <optgroup key={key} label={group.label}>
        {group.bikes.map((b) => (
          <option key={b.id} value={b.id}>
            {b.brand} {b.model}
            {b.serial_number ? ` (${b.serial_number})` : ''}
          </option>
        ))}
      </optgroup>
    ))
  // A tracker can stay on its own bike or move to any bike without one.
  const bikeChoicesFor = (tracker: Tracker) => {
    const current = tracker.bike_id ? bikeById.get(tracker.bike_id) : undefined
    return current ? [current, ...untrackedBikes] : untrackedBikes
  }
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

  const fleetBikes: FleetBike[] = gps.statuses.flatMap(({ tracker, latest }) =>
    latest
      ? [{
          trackerId: tracker.id,
          name: tracker.label || bikeName(tracker.bike_id),
          owner: ownerName(tracker.bike_id),
          latitude: latest.latitude,
          longitude: latest.longitude,
          fix_time: latest.fix_time,
          ago: timeAgo(latest.fix_time),
          status: tracker.locked_at
            ? 'locked'
            : isStale(latest.fix_time)
              ? 'stale'
              : latest.speed_kmh != null && latest.speed_kmh > 1
                ? 'moving'
                : 'parked',
        }]
      : [],
  )

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

      {/* ── Fleet map ── */}
      {fleetBikes.length > 0 && (
        <section className="bg-white rounded-2xl p-5 border border-[#E5E5E5] shadow-sm space-y-3">
          <h2 className="uppercase tracking-wide text-xl text-[#1A2E1C]" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
            🗺️ Fleet Map
          </h2>
          <FleetMap bikes={fleetBikes} />
        </section>
      )}

      {/* ── Tracked bikes ── */}
      <section className="bg-white rounded-2xl p-5 border border-[#E5E5E5] shadow-sm space-y-3">
        <h2 className="uppercase tracking-wide text-xl text-[#1A2E1C]" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
          🚲 Tracked Bikes
        </h2>
        <p className="text-xs text-gray-500">
          Lock a parked bike to get a phone alert if it moves more than about 500 ft or starts riding. Unlock it before
          it goes out on a rental.
        </p>
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
                  <th className="py-2 pr-3">Map</th>
                  <th className="py-2">Theft Lock</th>
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
                      <td className="py-2.5 pr-3">
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
                      <td className="py-2.5">
                        {tracker.locked_at ? (
                          <form action={unlockTracker} className="flex items-center gap-2 whitespace-nowrap">
                            <input type="hidden" name="id" value={tracker.id} />
                            <span className="text-xs font-bold text-red-700">🔒 Locked {timeAgo(tracker.locked_at)}</span>
                            <button type="submit" className="text-xs px-2.5 py-1 rounded-lg border border-[#2D4A32] text-[#2D4A32] font-bold hover:bg-[#F1F5F1]">
                              Unlock
                            </button>
                          </form>
                        ) : (
                          <form action={lockTracker}>
                            <input type="hidden" name="id" value={tracker.id} />
                            <button type="submit" className="text-xs px-2.5 py-1 rounded-lg bg-[#2D4A32] text-white font-bold hover:bg-[#1A2E1C] whitespace-nowrap">
                              🔓 Lock
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Manage trackers ── */}
      <section id="manage" className="bg-white rounded-2xl p-5 border border-[#E5E5E5] shadow-sm space-y-3 scroll-mt-4">
        <h2 className="uppercase tracking-wide text-xl text-[#1A2E1C]" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
          🛠️ Manage Trackers
        </h2>
        <p className="text-xs text-gray-500">
          Fix a label, SIM or IMEI typo, or move a tracker to another bike. A moved tracker starts fresh: the new
          bike&apos;s owner only sees check-ins from after the move. If you fix an IMEI here, fix the Identifier in
          Traccar too. Device settings (geofences, commands) stay in Traccar.
        </p>
        {manageError && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{manageError}</div>}
        {notice && <div className="p-3 bg-[#DCFCE7] text-[#15803D] rounded-lg text-sm">{notice}</div>}

        {gps.statuses.length === 0 ? (
          <p className="text-sm text-gray-500">No active trackers.</p>
        ) : (
          <ul className="space-y-2">
            {gps.statuses.map(({ tracker }) => (
              <li key={tracker.id}>
                <details className="border border-[#E5E5E5] rounded-xl">
                  <summary className="cursor-pointer px-4 py-3 text-sm flex justify-between gap-3">
                    <span className="font-semibold text-[#1A2E1C]">{tracker.label || bikeName(tracker.bike_id)}</span>
                    <span className="text-xs font-bold text-[#2D4A32] underline">Edit</span>
                  </summary>
                  <div className="px-4 pb-4 space-y-4">
                    <form action={updateTracker} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <input type="hidden" name="id" value={tracker.id} />
                      <label className="space-y-1">
                        <span className="text-xs font-bold text-gray-600">IMEI</span>
                        <input name="imei" required inputMode="numeric" pattern="[0-9 ]{15,}" defaultValue={tracker.imei} className="w-full border rounded-lg px-3 py-2" />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-bold text-gray-600">Bike</span>
                        <select name="bike_id" required defaultValue={tracker.bike_id ?? 'none'} className="w-full border rounded-lg px-3 py-2 bg-white">
                          <option value="none">No bike (on the shelf)</option>
                          {bikeOptions(bikeChoicesFor(tracker))}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-bold text-gray-600">Label</span>
                        <input name="label" defaultValue={tracker.label ?? ''} className="w-full border rounded-lg px-3 py-2" />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-bold text-gray-600">SIM ICCID</span>
                        <input name="sim_iccid" defaultValue={tracker.sim_iccid ?? ''} className="w-full border rounded-lg px-3 py-2" />
                      </label>
                      <div className="sm:col-span-2">
                        <button type="submit" className="btn-primary text-xs px-5 py-2.5 font-bold">Save Changes</button>
                      </div>
                    </form>
                    <form action={retireTracker} className="border-t pt-3 flex flex-wrap items-center justify-between gap-3">
                      <input type="hidden" name="id" value={tracker.id} />
                      <p className="text-xs text-gray-500">
                        Retire stops tracking and frees the bike. Its history is kept and it can be put back later.
                      </p>
                      <button type="submit" className="text-xs px-3 py-1.5 rounded-lg border border-amber-600 text-amber-700 font-bold hover:bg-amber-50">
                        Retire Tracker
                      </button>
                    </form>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}

        {retiredTrackers.length > 0 && (
          <div className="space-y-2 pt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Retired Trackers</h3>
            <ul className="space-y-2">
              {retiredTrackers.map((tracker) => (
                <li key={tracker.id}>
                  <details className="border border-[#E5E5E5] rounded-xl bg-gray-50">
                    <summary className="cursor-pointer px-4 py-3 text-sm flex justify-between gap-3">
                      <span>
                        <span className="font-semibold text-gray-700">{tracker.label || 'Tracker'}</span>
                        <span className="block text-[11px] text-gray-500">IMEI {tracker.imei}</span>
                      </span>
                      <span className="text-xs font-bold text-[#2D4A32] underline">Options</span>
                    </summary>
                    <div className="px-4 pb-4 space-y-4">
                      <form action={restoreTracker} className="flex flex-wrap items-end gap-3 text-sm">
                        <input type="hidden" name="id" value={tracker.id} />
                        <label className="space-y-1 grow">
                          <span className="text-xs font-bold text-gray-600">Put back on</span>
                          <select name="bike_id" required defaultValue="" className="w-full border rounded-lg px-3 py-2 bg-white">
                            <option value="" disabled>Choose a bike…</option>
                            <option value="none">No bike (on the shelf)</option>
                            {bikeOptions(untrackedBikes)}
                          </select>
                        </label>
                        <button type="submit" className="btn-primary text-xs px-5 py-2.5 font-bold">Put Back in Service</button>
                      </form>
                      <form action={deleteTracker} className="border-t pt-3 space-y-2 text-sm">
                        <input type="hidden" name="id" value={tracker.id} />
                        <p className="text-xs text-red-700">
                          Delete permanently removes this tracker and every check-in and alert it recorded. This cannot be
                          undone. Type the IMEI to confirm.
                        </p>
                        <div className="flex flex-wrap gap-3">
                          <input name="confirm_imei" required inputMode="numeric" placeholder={tracker.imei} className="grow border rounded-lg px-3 py-2" />
                          <button type="submit" className="text-xs px-3 py-1.5 rounded-lg bg-red-700 text-white font-bold hover:bg-red-800">
                            Delete Permanently
                          </button>
                        </div>
                      </form>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
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
              {bikeOptions(untrackedBikes)}
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
