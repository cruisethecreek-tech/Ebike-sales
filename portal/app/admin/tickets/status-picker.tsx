'use client'

import { useState, useTransition } from 'react'
import { setTicketStatus } from './actions'

const OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
]

export function TicketStatusPicker({ ticketId, status }: { ticketId: string; status: string }) {
  const [value, setValue] = useState(status)
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="text-sm border border-[#E8DCC4] rounded-lg px-2 py-1.5 bg-white"
        aria-label="Ticket status"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending || value === status}
        onClick={() =>
          startTransition(async () => {
            const res = await setTicketStatus(ticketId, value)
            setMessage(res.message)
          })
        }
        className="text-sm font-bold px-3 py-1.5 rounded-lg bg-[#2D4A32] text-white disabled:opacity-40"
      >
        {pending ? 'Saving…' : 'Save status'}
      </button>
      {message && <span className="text-xs text-[#4A4A4A]">{message}</span>}
    </div>
  )
}
