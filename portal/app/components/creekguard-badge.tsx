import { STORE_URL } from '@/lib/constants'

/**
 * "CreekGuard Protected": shown on the portal for customers whose bike has
 * an active GPS tracker. `compact` is the small chip for bike cards.
 */
export function CreekGuardBadge({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <span
        title="CreekGuard GPS tracking and theft alerts are active on this bike"
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#1A2E1C] text-[#C9A96E] text-[11px] font-bold uppercase tracking-wider border border-[#C9A96E]/60"
      >
        <ShieldIcon className="w-3 h-3" />
        CreekGuard
      </span>
    )
  }
  return (
    <span
      title="GPS tracking and theft alerts are active on your bike"
      className="inline-flex items-center gap-2 pl-2.5 pr-3.5 py-1 rounded-full bg-gradient-to-r from-[#1A2E1C] to-[#2D4A32] text-white shadow-sm border border-[#C9A96E]/70"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/creekguard-badge.png" alt="" width={26} height={32} className="w-[26px] h-8 object-contain" />
      <span className="leading-tight">
        <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-[#C9A96E]">CreekGuard</span>
        <span className="block text-xs font-semibold">Protected</span>
      </span>
    </span>
  )
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

const SIGN_UP_URL = `${STORE_URL.replace(/\/$/, '')}/creekguard.html`

/**
 * The sign-up badge: shown instead of "CreekGuard Protected" to customers
 * with no tracker yet. Links to the CreekGuard page on the storefront.
 */
export function CreekGuardSignUp() {
  return (
    <a
      href={SIGN_UP_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-4 p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-[#1A2E1C] to-[#2D4A32] text-white border border-[#C9A96E]/60 shadow-sm hover:border-[#C9A96E] transition-colors"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/creekguard-badge.png" alt="" width={48} height={59} className="w-12 h-[59px] shrink-0 object-contain opacity-90 group-hover:opacity-100" />
      <span className="flex-1 min-w-0">
        <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-[#C9A96E]">New · CreekGuard GPS</span>
        <span className="block font-bold text-base sm:text-lg leading-snug">Protect your ride with CreekGuard</span>
        <span className="block text-xs text-[#d9d4c7] mt-0.5">
          Hidden GPS tracker, theft alerts and your bike&apos;s location right here in your portal. $149 install for Cruise the Creek customers, then $5.99/month.
        </span>
      </span>
      <span className="shrink-0 px-3 py-2 rounded-lg bg-[#C9A96E] text-[#1A2E1C] text-xs font-bold group-hover:bg-[#d8b97f]">
        Sign up ↗
      </span>
    </a>
  )
}

/** Small "Add CreekGuard" link for a bike card with no tracker. */
export function CreekGuardAddChip() {
  return (
    <a
      href={SIGN_UP_URL}
      target="_blank"
      rel="noopener noreferrer"
      title="Add CreekGuard GPS tracking and theft alerts to this bike"
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-dashed border-[#a98843] text-[#7a5f2a] bg-[#FBF7EF] text-[11px] font-bold uppercase tracking-wider hover:bg-[#F5EBD6]"
    >
      <ShieldIcon className="w-3 h-3" />
      Add CreekGuard
    </a>
  )
}
