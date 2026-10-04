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
