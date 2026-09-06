import { createClient } from '@/lib/supabase/server'
import { EmptyState } from '@/app/components/empty-state'
import { CopyButton } from './copy-button'
import { QRCodeCard } from '@/app/components/qr-code'
import { GoogleReviewCard } from '@/app/components/google-review-card'
import { redirect } from 'next/navigation'

export default async function ReferralsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth')
  }

  const { data: customer } = await supabase
    .from('customers')
    .select('id, referral_code, first_name, last_name, phone')
    .eq('id', user.id)
    .single()

  if (!customer) {
    return (
      <div className="p-8">
        <EmptyState title="Customer not found" description="We couldn't find your customer record." />
      </div>
    )
  }

  const { data: referredUsers } = await supabase
    .from('customers')
    .select('first_name, last_name, created_at')
    .eq('referred_by', customer.id)
    
  const referralCount = referredUsers?.length || 0

  const { data: credits } = await supabase
    .from('referral_credits')
    .select('*')
    .eq('customer_id', customer.id)
    .order('created_at', { ascending: false })

  const availableCredits = credits?.filter(c => !c.redeemed) || []
  const totalBalance = availableCredits.reduce((sum, c) => sum + (Number(c.amount) || 0), 0)

  const progressCount = referralCount % 2
  const progressPercent = (progressCount / 2) * 100
  const hasReachedGoal = referralCount >= 2

  const refCode = customer.referral_code || 'CTC-REF'
  const customerFullName = `${customer.first_name} ${customer.last_name}`
  const referralUrl = `https://portal.cruisethecreek.com/auth?ref=${encodeURIComponent(refCode)}`

  // Links for service (25% discount) and shop (standard) with prefilled customer details
  const custFirst = encodeURIComponent(customer.first_name || '')
  const custLast  = encodeURIComponent(customer.last_name || '')
  const custPhone = encodeURIComponent(customer.phone || '')
  const custEmail = encodeURIComponent(user.email || '')
  const encRef    = encodeURIComponent(refCode)

  const tuneupDiscountUrl = `https://ebike-sales.pages.dev/repair-intake.html?service=tuneup&discount=25&promo=25OFF&ref=${encRef}&firstName=${custFirst}&lastName=${custLast}&phone=${custPhone}&email=${custEmail}`
  const accessoriesShopUrl = `https://ebike-sales.pages.dev/accessories.html?ref=${encRef}&firstName=${custFirst}&lastName=${custLast}&phone=${custPhone}&email=${custEmail}`
  const apparelShopUrl = `https://ebike-sales.pages.dev/apparel.html?ref=${encRef}&firstName=${custFirst}&lastName=${custLast}&phone=${custPhone}&email=${custEmail}`
  const creekReadyPolicyUrl = `https://ebike-sales.pages.dev/creek-ready.html?ref=${encRef}&firstName=${custFirst}&lastName=${custLast}&phone=${custPhone}&email=${custEmail}`

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16">
      <div>
        <h1
          className="uppercase tracking-wide text-4xl text-[#2D4A32] mb-1"
          style={{ fontFamily: "'Bebas Neue', sans-serif" }}
        >
          🎁 Member Referral Rewards & Services
        </h1>
        <p className="text-sm text-[#4A4A4A]">
          Share your referral code to earn $100 credits for every 2 friends who purchase, plus claim your 25% member tune-up discount!
        </p>
      </div>

      {/* ── Referral Program & Tune-Up Benefit Hub ── */}
      <div className="bg-gradient-to-r from-[#1A2E1C] via-[#233A26] to-[#2D4A32] text-white p-6 rounded-2xl shadow-sm border border-[#C9A96E]/40 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="px-3 py-1 rounded-full bg-[#C9A96E] text-[#1A2E1C] font-bold text-xs uppercase tracking-wider">
            🎉 Every 2 Referrals = $100 Credit
          </span>
          <span className="font-mono text-xs text-[#C9A96E]">Your Code: {refCode}</span>
        </div>

        <div>
          <h2
            className="uppercase tracking-wide text-2xl text-[#F5F0E8]"
            style={{ fontFamily: "'Bebas Neue', sans-serif" }}
          >
            Earn $100 Account Credit & Save 25% on Tune-Ups
          </h2>
          <p className="text-xs text-gray-300 mt-1 max-w-xl">
            Refer friends and earn <strong>$100 account credit</strong> for every 2 successful purchases. Plus, enjoy <strong>25% off Creek Ready Tune-Ups</strong> anytime!
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <a
            href={tuneupDiscountUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-3.5 rounded-xl bg-white/10 hover:bg-white/20 border border-[#C9A96E]/50 transition-all flex flex-col justify-between group"
          >
            <div>
              <span className="text-xs font-bold text-[#C9A96E] block">🌲 Creek Ready Tune-Up</span>
              <span className="text-sm font-bold text-white">
                <s className="text-gray-400 font-normal mr-1">$125</s> $93.75 (25% Off)
              </span>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-[#C9A96E] text-[#1A2E1C] group-hover:scale-105 transition-transform self-end mt-3">
              Book Tune-Up ↗
            </span>
          </a>

          <a
            href={accessoriesShopUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-3.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 transition-all flex flex-col justify-between group"
          >
            <div>
              <span className="text-xs font-bold text-[#C9A96E] block">🪖 Accessories</span>
              <span className="text-sm font-bold text-white">Locks, Helmets & Gear</span>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-[#F5F0E8] text-[#1A2E1C] group-hover:scale-105 transition-transform self-end mt-3">
              Shop Gear ↗
            </span>
          </a>

          <a
            href={apparelShopUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-3.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 transition-all flex flex-col justify-between group"
          >
            <div>
              <span className="text-xs font-bold text-[#C9A96E] block">👕 Merch & Apparel</span>
              <span className="text-sm font-bold text-white">Tees, Hoodies & Hats</span>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-[#F5F0E8] text-[#1A2E1C] group-hover:scale-105 transition-transform self-end mt-3">
              Shop Merch ↗
            </span>
          </a>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 items-start">
        {/* Left Column: Code & QR Code */}
        <div className="space-y-6">
          {/* QR Code Sharing Card */}
          <QRCodeCard
            url={referralUrl}
            code={refCode}
            title="Scan to Refer & Earn $100 Credit"
          />

          {/* Referral Code Box */}
          <div className="bg-[#FBF7EF] p-5 rounded-2xl shadow-xs border border-[#E5E5E5] space-y-3">
            <h2
              className="uppercase tracking-wide text-xl text-[#2D4A32]"
              style={{ fontFamily: "'Bebas Neue', sans-serif" }}
            >
              Your Referral Code
            </h2>
            <div className="flex items-center justify-between gap-4 bg-[#F5F0E8] p-4 rounded-xl border border-[#C9A96E]/40">
              <span className="text-2xl font-mono text-[#1A1A1A] font-bold tracking-wider">
                {refCode}
              </span>
              <CopyButton code={refCode} />
            </div>
          </div>

          {/* Referral Progress */}
          <div className="bg-[#FBF7EF] p-5 rounded-2xl shadow-xs border border-[#E5E5E5] space-y-3">
            <h2
              className="uppercase tracking-wide text-xl text-[#2D4A32]"
              style={{ fontFamily: "'Bebas Neue', sans-serif" }}
            >
              Referral Reward Progress
            </h2>
            {hasReachedGoal && (
              <div className="p-3 rounded-lg bg-[#DCFCE7] border border-[#86EFAC] text-[#15803D] text-xs font-bold">
                🎉 Congratulations! You have earned $100 credit. Keep sharing for more!
              </div>
            )}
            <p className="text-xs text-[#4A4A4A] font-semibold">
              {progressCount}/2 referrals toward your next $100 credit
            </p>
            <div className="h-3.5 bg-[#F5F0E8] rounded-full overflow-hidden border border-[#E5E5E5]">
              <div 
                className="h-full bg-[#2D4A32] transition-all duration-500 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Right Column: How it Works & Credits */}
        <div className="space-y-6">
          {/* How It Works Explainer */}
          <div className="bg-[#FBF7EF] p-5 rounded-2xl shadow-xs border border-[#E5E5E5] space-y-3">
            <h2
              className="uppercase tracking-wide text-xl text-[#2D4A32]"
              style={{ fontFamily: "'Bebas Neue', sans-serif" }}
            >
              How It Works
            </h2>
            <div className="space-y-3 text-xs text-[#4A4A4A]">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#2D4A32] text-white flex items-center justify-center font-bold text-[11px] flex-shrink-0">
                  1
                </span>
                <p>
                  <strong>Share your QR code or link</strong> with friends, family, or fellow trail riders.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#2D4A32] text-white flex items-center justify-center font-bold text-[11px] flex-shrink-0">
                  2
                </span>
                <p>
                  <strong>Friend makes an e-bike or service purchase</strong> with Cruise the Creek.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#2D4A32] text-white flex items-center justify-center font-bold text-[11px] flex-shrink-0">
                  3
                </span>
                <p>
                  <strong>Every 2 referrals = $100 Credit</strong> credited directly to your account for accessories, bike purchases, or merch!
                </p>
              </div>
            </div>
          </div>

          {/* Credits Ledger */}
          <div className="bg-[#FBF7EF] p-5 rounded-2xl shadow-xs border border-[#E5E5E5] space-y-4">
            <div className="flex justify-between items-center">
              <h2
                className="uppercase tracking-wide text-xl text-[#2D4A32]"
                style={{ fontFamily: "'Bebas Neue', sans-serif" }}
              >
                Your Credit Balance
              </h2>
              <span className="text-lg font-bold bg-[#DCFCE7] text-[#15803D] px-3 py-0.5 rounded-lg border border-[#86EFAC]">
                ${totalBalance.toFixed(2)}
              </span>
            </div>
            
            {credits && credits.length > 0 ? (
              <div className="space-y-2">
                {credits.map((credit: any) => (
                  <div key={credit.id} className="p-3 bg-white rounded-xl border border-[#E5E5E5] text-xs flex justify-between items-start">
                    <div>
                      <span className="font-bold text-sm text-[#1A1A1A]">${Number(credit.amount).toFixed(2)}</span>
                      <p className="text-gray-500">{credit.reason || 'Referral reward'}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${!credit.redeemed ? 'bg-[#DCFCE7] text-[#15803D]' : 'bg-gray-100 text-gray-500'}`}>
                      {!credit.redeemed ? 'Available ✅' : 'Redeemed'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500 italic">No credits earned yet. Share your QR code above!</p>
            )}
          </div>

          {/* Referrals List */}
          <div className="bg-[#FBF7EF] p-5 rounded-2xl shadow-xs border border-[#E5E5E5] space-y-3">
            <h2
              className="uppercase tracking-wide text-xl text-[#2D4A32]"
              style={{ fontFamily: "'Bebas Neue', sans-serif" }}
            >
              Your Referred Friends ({referralCount})
            </h2>
            {referredUsers && referredUsers.length > 0 ? (
              <div className="space-y-1.5">
                {referredUsers.map((u: any, index: number) => (
                  <div key={index} className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-[#E5E5E5] text-xs">
                    <span className="font-semibold text-[#1A1A1A]">
                      👤 {u.first_name} {u.last_name ? `${u.last_name[0]}.` : ''}
                    </span>
                    <span className="text-gray-400 text-[11px]">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'Joined'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No referrals yet" description="Friends who use your code will appear here." />
            )}
          </div>
        </div>
      </div>

      {/* Google Review Banner */}
      <GoogleReviewCard />
    </div>
  )
}
