import Link from 'next/link'

const SITE = 'https://www.cruisethecreek.com'

// Next steps for someone who rides their own bike and has had it serviced
// here. All are existing pages; this card only points to them.
const TILES = [
  { icon: '🛠️', title: 'Book a Tune-Up', blurb: 'Keep it running smooth between rides.', href: `${SITE}/tune-ups.html` },
  { icon: '📋', title: 'Start a Repair', blurb: 'Tell us what is wrong and drop it off.', href: `${SITE}/repair-intake.html` },
  { icon: '🌲', title: 'Creek Ready Plan', blurb: 'Yearly care for your bike at a set price.', href: `${SITE}/creek-ready.html` },
  { icon: '🚲', title: 'Test Ride an Upgrade', blurb: 'Curious what a new e-bike feels like?', href: `${SITE}/test-ride.html` },
]

type ServiceLine = { description: string; date: string | null; invoice: string | null }

function shortDate(d: string | null): string {
  if (!d) return ''
  const t = new Date(d)
  if (Number.isNaN(t.getTime())) return ''
  return t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })
}

/**
 * Dashboard card for customers whose own bike the shop has worked on, but
 * whose bike is not on their account: their service history and the ways to
 * book the next visit. Once a bike is on file they get the full bike view.
 */
export function BikeCare({ history }: { history: ServiceLine[] }) {
  return (
    <div id="bike-care" className="bg-white rounded-2xl p-5 sm:p-6 border border-[#E5E5E5] shadow-xs space-y-4">
      <div>
        <h2
          className="text-xl font-bold uppercase text-[#1A2E1C]"
          style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.04em' }}
        >
          🔧 Your Bike Care
        </h2>
        <p className="text-sm text-[#4A4A4A] mt-1">
          Thanks for trusting us with your ride. Here&apos;s what we&apos;ve done and how to book the next visit.
        </p>
      </div>

      {history.length > 0 && (
        <ul className="divide-y divide-[#E5E5E5] rounded-xl bg-[#F5F0E8] border border-[#E5E5E5]">
          {history.slice(0, 5).map((s, i) => (
            <li key={`${s.invoice}-${i}`} className="flex justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="font-semibold text-[#1A2E1C]">{s.description}</span>
              <span className="text-xs text-[#4A4A4A] whitespace-nowrap">
                {shortDate(s.date)}{s.invoice ? ` · ${s.invoice}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

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
          <h3 className="font-bold text-sm text-[#1A2E1C] mt-1">Add My Bike</h3>
          <p className="text-xs text-[#4A4A4A] mt-0.5">Send us the make and model and we&apos;ll put it on your account.</p>
        </Link>
      </div>
    </div>
  )
}
