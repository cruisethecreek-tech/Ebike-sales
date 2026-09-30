import Link from 'next/link'
import { STORE_URL } from '@/lib/constants'
import { breakInOffer, BREAK_IN_WINDOW_DAYS } from '@/lib/break-in-tuneup'

/**
 * "Your free break-in tune-up — 12 days left."
 *
 * Renders nothing at all when there is no offer to make: no bikes, no purchase
 * date on record, or the window already run out. Nothing announces its own
 * absence, and an expired countdown that sticks around to say EXPIRED is worse
 * than one that was never there.
 */
export function BreakInCountdown({
  bikes,
  firstName,
  lastName,
  phone,
  email,
}: {
  bikes: { brand?: string | null; model?: string | null; purchase_date?: string | null }[]
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
  email?: string | null
}) {
  const offer = breakInOffer(bikes)
  if (!offer) return null

  // promo=BREAKIN is what the intake form reads to price this at zero. Sending
  // someone to a booking page that quotes them $125 for something the shop just
  // told them is free would be worse than not offering it.
  const book =
    `${STORE_URL}/repair-intake.html?service=tuneup&promo=BREAKIN` +
    `&firstName=${encodeURIComponent(firstName || '')}` +
    `&lastName=${encodeURIComponent(lastName || '')}` +
    `&phone=${encodeURIComponent(phone || '')}` +
    `&email=${encodeURIComponent(email || '')}` +
    `&brand=${encodeURIComponent(offer.brand)}` +
    `&model=${encodeURIComponent(offer.model)}`

  const bikeName = [offer.brand, offer.model].filter(Boolean).join(' ')

  return (
    <div className="rounded-2xl border-2 border-[#C9A96E] bg-[#FAF3E4] p-4 sm:p-5 mb-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#8A6D1F]">
            🌲 Cruise the Creek Care
          </p>
          <h2
            className="text-2xl sm:text-3xl text-[#1A2E1C] mt-0.5"
            style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.03em' }}
          >
            Your free 30-day break-in tune-up
          </h2>
          <p className="text-sm text-[#4A4A4A] mt-1">
            {bikeName ? <>New bikes settle in. Spokes seat, cables stretch, brakes bed in — we
            put your {bikeName} right, free of charge.</> : <>New bikes settle in. Spokes seat,
            cables stretch, brakes bed in — we put yours right, free of charge.</>}
          </p>
        </div>

        {/* The number is the point, so it is the biggest thing here. */}
        <div className="text-center shrink-0">
          <div
            className="text-4xl sm:text-5xl font-bold leading-none text-[#8A6D1F]"
            style={{ fontFamily: "'Bebas Neue', sans-serif" }}
          >
            {offer.daysLeft}
          </div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#8A6D1F]">
            {offer.lastDay ? 'day left' : 'days left'}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link
          href={book}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 rounded-lg bg-[#2D4A32] text-white text-sm font-bold hover:bg-[#1A2E1C]"
        >
          {offer.lastDay ? 'Book it today →' : 'Book your free tune-up →'}
        </Link>
        <p className="text-[11px] text-[#4A4A4A]">
          {offer.lastDay
            ? 'Today is the last day to claim it.'
            : `Claim by ${offer.deadline.toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
              })}.`}{' '}
          {/* Said out loud, because a customer whose bike was shipped has every
              reason to think the clock started before the box arrived. */}
          You get {BREAK_IN_WINDOW_DAYS} days from purchase, which allows for shipping.
        </p>
      </div>
    </div>
  )
}
