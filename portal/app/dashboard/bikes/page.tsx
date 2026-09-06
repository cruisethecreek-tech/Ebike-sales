import { createClient } from '@/lib/supabase/server'
import { EmptyState } from '@/app/components/empty-state'
import { calculateBikeWarranties } from '@/lib/warranty'
import { GoogleReviewCard } from '@/app/components/google-review-card'
import Link from 'next/link'

export const metadata = {
  title: 'My Bikes & Warranty — Cruise the Creek',
}

export default async function BikesPage() {
  let bikes: any[] = []
  let errorMsg = null

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      const { data, error } = await supabase
        .from('bikes')
        .select('*')
        .eq('customer_id', user.id)
        .order('purchase_date', { ascending: false })
      
      if (error) throw error
      bikes = data || []
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
            const warranty = calculateBikeWarranties(bike.brand, bike.purchase_date)

            return (
              <div
                key={bike.id}
                className="bg-white rounded-2xl p-6 shadow-sm border border-[#E5E5E5] flex flex-col justify-between hover:border-[#2D4A32] transition-all space-y-5"
              >
                <div className="space-y-4">
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
                      {warranty.isManufacturerWarrantyActive ? '🛡️ Warranty Active' : 'Warranty Expired'}
                    </span>
                  </div>

                  <div>
                    <h3
                      className="uppercase tracking-wide text-3xl text-[#1A2E1C]"
                      style={{ fontFamily: "'Bebas Neue', sans-serif" }}
                    >
                      {bike.model}
                    </h3>
                    <p className="text-xs text-gray-500">
                      Purchased: {bike.purchase_date ? new Date(bike.purchase_date).toLocaleDateString() : 'Recorded on file'}
                    </p>
                  </div>

                  {/* ── 1. Manufacturer Warranty Countdown ── */}
                  <div className="p-4 bg-[#F5F0E8] rounded-xl space-y-2 border border-[#E5E5E5]">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-[#1A2E1C] flex items-center gap-1">
                        🛡️ Manufacturer Warranty:
                      </span>
                      <span className="font-bold text-[#2D4A32]">
                        {warranty.isManufacturerWarrantyActive
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

                    <p className="text-[11px] text-gray-500">
                      Expires: {warranty.manufacturerWarrantyEndDate.toLocaleDateString()} · Covers frame, battery, motor & controller.
                    </p>
                  </div>

                  {/* ── 2. Creek Ready Service Plan Countdown ── */}
                  <div className="p-4 bg-[#FBF7EF] rounded-xl space-y-2 border border-[#C9A96E]/40">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-[#2D4A32] flex items-center gap-1">
                        🌲 Creek Ready Service Plan:
                      </span>
                      <span className="font-bold text-[#B45309]">
                        {warranty.isCreekReadyActive
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
                      Annual 28-point certified service due: {warranty.creekReadyDueDate.toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-100 flex items-center gap-3">
                  <Link
                    href={`/support?bikeId=${bike.id}`}
                    className="flex-1 text-center py-2.5 px-4 rounded-xl bg-[#2D4A32] text-white text-xs font-bold hover:bg-[#1A2E1C] transition-colors shadow-xs"
                  >
                    🛠️ Book Creek Ready Tune-Up ($125)
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Google Review Banner */}
      <GoogleReviewCard />
    </div>
  )
}
