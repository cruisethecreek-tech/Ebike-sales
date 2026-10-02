'use client'

import { useState, useTransition } from 'react'
import { recordBikeService } from './look-actions'

/** Staff-only: mark the Creek Ready tune-up done so the mileage reminder restarts. */
export function ServiceRecorder({ bikeId }: { bikeId: string }) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()

  const record = () =>
    start(async () => {
      try {
        const r = await recordBikeService(bikeId)
        setMessage({ ok: r.ok, text: r.message })
      } catch {
        setMessage({ ok: false, text: 'Could not save. Check your connection and try again.' })
      }
    })

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <button
        type="button"
        onClick={record}
        disabled={pending}
        className="px-3 py-1 rounded-lg border border-dashed border-[#2D4A32] text-[#2D4A32] font-bold hover:bg-white disabled:opacity-50"
      >
        {pending ? 'Saving…' : '✅ Tune-up done today (staff)'}
      </button>
      {message && <span className={message.ok ? 'text-green-700 font-bold' : 'text-red-700 font-bold'}>{message.text}</span>}
    </div>
  )
}
