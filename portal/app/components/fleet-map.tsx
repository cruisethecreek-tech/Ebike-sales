'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import type { LayerGroup, Map as LeafletMap } from 'leaflet'
import { GpsMap } from '@/app/components/gps-map'

export type FleetBike = {
  trackerId: string
  name: string
  owner: string
  latitude: number
  longitude: number
  fix_time: string
  ago: string
  status: 'moving' | 'parked' | 'stale' | 'locked'
}

const COLORS: Record<FleetBike['status'], string> = {
  moving: '#16A34A',
  parked: '#1A2E1C',
  stale: '#D97706',
  locked: '#B91C1C',
}

const LEGEND: { status: FleetBike['status']; label: string }[] = [
  { status: 'moving', label: 'Moving' },
  { status: 'parked', label: 'Parked' },
  { status: 'stale', label: 'No check-in 7 hr+' },
  { status: 'locked', label: 'Theft locked' },
]

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

/**
 * Every tracked bike on one map, coloured by status, with a picker that
 * opens a bike's ride history underneath (the same map customers get).
 */
export function FleetMap({ bikes }: { bikes: FleetBike[] }) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap | null>(null)
  const overlay = useRef<LayerGroup | null>(null)
  const leaflet = useRef<typeof import('leaflet') | null>(null)
  const fitted = useRef(false)
  const [ready, setReady] = useState(false)
  const [satellite, setSatellite] = useState(false)
  const [historyFor, setHistoryFor] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    import('leaflet').then((L) => {
      if (cancelled || !el.current || map.current) return
      leaflet.current = L
      map.current = L.map(el.current).setView([41.1, -80.65], 11)
      map.current.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>')
      overlay.current = L.layerGroup().addTo(map.current)
      setReady(true)
    })
    return () => {
      cancelled = true
      map.current?.remove()
      map.current = null
    }
  }, [])

  useEffect(() => {
    const L = leaflet.current
    const m = map.current
    if (!ready || !L || !m) return
    const layer = satellite
      ? L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
          attribution: 'Imagery &copy; Esri',
          maxZoom: 19,
        })
      : L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19,
        })
    layer.addTo(m)
    return () => {
      layer.remove()
    }
  }, [ready, satellite])

  useEffect(() => {
    const L = leaflet.current
    const m = map.current
    const layer = overlay.current
    if (!ready || !L || !m || !layer) return
    layer.clearLayers()
    for (const b of bikes) {
      L.circleMarker([b.latitude, b.longitude], {
        radius: 9,
        color: '#fff',
        weight: 3,
        fillColor: COLORS[b.status],
        fillOpacity: 1,
      })
        .bindTooltip(escapeHtml(b.name), { permanent: true, direction: 'right', offset: [10, 0] })
        .bindPopup(
          `<b>${escapeHtml(b.name)}</b><br>${escapeHtml(b.owner)}<br>Last check-in ${escapeHtml(b.ago)}`,
        )
        .on('click', () => setHistoryFor(b.trackerId))
        .addTo(layer)
    }
    // Fit to the fleet once; after that, live refreshes keep the admin's view.
    if (!fitted.current && bikes.length) {
      m.fitBounds(L.latLngBounds(bikes.map((b) => [b.latitude, b.longitude] as [number, number])), {
        padding: [40, 40],
        maxZoom: 16,
      })
      fitted.current = true
    }
  }, [ready, bikes])

  const selected = bikes.find((b) => b.trackerId === historyFor)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-3 text-[11px] text-gray-600">
          {LEGEND.map((l) => (
            <span key={l.status} className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: COLORS[l.status] }} />
              {l.label}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setSatellite((s) => !s)}
          className="px-2.5 py-1 rounded-full text-[11px] font-bold border bg-white text-[#2D4A32] border-[#D9D3C7]"
        >
          {satellite ? 'Map view' : 'Satellite view'}
        </button>
      </div>

      <div ref={el} className="w-full h-80 sm:h-[28rem] rounded-xl border border-[#E5E5E5] z-0" />

      <div className="space-y-2">
        <label className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#1A2E1C]">
          Ride history for
          <select
            value={historyFor}
            onChange={(e) => setHistoryFor(e.target.value)}
            className="border border-[#D9D3C7] rounded-lg px-2 py-1 text-xs font-normal"
          >
            <option value="">Pick a bike (or tap one on the map)</option>
            {bikes.map((b) => (
              <option key={b.trackerId} value={b.trackerId}>
                {b.name} · {b.owner}
              </option>
            ))}
          </select>
        </label>
        {selected && (
          <div className="p-3 bg-[#F5F0E8] rounded-xl border border-[#E5E5E5]">
            <GpsMap key={selected.trackerId} trackerId={selected.trackerId} latest={selected} />
          </div>
        )}
      </div>
    </div>
  )
}
