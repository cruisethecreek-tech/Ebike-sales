import { createClient } from '@/lib/supabase/server'
import { EmptyState } from '@/app/components/empty-state'
import { calculateBikeWarranties } from '@/lib/warranty'
import { GoogleReviewCard } from '@/app/components/google-review-card'
import { SerialNumberEditor } from './serial-number-editor'
import BikeForm from './bike-form'
import { BikeLocation } from '@/app/components/bike-location'
import { GpsLiveRefresh } from '@/app/components/gps-live-refresh'
import { loadTrackerStatuses, type TrackerStatus } from '@/lib/gps'
import Link from 'next/link'
import { getViewerContext } from '@/lib/view-as'
import { loadCatalog, matchCatalogModel, colorNamedIn, type CatalogModel } from '@/lib/bike-catalog'
import { BikeLookEditor } from './bike-look-editor'

// Per-customer data, and now also per-preview: an admin viewing as someone
// else must never be served a page cached for anybody. Never static.
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'My Bikes & Warranty — Cruise the Creek',
}

export default async function BikesPage() {
  let bikes: any[] = []
  let errorMsg = null
  let trackerByBike = new Map<string, TrackerStatus>()
  let isStaff = false
  let catalog: CatalogModel[] = []

  try {
    const supabase = await createClient()
    const { userId, realUserId } = await getViewerContext()

    // Staff get a colour picker on each bike. The customer never does.
    if (realUserId) {
      const { data: me } = await supabase.from('customers').select('is_admin').eq('id', realUserId).maybeSingle()
      isStaff = !!me?.is_admin
    }

    if (userId) {
      const { data, error } = await supabase
        .from('bikes')
        .select('*')
        .eq('customer_id', userId)
        .order('purchase_date', { ascending: false })
      
      if (error) throw error
      bikes = data || []

      // GPS is optional: a failure here must not hide the bikes themselves.
      const gps = await loadTrackerStatuses(supabase, { bikeIds: bikes.map((b) => b.id) })
      if (gps.error) console.error('Error fetching GPS trackers:', gps.error)
      trackerByBike = new Map(gps.statuses.map((s) => [s.tracker.bike_id!, s]))

      if (isStaff && bikes.length) catalog = await loadCatalog()
    }
  } catch (err: any) {
    console.error('Error fetching bikes:', err)
    errorMsg = 'Failed to load your bikes. Please check your connection.'
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-16">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1
            className="uppercase tracking-wide text-4xl text-[#2D4A32] mb-1"
            style={{ fontFamily: "'Bebas Neue', sans-serif" }}
          >
            🚴 My Registered E-Bikes
          </h1>
          <p className="text-sm text-[#4A4A4A]">
            Real-time manufacturer warranty countdown & Creek Ready annual service coverage.
          </p>
        </div>

        <Link
          href="/support"
          className="btn-primary text-xs px-4 py-2 font-bold shadow-xs flex items-center gap-1.5"
        >
          🔧 Request Service / Tune-Up
        </Link>
      </div>

      {errorMsg ? (
        <div className="p-4 bg-red-50 text-red-700 rounded-xl text-sm">{errorMsg}</div>
      ) : bikes.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 border border-[#E5E5E5] text-center space-y-4 shadow-sm">
          <span className="text-4xl block">🚲</span>
          <h3
            className="uppercase tracking-wide text-2xl text-[#1A2E1C]"
            style={{ fontFamily: "'Bebas Neue', sans-serif" }}
          >
            No Registered Bikes on File
          </h3>
          <p className="text-sm text-[#4A4A4A] max-w-md mx-auto">
            Bikes are automatically added to your account upon purchase or when an invoice is issued by Cruise the Creek staff.
          </p>
          <div className="pt-2">
            <Link href="/support" className="btn-primary text-xs px-5 py-2.5 font-bold inline-block shadow-sm">
              Contact Concierge or Support →
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {bikes.map((bike) => {
            const warranty = calculateBikeWarranties(bike.brand, bike.purchase_date, bike.warranty_expires_at)
            const brandModels = isStaff
              ? catalog.filter((m) => m.brand.toLowerCase() === String(bike.brand).toLowerCase())
              : []
            const guess = isStaff ? matchCatalogModel(brandModels, bike.brand, bike.model) : null
            const guessColor = guess ? colorNamedIn(bike.model, guess.colors) : null

            return (
              <div
                key={bike.id}
                className="bg-white rounded-2xl p-6 shadow-sm border border-[#E5E5E5] flex flex-col justify-between hover:border-[#2D4A32] transition-all space-y-5"
              >
                <div className="space-y-4">
                  {/* ── What the bike looks like: the catalogue photo for its colour ── */}
                  {bike.image_url && (
                    <div className="-mx-6 -mt-6 mb-2 rounded-t-2xl bg-[#F5F0E8] flex items-center justify-center h-48 overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={bike.image_url}
                        alt={`${bike.brand} ${bike.model}${bike.color_name ? ' in ' + bike.color_name : ''}`}
                        className="max-h-full max-w-full object-contain p-3"
                      />
                    </div>
                  )}

                  {/* Top Header */}
                  <div className="flex justify-between items-start">
                    <span className="px-3 py-1 rounded-full bg-[#2D4A32] text-white text-xs font-bold uppercase tracking-wider">
                      {bike.brand}
                    </span>
                    <span
                      className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                        warranty.isManufacturerWarrantyActive
                          ? 'bg-[#DCFCE7] text-[#15803D] border border-[#86EFAC]'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {!warranty.manufacturerWarrantyEndDate
                        ? warranty.hasPurchaseDate
                          ? 'Check warranty terms'
                          : 'Purchase date needed'
                        : warranty.isManufacturerWarrantyActive
                          ? '🛡️ Warranty Active'
                          : 'Warranty Expired'}
                    </span>
                  </div>

                  <div>
                    <h3
                      className="uppercase tracking-wide text-3xl text-[#1A2E1C]"
                      style={{ fontFamily: "'Bebas Neue', sans-serif" }}
                    >
                      {bike.model}
                    </h3>
                    {bike.color_name && (
                      <p className="flex items-center gap-1.5 text-xs text-[#1A2E1C] font-bold mb-0.5">
                        <span
                          className="inline-block w-3.5 h-3.5 rounded-full border border-black/20"
                          style={bike.color_hex ? { backgroundColor: bike.color_hex } : undefined}
                        />
                        {bike.color_name}
                      </p>
                    )}
                    <p className="text-xs text-gray-500">
                      Purchased: {bike.purchase_date ? new Date(bike.purchase_date).toLocaleDateString() : 'Recorded on file'}
                    </p>
                  </div>

                  {isStaff && (
                    <BikeLookEditor
                      bikeId={bike.id}
                      models={brandModels}
                      suggestedModelKey={guess?.key ?? null}
                      suggestedColor={guessColor?.name ?? null}
                      current={{ name: bike.color_name ?? null, hex: bike.color_hex ?? null }}
                    />
                  )}

                  {/* ── Frame Serial Number & Receipt ── */}
                  <SerialNumberEditor bike={bike} />

                  {/* ── GPS location, only on bikes with a tracker ── */}
                  {trackerByBike.has(bike.id) && <BikeLocation status={trackerByBike.get(bike.id)!} />}

                  {/* ── 1. Manufacturer Warranty Countdown ── */}
                  <div className="p-4 bg-[#F5F0E8] rounded-xl space-y-2 border border-[#E5E5E5]">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-[#1A2E1C] flex items-center gap-1">
                        🛡️ {bike.brand} Warranty · {warranty.headlineLabel}:
                      </span>
                      <span className="font-bold text-[#2D4A32]">
                        {!warranty.manufacturerWarrantyEndDate
                          ? '—'
                          : warranty.isManufacturerWarrantyActive
                            ? `${warranty.manufacturerWarrantyDaysLeft} Days Left`
                            : 'Expired'}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#2D4A32] transition-all duration-500 rounded-full"
                        style={{ width: `${100 - warranty.manufacturerWarrantyPercent}%` }}
                      />
                    </div>

                    {!warranty.hasPurchaseDate ? (
                      <p className="text-[11px] text-gray-500">
                        We don&apos;t have a purchase date for this bike yet, so the countdown can&apos;t start. Contact us and we&apos;ll add it.
                      </p>
                    ) : !warranty.hasKnownTerms ? (
                      <p className="text-[11px] text-gray-500">
                        {warranty.manufacturerWarrantyEndDate
                          ? `Expires: ${warranty.manufacturerWarrantyEndDate.toLocaleDateString()}. `
                          : ''}
                        Check the manufacturer&apos;s warranty for this bike, or ask us.
                      </p>
                    ) : (
                      <>
                        <ul className="text-[11px] text-gray-600 space-y-1 pt-1">
                          {warranty.coverage.map((c) => (
                            <li key={c.label} className="flex justify-between gap-3">
                              <span>
                                {c.label} <span className="text-gray-400">({c.term})</span>
                              </span>
                              <span className={`shrink-0 font-bold ${c.isActive ? 'text-[#2D4A32]' : 'text-gray-400'}`}>
                                {c.days == null
                                  ? 'Lifetime'
                                  : c.isActive
                                    ? `${c.daysLeft}d left · ${c.endDate!.toLocaleDateString()}`
                                    : `Ended ${c.endDate!.toLocaleDateString()}`}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {warranty.note && <p className="text-[11px] text-gray-500">{warranty.note}</p>}
                        <p className="text-[11px] text-gray-400">
                          Wear items (tires, tubes, brake pads, chain, cables, grips) are not covered by any brand.
                        </p>
                      </>
                    )}
                  </div>

                  {/* ── 2. Creek Ready Service Plan Countdown ── */}
                  <div className="p-4 bg-[#FBF7EF] rounded-xl space-y-2 border border-[#C9A96E]/40">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-[#2D4A32] flex items-center gap-1">
                        🌲 Creek Ready Service Plan:
                      </span>
                      <span className="font-bold text-[#B45309]">
                        {!warranty.creekReadyDueDate
                          ? 'Schedule Pending'
                          : warranty.isCreekReadyActive
                            ? `Tune-Up in ${warranty.creekReadyDaysLeft} Days`
                            : 'Tune-Up Due Now'}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-2.5 bg-amber-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#C9A96E] transition-all duration-500 rounded-full"
                        style={{ width: `${100 - warranty.creekReadyPercent}%` }}
                      />
                    </div>

                    <p className="text-[11px] text-gray-500">
                      Annual 28-point certified service due: {warranty.creekReadyDueDate?.toLocaleDateString() ?? 'once we have your purchase date'}
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-100 flex items-center gap-3">
                  <Link
                    href={`/support?bikeId=${bike.id}`}
                    className="flex-1 text-center py-2.5 px-4 rounded-xl bg-[#2D4A32] text-white text-xs font-bold hover:bg-[#1A2E1C] transition-colors shadow-xs"
                  >
                    🛠️ Book Creek Ready Tune-Up ($100.00 Member Rate)
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {trackerByBike.size > 0 && <GpsLiveRefresh />}

      {/* Register Another Bike Form */}
      <div className="mt-8">
        <BikeForm />
      </div>

      {/* Google Review Banner */}
      <GoogleReviewCard />
    </div>
  )
}
