'use client'

import { useState, useTransition } from 'react'
import { setRepairStage } from './actions'
import { REPAIR_STAGES } from '@/lib/repair-stages'

/**
 * Staff move a bike through the shop one tap at a time. Each tap saves the
 * stage, adds it to the customer's progress bar and emails them. The
 * optional note rides along in that email and on their bar.
 */
export function RepairStagePicker({ ticketId, stage }: { ticketId: string; stage: string | null }) {
  const [current, setCurrent] = useState(stage)
  const [note, setNote] = useState('')
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()

  const move = (next: string) =>
    startTransition(async () => {
      const res = await setRepairStage(ticketId, next, note)
      setMessage(res.message)
      if (res.ok) {
        setCurrent(next)
        setNote('')
      }
    })

  if (!current) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => move('checked_in')}
          className="text-sm font-bold px-3 py-1.5 rounded-lg border border-[#2D4A32] text-[#2D4A32] bg-white disabled:opacity-40"
        >
          {pending ? 'Saving…' : '🔧 Bike is in the shop: start repair tracker'}
        </button>
        {message && <span className="text-xs text-[#4A4A4A]">{message}</span>}
      </div>
    )
  }

  return (
    <div className="p-3 rounded-lg bg-[#F5F0E8] border border-[#E8DCC4] space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-wider text-[#2D4A32]">🔧 Repair tracker</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Repair stage">
        {REPAIR_STAGES.map((s) => {
          const on = s.key === current
          return (
            <button
              key={s.key}
              type="button"
              disabled={pending || on}
              onClick={() => move(s.key)}
              aria-pressed={on}
              className={`text-xs font-bold px-2.5 py-1.5 rounded-full border ${
                on
                  ? 'bg-[#2D4A32] border-[#2D4A32] text-white'
                  : 'bg-white border-[#C9A96E] text-[#1A2E1C] hover:bg-[#FAF8F2] disabled:opacity-40'
              }`}
            >
              {s.label}
            </button>
          )
        })}
      </div>
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        placeholder="Optional note for the customer with the next tap, e.g. Brake pads ordered, due Thursday"
        className="w-full text-sm border border-[#E8DCC4] rounded-lg px-2 py-1.5 bg-white"
        aria-label="Note for the customer"
      />
      {message && <p className="text-xs text-[#4A4A4A]">{pending ? 'Saving…' : message}</p>}
    </div>
  )
}
