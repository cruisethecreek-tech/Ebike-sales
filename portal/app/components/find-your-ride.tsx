import Link from 'next/link'

const SITE = 'https://www.cruisethecreek.com'

// Where a rider without a bike on file goes next. Each tile is a page that
// already exists on the shop site, so this card only points; it books nothing.
const TILES = [
  { icon: '🚲', title: 'Book a Test Ride', blurb: 'Try any bike on the Mill Creek trails before you decide.', href: `${SITE}/test-ride.html` },
  { icon: '🗓️', title: 'Rent for the Day', blurb: 'Grab a bike for an afternoon in the park.', href: `${SITE}/rentals.html` },
  { icon: '💳', title: 'Rent to Own', blurb: 'Ride now and pay over time, no big upfront cost.', href: `${SITE}/rent-to-own.html` },
  { icon: '🗺️', title: 'Adventure Map', blurb: 'Trails, stops and your Creek Score.', href: 'https://adventure-map.pages.dev/v2' },
  { icon: '🎉', title: 'Rides & Events', blurb: 'Group rides and meetups you can join.', href: `${SITE}/events.html` },
]

/**
 * Dashboard card for customers with no bike on their account yet: someone who
 * bought a helmet, gear or a gift card. They are the shop's likeliest next
 * bike buyers, so instead of an empty bikes section they get a way in. Once an
 * invoice adds a bike, the dashboard shows the bike view and this goes away.
 */
export function FindYourRide({ referralCode }: { referralCode?: string | null }) {
  return (
    <div id="find-your-ride" className="bg-white rounded-2xl p-5 sm:p-6 border border-[#E5E5E5] shadow-xs space-y-4">
      <div>
        <h2
          className="text-xl font-bold uppercase text-[#1A2E1C]"
          style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.04em' }}
        >
          🌲 Find Your Ride
        </h2>
        <p className="text-sm text-[#4A4A4A] mt-1">
          Thanks for shopping with us. When you&apos;re ready for wheels, start here.
          {referralCode && (
            <> Your referral code <strong className="font-mono">{referralCode}</strong> also earns you credit toward a bike.</>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {TILES.map((t) => (
          <a
            key={t.title}
            href={t.href}
            target="_blank"
            rel="noopener"
            className="block p-4 rounded-xl bg-[#F5F0E8] border border-[#E5E5E5] hover:border-[#2D4A32] transition-colors"
          >
            <span className="text-2xl">{t.icon}</span>
            <h3 className="font-bold text-sm text-[#1A2E1C] mt-1">{t.title}</h3>
            <p className="text-xs text-[#4A4A4A] mt-0.5">{t.blurb}</p>
          </a>
        ))}
        <Link
          href="/support"
          className="block p-4 rounded-xl bg-[#F5F0E8] border border-[#E5E5E5] hover:border-[#2D4A32] transition-colors"
        >
          <span className="text-2xl">💬</span>
          <h3 className="font-bold text-sm text-[#1A2E1C] mt-1">Ask Pat &amp; Dru</h3>
          <p className="text-xs text-[#4A4A4A] mt-0.5">Not sure which bike fits you? Send us a question.</p>
        </Link>
      </div>
    </div>
  )
}
