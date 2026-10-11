import { progressSteps, repairStageInfo } from '@/lib/repair-stages'
import { shopTime } from '@/app/components/ticket-thread'

export type RepairEvent = {
  ticket_id: string
  stage: string
  note: string | null
  created_at: string
}

/** Group stage history rows by ticket id, keeping their order. */
export function eventsByTicket(rows: RepairEvent[] | null | undefined): Map<string, RepairEvent[]> {
  const map = new Map<string, RepairEvent[]>()
  for (const r of rows || []) {
    const list = map.get(r.ticket_id) || []
    list.push(r)
    map.set(r.ticket_id, list)
  }
  return map
}

/**
 * Where the customer's bike is in the shop: a step bar (Checked in →
 * Diagnosing → … → Ready for pickup), what the current step means, the
 * shop's latest note, and when each step happened. Used on the dashboard
 * and on each repair ticket on the Support page.
 */
export function RepairProgress({
  stage,
  events,
  bike,
  compact = false,
}: {
  stage: string
  events: RepairEvent[]
  bike?: string
  compact?: boolean
}) {
  const info = repairStageInfo(stage)
  if (!info) return null
  const steps = progressSteps(stage, events.map((e) => e.stage))
  const when = new Map<string, string>()
  for (const e of events) when.set(e.stage, e.created_at)
  const latestNote = [...events].reverse().find((e) => e.note)?.note
  const ready = stage === 'ready'

  return (
    <div
      className={`rounded-xl border space-y-3 ${compact ? 'p-3' : 'p-4 sm:p-5'} ${
        ready ? 'bg-[#E8F3EA] border-[#6B8F71]' : 'bg-white border-[#E8DCC4]'
      }`}
    >
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-[#6B8F71]">
          🔧 {bike ? `Your ${bike}` : 'Your bike'} · in the shop
        </p>
        <p
          className="text-2xl text-[#1A2E1C]"
          style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.03em' }}
        >
          {info.label}
        </p>
        <p className="text-sm text-[#4A4A4A]">{info.blurb}</p>
      </div>

      <ol className="flex items-start" aria-label="Repair progress">
        {steps.map((s, i) => (
          <li key={s.key} className="flex-1 min-w-0 flex flex-col items-center text-center relative">
            {i > 0 && (
              <span
                aria-hidden="true"
                className={`absolute top-[11px] right-1/2 w-full h-[3px] ${
                  s.state === 'todo' ? 'bg-[#E5E5E5]' : 'bg-[#2D4A32]'
                }`}
              />
            )}
            <span
              className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold border-2 ${
                s.state === 'done'
                  ? 'bg-[#2D4A32] border-[#2D4A32] text-white'
                  : s.state === 'current'
                    ? 'bg-[#C9A96E] border-[#2D4A32] text-[#1A2E1C] ring-4 ring-[#C9A96E]/30'
                    : 'bg-white border-[#D6D6D6] text-gray-400'
              }`}
            >
              {s.state === 'done' ? '✓' : i + 1}
            </span>
            <span
              className={`mt-1.5 text-[11px] leading-tight px-0.5 ${
                s.state === 'todo' ? 'text-gray-400' : 'text-[#1A2E1C] font-bold'
              }`}
            >
              <span className="sm:hidden">{s.short}</span>
              <span className="hidden sm:inline">{s.label}</span>
            </span>
            {!compact && when.get(s.key) && (
              <span className="hidden sm:block text-[10px] text-gray-500">{shopTime(when.get(s.key)!)}</span>
            )}
          </li>
        ))}
      </ol>

      {latestNote && (
        <p className="text-sm text-[#1A2E1C] bg-[#F5F0E8] rounded-lg px-3 py-2">
          <span className="font-bold">From the shop:</span> {latestNote}
        </p>
      )}
      {ready && (
        <p className="text-sm text-[#1A2E1C]">
          Questions before you come in? Call or text <a href="tel:+13304069681" className="font-bold underline">330-406-9681</a>.
        </p>
      )}
    </div>
  )
}
