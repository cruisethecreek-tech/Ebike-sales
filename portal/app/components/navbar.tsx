'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { signOut } from '@/app/auth/actions'
import { useSeasonalTheme, SeasonKey } from '@/app/components/seasonal-theme-provider'

export function Navbar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const { seasonKey, season, setSeason, isCustom, allSeasons } = useSeasonalTheme()

  const links = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/dashboard/bikes', label: 'My Bikes' },
    { href: '/dashboard/invoices', label: 'Invoices' },
    { href: '/dashboard/referrals', label: 'Referrals' },
    { href: '/support', label: 'Support' },
  ]

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setThemeDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <nav className="seasonal-navbar shadow-lg relative z-30 transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-2 group">
              <span
                className="text-xl font-bold text-white tracking-wide"
                style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.06em', fontSize: '1.4rem' }}
              >
                Cruise the Creek
              </span>
              <span
                className="text-xs sm:text-sm hidden sm:inline"
                style={{ color: season.accentColor, fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}
              >
                · Creek Ready Customer Portal
              </span>
            </Link>
          </div>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {links.map((link) => {
              const isActive = pathname === link.href || (link.href !== '/dashboard' && pathname.startsWith(link.href))
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="px-3 py-2 rounded-md text-sm font-medium transition-colors"
                  style={{
                    color: isActive ? season.accentColor : 'rgba(255,255,255,0.85)',
                    backgroundColor: isActive ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                    fontWeight: isActive ? 600 : 500,
                  }}
                >
                  {link.label}
                </Link>
              )
            })}

            {/* ── Desktop Theme Switcher Button & Dropdown ── */}
            <div className="relative ml-2" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setThemeDropdownOpen(!themeDropdownOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all shadow-xs border"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  borderColor: 'rgba(255,255,255,0.25)',
                }}
                title="Change Holiday / Seasonal Theme"
              >
                <span className="text-base leading-none">{season.icon}</span>
                <span>{season.name}</span>
                <span
                  className="text-[10px] transition-transform duration-200"
                  style={{ transform: themeDropdownOpen ? 'rotate(180deg)' : 'none' }}
                >
                  ▾
                </span>
              </button>

              {themeDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-[#1A2E1C] border border-white/20 rounded-xl shadow-2xl p-2 z-50 animate-fadeIn space-y-1">
                  <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-gray-300 border-b border-white/10 flex justify-between items-center">
                    <span>🎨 Seasonal Theme</span>
                    {isCustom && (
                      <button
                        type="button"
                        onClick={() => {
                          setSeason('auto')
                          setThemeDropdownOpen(false)
                        }}
                        className="text-[10px] text-[#C9A96E] hover:underline"
                      >
                        Reset Auto
                      </button>
                    )}
                  </div>

                  {allSeasons.map((s) => {
                    const isSelected = seasonKey === s.key
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => {
                          setSeason(s.key as SeasonKey)
                          setThemeDropdownOpen(false)
                        }}
                        className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center justify-between transition-colors ${
                          isSelected
                            ? 'bg-white/20 text-white font-bold'
                            : 'text-gray-200 hover:bg-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-base">{s.icon}</span>
                          <div>
                            <span className="block leading-tight">{s.name}</span>
                            <span className="text-[10px] opacity-75">{s.tag}</span>
                          </div>
                        </div>
                        {isSelected && <span className="text-xs text-[#C9A96E]">✓</span>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Sign Out */}
            <form action={signOut} className="ml-1">
              <button
                type="submit"
                className="px-2.5 py-2 rounded-md text-xs font-medium transition-colors text-white/60 hover:text-white"
              >
                Sign Out
              </button>
            </form>
          </div>

          {/* Mobile hamburger */}
          <div className="md:hidden flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const nextSeasonKeys: SeasonKey[] = ['autumn', 'winter', 'spring', 'summer']
                const nextIdx = (nextSeasonKeys.indexOf(seasonKey) + 1) % nextSeasonKeys.length
                setSeason(nextSeasonKeys[nextIdx])
              }}
              className="text-xs px-2.5 py-1 rounded bg-white/20 text-white flex items-center gap-1 font-bold"
              title="Tap to cycle theme"
            >
              <span>{season.icon}</span>
              <span className="text-[11px]">{season.name.split(' ')[0]}</span>
            </button>

            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="text-white p-2"
              aria-label="Toggle menu"
            >
              {mobileOpen ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-white/10 bg-black/40 backdrop-blur-md">
          <div className="px-4 py-3 space-y-1">
            {links.map((link) => {
              const isActive = pathname === link.href || (link.href !== '/dashboard' && pathname.startsWith(link.href))
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="block px-3 py-2 rounded-md text-sm font-medium"
                  style={{
                    color: isActive ? season.accentColor : 'rgba(255,255,255,0.85)',
                    backgroundColor: isActive ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                    fontWeight: isActive ? 600 : 500,
                  }}
                >
                  {link.label}
                </Link>
              )
            })}

            {/* Mobile Seasonal Theme Picker */}
            <div className="pt-2 pb-1 border-t border-white/10">
              <p className="text-[11px] uppercase tracking-wider font-bold text-gray-300 px-3 mb-2">
                🎨 Seasonal Holiday Theme:
              </p>
              <div className="grid grid-cols-2 gap-1.5 px-3">
                {allSeasons.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => {
                      setSeason(s.key as SeasonKey)
                      setMobileOpen(false)
                    }}
                    className={`px-2 py-1.5 rounded-lg text-xs flex items-center gap-1.5 ${
                      seasonKey === s.key
                        ? 'bg-white/30 text-white font-bold'
                        : 'bg-black/20 text-gray-200'
                    }`}
                  >
                    <span>{s.icon}</span>
                    <span>{s.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <form action={signOut} className="pt-2">
              <button
                type="submit"
                className="block w-full text-left px-3 py-2 rounded-md text-sm font-medium text-white/60 hover:text-white"
              >
                Sign Out
              </button>
            </form>
          </div>
        </div>
      )}
    </nav>
  )
}
