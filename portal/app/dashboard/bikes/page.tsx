import { createClient } from '@/lib/supabase/server'
import { EmptyState } from '@/app/components/empty-state'
import { calculateBikeWarranties } from '@/lib/warranty'
import { GoogleReviewCard } from '@/app/components/google-review-card'
import { SerialNumberEditor } from './serial-number-editor'
import BikeForm from './bike-form'
import { BikeLocation } from '@/app/components/bike-location'
import { CreekGuardAddChip, CreekGuardBadge } from '@/app/components/creekguard-badge'
import { GpsLiveRefresh } from '@/app/components/gps-live-refresh'
import { loadTrackerStatuses, type TrackerStatus } from '@/lib/gps'
import Link from 'next/link'
import { getViewerContext } from '@/lib/view-as'
import { loadCatalog, matchCatalogModel, colorNamedIn, type CatalogModel } from '@/lib/bike-catalog'
import { BikeLookEditor } from './bike-look-editor'
import { ShopInvoiceEditor } from './shop-invoice-editor'
import { DeliveryDateEditor } from './delivery-date-editor'
import { ServiceRecorder } from './service-recorder'
import { mileageStatus, SERVICE_INTERVAL_MILES } from '@/lib/mileage'
import type { BikeMileage } from '@/lib/types'

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
  let mileageByBike = new Map<string, BikeMileage>()
  let isStaff = false
  let catalog: CatalogModel[] = []

  try {
    const supabase = await createClient()
    const { userId, realUserId, viewingAs } = await getViewerContext()

    // Staff get a colour picker, shop invoice link and delivery date on each
    // bike. The customer never does, so neither does a preview of their page.
    if (realUserId && !viewingAs) {
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

      if (bikes.length) {
        const { data: mileage, error: mileageError } = await supabase
          .from('bike_mileage')
          .select('*')
          .in('bike_id', bikes.map((b) => b.id))
        if (mileageError) console.error('Error fetching bike mileage:', mileageError)
        mileageByBike = new Map(((mileage ?? []) as BikeMileage[]).map((m) => [m.bike_id, m]))
      }

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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {bikes.map((bike) => {
            const warranty = calculateBikeWarranties(bike.brand, bike.purchase_date, bike.warranty_expires_at, { deliveredOn: bike.delivered_on })
            // Mileage reminders only once the break-in tune is behind the bike
            // and a tracker is measuring it.
            const hasTracker = trackerByBike.has(bike.id)
            const mileage = hasTracker ? mileageStatus(mileageByBike.get(bike.id) ?? { bike_id: bike.id, distance_m: 0, service_distance_m: 0, last_serviced_on: null, updated_at: '' }) : null
            const mileageDue = !!mileage?.due && warranty.creekReadyKind === 'annual'
            const brandModels = isStaff
              ? catalog.filter((m) => m.brand.toLowerCase() === String(bike.brand).toLowerCase())
              : []
            const guess = isStaff ? matchCatalogModel(brandModels, bike.brand, bike.model) : null
            const guessColor = guess ? colorNamedIn(bike.model, guess.colors) : null

            return (
              // Collapsible so a customer with several bikes can scan them;
              // one bike starts open, several start closed.
              <details
                key={bike.id}
                open={bikes.length === 1}
                className="group bg-white rounded-2xl shadow-sm border border-[#E5E5E5] hover:border-[#2D4A32] transition-all"
              >
                <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer select-none p-6 group-open:pb-4 flex items-center gap-4">
                  {bike.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={bike.image_url}
                      alt=""
                      className="w-16 h-12 shrink-0 object-contain rounded-lg bg-[#F5F0E8] p-1 group-open:hidden"
                    />
                  ) : (
                    <span className="w-16 h-12 shrink-0 rounded-lg bg-[#F5F0E8] flex items-center justify-center text-2xl group-open:hidden">🚲</span>
                  )}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex justify-between items-start gap-2">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="px-3 py-1 rounded-full bg-[#2D4A32] text-white text-xs font-bold uppercase tracking-wider">
                          {bike.brand}
                        </span>
                        {hasTracker ? <CreekGuardBadge compact /> : <CreekGuardAddChip />}
                      </span>
                      <span
                        className={`text-xs font-bold px-2.5 py-0.5 rounded-full text-right ${
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
                    <div className="flex items-center justify-between gap-2">
                      <h3
                        className="uppercase tracking-wide text-3xl text-[#1A2E1C] truncate"
                        style={{ fontFamily: "'Bebas Neue', sans-serif" }}
                      >
                        {bike.model}
                      </h3>
                      <span aria-hidden className="shrink-0 text-[#2D4A32] text-lg transition-transform group-open:rotate-180">▾</span>
                    </div>
                    {mileageDue || (warranty.creekReadyDueDate && !warranty.isCreekReadyActive) ? (
                      <p className="text-[11px] font-bold text-[#B45309] group-open:hidden">🛠️ Tune-up due now</p>
                    ) : null}
                  </div>
                </summary>

                <div className="px-6 pb-6 space-y-5">
                  <div className="space-y-4">
                    {/* ── What the bike looks like: the catalogue photo for its colour ── */}
                    {bike.image_url && (
                      <div className="-mx-6 mb-2 bg-[#F5F0E8] flex items-center justify-center h-48 overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={bike.image_url}
                          alt={`${bike.brand} ${bike.model}${bike.color_name ? ' in ' + bike.color_name : ''}`}
                          className="max-h-full max-w-full object-contain p-3"
                        />
                      </div>
                    )}

                    <div>
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
                    {/* Only the fields it shows: the whole row would ship internal
                        columns (shop_invoice_url) to the customer's browser. */}
                    <SerialNumberEditor
                      bike={{
                        id: bike.id,
                        serial_number: bike.serial_number ?? null,
                        receipt_number: bike.receipt_number ?? null,
                        brand: bike.brand,
                        model: bike.model,
                      }}
                    />

                    {isStaff && <ShopInvoiceEditor bikeId={bike.id} current={bike.shop_invoice_url ?? null} />}
                    {isStaff && <DeliveryDateEditor bikeId={bike.id} current={bike.delivered_on ?? null} />}

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
                          🌲 {warranty.creekReadyKind === 'break-in' ? 'Free Break-In Tune-Up:' : 'Creek Ready Service Plan:'}
                        </span>
                        <span className="font-bold text-[#B45309]">
                          {mileageDue
                            ? 'Tune-Up Due Now'
                            : !warranty.creekReadyDueDate
                            ? 'Schedule Pending'
                            : warranty.isCreekReadyActive
                              ? warranty.creekReadyKind === 'break-in'
                                ? `${warranty.creekReadyDaysLeft} Days Left to Book`
                                : `Tune-Up in ${warranty.creekReadyDaysLeft} Days`
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
                        {warranty.creekReadyKind === 'break-in' && warranty.breakInDueDate
                          ? <>Free break-in tune (bolts re-torqued, brakes and gears adjusted): book by {warranty.breakInDueDate.toLocaleDateString()} ({warranty.breakInFromDelivery ? '30 days from delivery' : '40 days from purchase, allowing for shipping'}). Then annual 28-point service: {warranty.annualServiceDueDate?.toLocaleDateString()}.</>
                          : <>Annual 28-point certified service due: {warranty.creekReadyDueDate?.toLocaleDateString() ?? 'once we have your purchase date'}</>}
                      </p>

                      {mileage && (
                        <div className="pt-1 space-y-1">
                          <p className="text-[11px] text-gray-600">
                            📍 <span className="font-bold text-[#2D4A32]">{Math.round(mileage.miles).toLocaleString()} mi</span> ridden (GPS)
                            {' · '}
                            {mileage.due
                              ? <span className="font-bold text-[#B45309]">{SERVICE_INTERVAL_MILES} mi since the last tune-up, time to book</span>
                              : <>tune-up every {SERVICE_INTERVAL_MILES} mi or yearly, whichever comes first: {Math.round(mileage.milesToNext)} mi to go</>}
                            {mileage.lastServicedOn && <> · last tune-up {new Date(mileage.lastServicedOn + 'T12:00:00').toLocaleDateString()}</>}
                          </p>
                          {isStaff && <ServiceRecorder bikeId={bike.id} />}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-gray-100 flex items-center gap-3">
                    <Link
                      href={`/support?bikeId=${bike.id}`}
                      className="flex-1 text-center py-2.5 px-4 rounded-xl bg-[#2D4A32] text-white text-xs font-bold hover:bg-[#1A2E1C] transition-colors shadow-xs"
                    >
                      {warranty.creekReadyKind === 'break-in'
                        ? '🛠️ Book Free Break-In Tune-Up'
                        : '🛠️ Book Creek Ready Tune-Up ($100.00 Member Rate)'}
                    </Link>
                  </div>
                </div>
              </details>
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
