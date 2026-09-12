'use client'

import { useSeasonalTheme } from '@/app/components/seasonal-theme-provider'

/**
 * Creek Ready Tune-Up card.
 *
 * A client component purely so it can read the seasonal theme — the support
 * page itself is a server component and cannot use the hook. Previously this
 * markup lived inline there with the forest palette hardcoded, so the card
 * stayed the same in every season while the banner and navbar around it
 * changed. Colours now come from the active season.
 */
export function TuneUpCard({ bookHref, policyHref }: { bookHref: string; policyHref: string }) {
  const { season } = useSeasonalTheme()

  return (
    <div
      className="p-5 rounded-2xl shadow-sm space-y-3 border"
      style={{
        background: season.bgGradient,
        color: season.textColor,
        borderColor: season.accentColor + '55',
      }}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider"
          style={{ background: season.accentColor, color: '#1A2E1C' }}
        >
          Signature Service · Member Benefit
        </span>
        <div className="text-right">
          <span className="text-xs line-through mr-1.5" style={{ opacity: 0.7 }}>$125</span>
          <span className="text-xl font-bold" style={{ color: season.accentColor }}>$100.00</span>
          <span className="block text-[10px] font-bold" style={{ color: season.accentColor, opacity: 0.9 }}>
            20% OFF APPLIED
          </span>
        </div>
      </div>

      <h3
        className="uppercase tracking-wide text-2xl"
        style={{ fontFamily: "'Bebas Neue', sans-serif", color: season.textColor }}
      >
        {season.icon} Creek Ready Tune-Up
      </h3>

      <ul className="text-xs space-y-1.5" style={{ opacity: 0.85 }}>
        <li>✓ Complete 28-point safety &amp; electrical check</li>
        <li>✓ Hydraulic brake flush &amp; lever adjustment</li>
        <li>✓ Drivetrain clean &amp; electronic shifting tune</li>
        <li>✓ Motor diagnostics &amp; firmware updates</li>
        <li>✓ Battery health check &amp; tire optimization</li>
      </ul>

      <div className="space-y-2 pt-1">
        <a
          href={bookHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs w-full block text-center py-2.5 font-bold rounded-lg shadow-xs hover:scale-[1.01] transition-transform"
          style={{ background: season.accentColor, color: '#1A2E1C' }}
        >
          ⚡ Book Creek Ready Tune-Up ($100.00) ↗
        </a>
        <a
          href={policyHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-center block hover:underline"
          style={{ color: season.accentColor }}
        >
          View Full Creek Ready Policy ↗
        </a>
      </div>
    </div>
  )
}
