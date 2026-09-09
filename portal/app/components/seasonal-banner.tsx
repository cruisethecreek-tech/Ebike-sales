'use client'

import { useState } from 'react'
import { useSeasonalTheme, SeasonKey } from '@/app/components/seasonal-theme-provider'

export function SeasonalBanner() {
  const { seasonKey, season, setSeason, isCustom, allSeasons } = useSeasonalTheme()
  const [trayOpen, setTrayOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  function handleSelectSeason(key: SeasonKey | 'auto') {
    setSeason(key)
    setTrayOpen(false)
  }

  return (
    <div
      className="relative mb-6 rounded-2xl p-4 sm:p-5 text-white shadow-md border transition-all duration-300"
      style={{
        background: season.bgGradient,
        borderColor: `${season.accentColor}80`,
      }}
    >
      {/* ── Main Banner Content ── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className="text-3xl flex-shrink-0 mt-0.5 select-none animate-pulse">
            {season.icon}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider shadow-xs"
                style={{ backgroundColor: season.badgeColor, color: '#1A2E1C' }}
              >
                {season.name} · {season.tag}
              </span>
              {isCustom && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/20 text-[#F5F0E8] font-mono">
                  Custom
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm font-medium mt-1.5 leading-snug" style={{ color: season.textColor }}>
              {season.greeting}
            </p>
          </div>
        </div>

        {/* ── Controls: Theme Switcher Toggle & Close ── */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={() => setTrayOpen(!trayOpen)}
            className={`text-xs px-3 py-1.5 rounded-xl font-bold border transition-all flex items-center gap-1.5 shadow-xs ${
              trayOpen
                ? 'bg-white text-[#1A2E1C] border-white'
                : 'bg-white/20 hover:bg-white/30 text-white border-white/30'
            }`}
            title="Switch Season / Holiday Theme"
          >
            <span>{season.icon} Theme</span>
            <span className="text-[10px] transition-transform duration-200" style={{ transform: trayOpen ? 'rotate(180deg)' : 'none' }}>
              ▾
            </span>
          </button>

          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-gray-300 hover:text-white p-1 text-sm font-bold leading-none rounded-lg hover:bg-white/10"
            aria-label="Dismiss seasonal banner"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── Expandable Theme Picker Tray (Zero Clipping, 100% Mobile Friendly) ── */}
      {trayOpen && (
        <div className="mt-4 pt-4 border-t border-white/20 space-y-2 animate-fadeIn">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold uppercase tracking-wider text-[11px]" style={{ color: season.accentColor }}>
              🎨 Transform Entire Portal Page Theme:
            </span>
            <button
              type="button"
              onClick={() => handleSelectSeason('auto')}
              className="text-[11px] text-gray-300 hover:text-white underline"
            >
              Reset to Auto
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {allSeasons.map((s) => {
              const isSelected = seasonKey === s.key
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => handleSelectSeason(s.key)}
                  className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2 ${
                    isSelected
                      ? 'bg-white text-[#1A2E1C] font-bold shadow-sm'
                      : 'bg-black/25 hover:bg-black/40 text-white border-white/20'
                  }`}
                  style={{
                    borderColor: isSelected ? s.accentColor : undefined,
                  }}
                >
                  <span className="text-xl">{s.icon}</span>
                  <div>
                    <span className="block font-bold leading-tight">{s.name}</span>
                    <span className="text-[10px] opacity-75">{s.tag}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
