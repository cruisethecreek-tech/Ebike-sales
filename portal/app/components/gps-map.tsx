'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { LayerGroup, Map as LeafletMap, TileLayer } from 'leaflet'
import { createClient } from '@/lib/supabase/client'
import { cleanTrack, formatDuration, splitTrips, summarize, type TrackPoint, type Trip } from '@/lib/gps-trips'

type Range = 'today' | '24h' | '7d'
type Basemap = 'street' | 'satellite'

const RANGES: { key: Range; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '24h', label: '24 hr' },
  { key: '7d', label: '7 days' },
]

// Free tile servers; both need their attribution shown on the map.
const TILES: Record<Basemap, { url: string; attribution: string; maxZoom: number }> = {
  street: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagery &copy; Esri',
    maxZoom: 19,
  },
}

// PostgREST returns at most 1000 rows per request, so a week of riding is
// fetched in pages. The cap keeps a runaway tracker from stalling the page.
const PAGE = 1000
const MAX_POINTS = 10_000

function rangeStart(range: Range): Date {
  if (range === 'today') {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }
  return new Date(Date.now() - (range === '24h' ? 1 : 7) * 86_400_000)
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

function tripLabel(t: Trip): string {
  const start = new Date(t.start)
  const sameDay = new Date().toDateString() === start.toDateString()
  return `${sameDay ? '' : `${dayFmt.format(start)}, `}${timeFmt.format(start)} – ${timeFmt.format(new Date(t.end))}`
}

/**
 * Interactive map for one tracked bike: pan and zoom, street or satellite,
 * the route it took over a chosen period, and a list of rides with distance
 * and top speed. Positions are read with the signed-in user's session, so
 * RLS limits customers to their own bike's history.
 */
export function GpsMap({
  trackerId,
  latest,
}: {
  trackerId: string
  latest: { latitude: number; longitude: number; fix_time: string }
}) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap | null>(null)
  const tiles = useRef<TileLayer | null>(null)
  const overlay = useRef<LayerGroup | null>(null)
  const leaflet = useRef<typeof import('leaflet') | null>(null)

  const [ready, setReady] = useState(false)
  const [range, setRange] = useState<Range>('today')
  const [basemap, setBasemap] = useState<Basemap>('street')
  const [points, setPoints] = useState<TrackPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(null)

  // Create the map once. Leaflet touches `window`, so it is loaded here
  // rather than at module level, which would break server rendering.
  useEffect(() => {
    let cancelled = false
    import('leaflet').then((L) => {
      if (cancelled || !el.current || map.current) return
      leaflet.current = L
      map.current = L.map(el.current, { zoomControl: true, attributionControl: true }).setView(
        [latest.latitude, latest.longitude],
        16,
      )
      map.current.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>')
      overlay.current = L.layerGroup().addTo(map.current)
      setReady(true)
    })
    return () => {
      cancelled = true
      map.current?.remove()
      map.current = null
    }
    // The map is created once; later positions are drawn by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const L = leaflet.current
    if (!ready || !L || !map.current) return
    tiles.current?.remove()
    const t = TILES[basemap]
    tiles.current = L.tileLayer(t.url, { attribution: t.attribution, maxZoom: t.maxZoom }).addTo(map.current)
  }, [ready, basemap])

  // Reload history when the range changes or a new check-in arrives.
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const supabase = createClient()
      const since = rangeStart(range).toISOString()
      const rows: TrackPoint[] = []
      for (let from = 0; from < MAX_POINTS; from += PAGE) {
        const { data, error } = await supabase
          .from('positions')
          .select('fix_time, latitude, longitude, speed_kmh, valid')
          .eq('tracker_id', trackerId)
          .gte('fix_time', since)
          .order('fix_time', { ascending: true })
          .range(from, from + PAGE - 1)
        if (error) {
          if (!cancelled) setError(error.message)
          break
        }
        rows.push(...((data ?? []) as TrackPoint[]))
        if (!data || data.length < PAGE) break
      }
      if (!cancelled) {
        setPoints(rows)
        setSelected(null)
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [trackerId, range, latest.fix_time])

  const track = useMemo(() => cleanTrack(points), [points])
  const trips = useMemo(() => splitTrips(track), [track])
  const totals = useMemo(() => summarize(trips), [trips])

  // Draw the route, ride start points and the bike's current spot.
  useEffect(() => {
    const L = leaflet.current
    const m = map.current
    const layer = overlay.current
    if (!ready || !L || !m || !layer) return
    layer.clearLayers()

    const shown = selected != null && trips[selected] ? [trips[selected]] : trips
    const bounds = L.latLngBounds([[latest.latitude, latest.longitude]])
    for (const trip of shown) {
      const line = trip.points.map((p) => [p.latitude, p.longitude] as [number, number])
      L.polyline(line, { color: '#ffffff', weight: 7, opacity: 0.9 }).addTo(layer)
      L.polyline(line, { color: '#2D4A32', weight: 4 }).addTo(layer)
      L.circleMarker(line[0], { radius: 5, color: '#fff', weight: 2, fillColor: '#C9A96E', fillOpacity: 1 })
        .bindTooltip(`Ride started ${timeFmt.format(new Date(trip.start))}`)
        .addTo(layer)
      line.forEach((ll) => bounds.extend(ll))
    }

    L.circleMarker([latest.latitude, latest.longitude], {
      radius: 9,
      color: '#fff',
      weight: 3,
      fillColor: '#1A2E1C',
      fillOpacity: 1,
    })
      .bindTooltip('Bike is here', { direction: 'top', offset: [0, -8] })
      .addTo(layer)

    if (shown.length) m.fitBounds(bounds, { padding: [24, 24], maxZoom: 17 })
    else m.setView([latest.latitude, latest.longitude], 16)
  }, [ready, trips, selected, latest.latitude, latest.longitude])

  const recenter = () => map.current?.setView([latest.latitude, latest.longitude], 17)

  const chip = (active: boolean) =>
    `px-2.5 py-1 rounded-full text-[11px] font-bold border ${
      active ? 'bg-[#2D4A32] text-white border-[#2D4A32]' : 'bg-white text-[#2D4A32] border-[#D9D3C7]'
    }`

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5" role="group" aria-label="History range">
          {RANGES.map((r) => (
            <button key={r.key} type="button" className={chip(range === r.key)} onClick={() => setRange(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Map style">
          <button type="button" className={chip(basemap === 'street')} onClick={() => setBasemap('street')}>
            Map
          </button>
          <button type="button" className={chip(basemap === 'satellite')} onClick={() => setBasemap('satellite')}>
            Satellite
          </button>
        </div>
      </div>

      <div className="relative">
        <div ref={el} className="w-full h-72 sm:h-80 rounded-lg border border-[#E5E5E5] z-0" />
        <button
          type="button"
          onClick={recenter}
          className="absolute bottom-3 right-3 z-[400] px-2.5 py-1.5 rounded-lg bg-white shadow text-[11px] font-bold text-[#2D4A32] border border-[#D9D3C7]"
        >
          ◎ Find bike
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'Distance', value: `${totals.miles.toFixed(1)} mi` },
          { label: 'Ride time', value: formatDuration(totals.minutes) },
          { label: 'Top speed', value: `${totals.topMph} mph` },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-lg border border-[#E5E5E5] py-1.5">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">{s.label}</p>
            <p className="text-sm font-bold text-[#1A2E1C]">{loading ? '…' : s.value}</p>
          </div>
        ))}
      </div>

      {error ? (
        <p className="text-[11px] text-red-700">Could not load ride history: {error}</p>
      ) : !loading && trips.length === 0 ? (
        <p className="text-[11px] text-gray-500">No rides in this period. The dot shows where the bike is parked.</p>
      ) : (
        trips.length > 0 && (
          <ul className="space-y-1">
            {selected != null && (
              <li>
                <button type="button" onClick={() => setSelected(null)} className="text-[11px] font-bold text-[#2D4A32] underline">
                  Show all rides
                </button>
              </li>
            )}
            {[...trips.keys()].reverse().map((i) => {
              const t = trips[i]
              return (
                <li key={t.start}>
                  <button
                    type="button"
                    onClick={() => setSelected(i)}
                    className={`w-full flex justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left text-[11px] border ${
                      selected === i ? 'bg-white border-[#2D4A32]' : 'bg-white/60 border-transparent hover:bg-white'
                    }`}
                  >
                    <span className="font-semibold text-[#1A2E1C]">🚲 {tripLabel(t)}</span>
                    <span className="text-gray-500 whitespace-nowrap">
                      {t.miles.toFixed(1)} mi · {formatDuration(t.minutes)} · {t.topMph} mph
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )
      )}
    </div>
  )
}
