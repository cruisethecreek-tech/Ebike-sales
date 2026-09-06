'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSeasonalTheme } from '@/app/components/seasonal-theme-provider'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/dashboard/bikes', label: 'My Bikes', icon: '🚲' },
  { href: '/dashboard/invoices', label: 'Invoices', icon: '🧾' },
  { href: '/dashboard/referrals', label: 'Referrals', icon: '🎁' },
  { href: '/support', label: 'Support', icon: '🛠️' },
]

export function Sidebar() {
  const pathname = usePathname()
  const { season } = useSeasonalTheme()

  return (
    <aside
      className="seasonal-sidebar hidden lg:flex flex-col w-60 min-h-[calc(100vh-4rem)] py-6 px-3 transition-colors duration-300"
    >
      {/* Tagline & Season badge */}
      <div className="px-3 mb-6">
        <p
          className="text-xs tracking-widest uppercase"
          style={{ color: season.accentColor, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.1em' }}
        >
          Your Adventure
        </p>
        <p className="text-xs text-white/50 font-medium">
          Electrified ⚡
        </p>
        <div
          className="mt-2.5 px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1.5 border"
          style={{
            backgroundColor: 'rgba(255,255,255,0.06)',
            borderColor: 'rgba(255,255,255,0.12)',
            color: season.accentColor,
          }}
        >
          <span>{season.icon}</span>
          <span className="truncate">{season.name}</span>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 space-y-1.5">
        {navItems.map((item) => {
          const isActive =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={{
                color: isActive ? season.accentColor : 'rgba(255,255,255,0.75)',
                backgroundColor: isActive ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                borderLeft: isActive ? `4px solid ${season.accentColor}` : '4px solid transparent',
                fontWeight: isActive ? 600 : 500,
              }}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 pt-4 border-t border-white/10 space-y-1">
        <p className="text-xs font-semibold" style={{ color: season.accentColor }}>
          Cruise the Creek Adventures
        </p>
        <p className="text-[11px] text-white/40">
          Riders making lemonade 🍋
        </p>
        <p className="text-[10px] text-white/30 pt-1 leading-tight">
          Mill Creek MetroParks, OH
        </p>
      </div>
    </aside>
  )
}
