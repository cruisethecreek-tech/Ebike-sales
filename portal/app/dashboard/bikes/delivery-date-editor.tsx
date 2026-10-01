'use client'

import { useState, useTransition } from 'react'
import { setBikeDeliveredOn } from './look-actions'

/**
 * Staff-only: the day the customer received the bike. It starts the free
 * 30-day break-in tune-up window; without it the window is 40 days from
 * purchase to allow for shipping.
 */
export function DeliveryDateEditor({ bikeId, current }: { bikeId: string; current: string | null }) {
  const [saved, setSaved] = useState(current || '')
  const [value, setValue] = useState(current || '')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()

  const save = () =>
    start(async () => {
      try {
        const r = await setBikeDeliveredOn(bikeId, value)
        setMessage({ ok: r.ok, text: r.message })
        if (r.ok) setSaved(value)
      } catch {
        setMessage({ ok: false, text: 'Could not save. Check your connection and try again.' })
      }
    })

  return (
    <div className="p-3 rounded-xl border border-dashed border-[#C9A96E] bg-[#FBF7EF] space-y-1.5 text-xs">
      <span className="text-[10px] font-bold uppercase text-[#2D4A32] tracking-wider">
        🚚 Delivered on <span className="normal-case font-semibold text-gray-500">(staff only, starts the 30-day tune-up)</span>
      </span>
      <div className="flex gap-2">
        <input
          type="date"
          value={value}
          onChange={(e) => { setValue(e.target.value); setMessage(null) }}
          className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-[#C9A96E] bg-white text-xs focus:outline-none focus:ring-2 focus:ring-[#2D4A32]"
        />
        <button
          type="button"
          onClick={save}
          disabled={pending || value === saved}
          className="px-3 py-1 bg-[#2D4A32] text-white text-xs font-bold rounded-lg hover:bg-[#1A2E1C] disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
      {!saved && !message && <p className="text-gray-500">Not set: the tune-up window runs 40 days from purchase.</p>}
      {message && (
        <p className={message.ok ? 'text-green-700 font-bold' : 'text-red-700 font-bold'}>{message.text}</p>
      )}
    </div>
  )
}
