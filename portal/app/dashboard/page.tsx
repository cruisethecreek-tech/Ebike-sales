import { createClient } from '@/lib/supabase/server'
import { BiometricSetup } from '@/app/components/biometric-setup'
import { GoogleReviewCard } from '@/app/components/google-review-card'
import { calculateBikeWarranties } from '@/lib/warranty'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch customer profile
  let customer: any = null
  let bikes: any[] = []
  let invoices: any[] = []

  try {
    const { data: c } = await supabase
      .from('customers')
      .select('*')
      .eq('id', user?.id)
      .single()
    customer = c

    const { data: b } = await supabase
      .from('bikes')
      .select('*')
      .eq('customer_id', user?.id)
      .order('purchase_date', { ascending: false })
    bikes = b || []

    const { data: i } = await supabase
      .from('invoices')
      .select('*')
      .eq('customer_id', user?.id)
      .order('issued_at', { ascending: false })
    invoices = i || []
  } catch {
    // graceful fallback
  }

  // Referral data
  let referralCount = 0
  let referralCredits: any[] = []
  try {
    const { count } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('referred_by', user?.id)
    referralCount = count || 0

    const { data: rc } = await supabase
      .from('referral_credits')
      .select('*')
      .eq('customer_id', user?.id)
    referralCredits = rc || []
  } catch {
    // graceful fallback
  }

  const pendingInvoices = invoices.filter((inv) => inv.status === 'pending')
  const firstName = customer?.first_name || 'Rider'

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Greeting */}
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div>
          <h1
            className="text-3xl sm:text-4xl font-bold tracking-wide"
            style={{ fontFamily: "'Bebas Neue', sans-serif", color: '#2D4A32', letterSpacing: '0.04em' }}
          >
            Hey {firstName}, ready to ride? 🚴
          </h1>
          <p className="mt-1 text-sm text-[#4A4A4A]">
            Your Adventure, Electrified. Here&apos;s your personal portal overview.
          </p>
        </div>

        {customer?.is_admin && (
          <Link
            href="/admin"
            className="btn-primary text-xs px-3.5 py-2 font-bold shadow-xs flex items-center gap-1"
          >
            👑 Admin Panel →
          </Link>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <div className="stat-card">
          <p className="stat-label">My Registered Bikes</p>
          <p className="stat-value">{bikes.length}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Invoices on File</p>
          <p className="stat-value">{invoices.length}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Pending Invoices</p>
          <p className="stat-value" style={{ color: pendingInvoices.length > 0 ? '#C9A96E' : '#fff' }}>
            {pendingInvoices.length > 0
              ? `$${pendingInvoices.reduce((s, i) => s + Number(i.total_amount), 0).toFixed(2)}`
              : '$0.00'}
          </p>
        </div>
      </div>

      {/* ── Registered Bikes & Warranty Status ── */}
      {bikes.length > 0 && (
        <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#E5E5E5] shadow-xs space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h2
              className="text-xl font-bold uppercase text-[#1A2E1C]"
              style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.04em' }}
            >
              🚴 My Registered E-Bikes & Warranty
            </h2>
            <Link href="/dashboard/bikes" className="text-xs font-bold text-[#2D4A32] hover:underline">
              View All Warranty Details →
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bikes.slice(0, 2).map((bike) => {
              const warranty = calculateBikeWarranties(bike.brand, bike.purchase_date)
              return (
                <div key={bike.id} className="p-4 rounded-xl bg-[#F5F0E8] border border-[#E5E5E5] space-y-2.5">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="px-2 py-0.5 rounded bg-[#2D4A32] text-white text-[10px] font-bold uppercase">
                        {bike.brand}
                      </span>
                      <h3 className="font-bold text-base text-[#1A1A1A] mt-1">{bike.model}</h3>
                    </div>
                    <span className="text-xs font-bold text-[#2D4A32] bg-white px-2 py-0.5 rounded border border-[#86EFAC]">
                      🛡️ {warranty.manufacturerWarrantyDaysLeft} Days Warranty
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-[#4A4A4A]">
                      <span>Creek Ready Service Plan:</span>
                      <span className="font-bold text-[#B45309]">
                        {warranty.isCreekReadyActive ? `Due in ${warranty.creekReadyDaysLeft}d` : 'Due Now'}
                      </span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#2D4A32] rounded-full"
                        style={{ width: `${100 - warranty.creekReadyPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Biometrics Activation Setup ── */}
      <BiometricSetup />

      {/* ── Referral Program Card ── */}
      {customer?.referral_code && (
        <div className="bg-[#FBF7EF] p-5 sm:p-6 rounded-2xl border border-[#6B8F71]/30 shadow-xs space-y-3">
          <div className="flex items-start gap-4">
            <span className="text-3xl">🎁</span>
            <div className="flex-1">
              <h3 className="font-bold text-lg text-[#2D4A32]">Refer a Friend, Earn $100!</h3>
              <p className="text-xs mt-1 text-[#4A4A4A]">
                Share your code <strong className="font-mono bg-[#F5F0E8] px-2 py-0.5 rounded text-[#2D4A32]">{customer.referral_code}</strong>.
                Every 2 referrals = $100 toward tune-ups, accessories, or your next bike!
              </p>
              <div className="flex items-center gap-3 mt-3">
                <div className="flex-1 h-3 rounded-full overflow-hidden bg-[#e8dfd1]">
                  <div
                    className="h-full rounded-full transition-all bg-[#2D4A32]"
                    style={{
                      width: `${Math.min(((referralCount % 2) / 2) * 100, 100)}%`,
                    }}
                  />
                </div>
                <span className="text-xs font-bold text-[#2D4A32]">
                  {referralCount % 2}/2 Referrals
                </span>
              </div>
              <div className="pt-2">
                <Link
                  href="/dashboard/referrals"
                  className="btn-primary text-xs px-4 py-2 font-bold inline-block shadow-xs"
                >
                  View My QR Code & Share →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Google Review Banner ── */}
      <GoogleReviewCard />
    </div>
  )
}
