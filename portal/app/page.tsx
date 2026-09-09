import Link from 'next/link'

export default function HomePage() {
  return (
    <main style={{ backgroundColor: '#F5F0E8' }} className="min-h-screen">
      {/* Hero */}
      <section
        className="relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #2D4A32 0%, #1A2E1C 100%)' }}
      >
        <div className="max-w-5xl mx-auto px-6 py-20 sm:py-28 text-center relative z-10">
          <p
            className="text-sm tracking-widest uppercase mb-3"
            style={{ color: '#C9A96E', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.15em' }}
          >
            Cruise the Creek Adventures
          </p>
          <h1
            className="text-5xl sm:text-7xl font-bold tracking-wide text-white mb-4"
            style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.04em' }}
          >
            Your Adventure,{' '}
            <span style={{ color: '#C9A96E' }}>Electrified</span>
          </h1>
          <p className="text-lg sm:text-xl max-w-2xl mx-auto mb-8" style={{ color: 'rgba(255,255,255,0.8)' }}>
            Get outside. Explore more. Slow down. Reconnect.
            <br className="hidden sm:block" />
            Your customer portal for bikes, invoices, service, and more.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/auth"
              className="px-8 py-3 rounded-lg font-bold text-lg transition-colors"
              style={{ backgroundColor: '#C9A96E', color: '#1A2E1C' }}
            >
              Sign In to Your Portal
            </Link>
            <Link
              href="/auth"
              className="px-8 py-3 rounded-lg font-semibold text-lg border-2 transition-colors"
              style={{ borderColor: 'rgba(255,255,255,0.3)', color: 'rgba(255,255,255,0.9)' }}
            >
              Create Account
            </Link>
          </div>
        </div>
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-5" style={{ background: '#6B8F71', filter: 'blur(100px)' }} />
        <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full opacity-5" style={{ background: '#C9A96E', filter: 'blur(80px)' }} />
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2
          className="text-center text-3xl font-bold mb-2 tracking-wide"
          style={{ fontFamily: "'Bebas Neue', sans-serif", color: '#2D4A32', letterSpacing: '0.04em' }}
        >
          Everything In One Place
        </h2>
        <p className="text-center mb-12" style={{ color: '#4A4A4A' }}>
          Manage your e-bike experience from the trail to the shop
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { icon: '🚲', title: 'My Bikes', desc: 'Register your rides, track warranties, and keep everything in one spot.' },
            { icon: '🧾', title: 'Invoices', desc: 'View purchase history, check balances, and stay on top of payments.' },
            { icon: '🔧', title: 'Creek Ready Service', desc: '$125 comprehensive tune-up — deep clean, diagnostics, test ride on the trail.' },
            { icon: '🎁', title: 'Referral Program', desc: 'Share your code with friends. Every 2 referrals = $100 toward tune-ups, accessories, or your next bike!' },
            { icon: '🎫', title: 'Support', desc: 'Open service tickets, ask questions, or schedule an upgrade — we\'re here for you.' },
          ].map((feat) => (
            <div key={feat.title} className="card group hover:shadow-md transition-shadow">
              <span className="text-3xl block mb-3">{feat.icon}</span>
              <h3 className="font-bold mb-1" style={{ color: '#2D4A32' }}>{feat.title}</h3>
              <p className="text-sm" style={{ color: '#4A4A4A' }}>{feat.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 text-center" style={{ backgroundColor: '#2D4A32' }}>
        <p
          className="text-2xl font-bold tracking-wide text-white mb-2"
          style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.04em' }}
        >
          Power Your Path
        </p>
        <p className="mb-6" style={{ color: 'rgba(255,255,255,0.7)' }}>
          A lemonade stand for Mill Creek Park — served on two wheels 🍋
        </p>
        <Link
          href="/auth"
          className="inline-block px-8 py-3 rounded-lg font-bold transition-colors"
          style={{ backgroundColor: '#C9A96E', color: '#1A2E1C' }}
        >
          Get Started
        </Link>
      </section>

      {/* Footer */}
      <footer className="py-6 text-center" style={{ backgroundColor: '#1A2E1C' }}>
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
          © {new Date().getFullYear()} Cruise the Creek Adventures · Youngstown, OH
        </p>
      </footer>
    </main>
  )
}
