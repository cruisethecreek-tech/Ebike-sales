'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { markMyRepliesRead, replyToMyTicket } from './actions'

/** The customer's reply box under one of their tickets. */
export function TicketReplyBox({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()

  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={4000}
        placeholder="Reply to Pat & Dru…"
        aria-label="Reply to the shop"
        className="w-full text-sm border border-[#E8DCC4] rounded-lg px-3 py-2 bg-white"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || !text.trim()}
          onClick={() =>
            startTransition(async () => {
              const res = await replyToMyTicket(ticketId, text)
              setMessage(res.message)
              if (res.ok) {
                setText('')
                router.refresh()
              }
            })
          }
          className="text-sm font-bold px-3 py-1.5 rounded-lg bg-[#2D4A32] text-white disabled:opacity-40"
        >
          {pending ? 'Sending…' : 'Send'}
        </button>
        {message && <span className="text-xs text-[#4A4A4A]">{message}</span>}
      </div>
    </div>
  )
}

/** Clears the customer's "new reply" badge once they have opened Support. */
export function MarkRepliesRead() {
  useEffect(() => {
    markMyRepliesRead().catch(() => {})
  }, [])
  return null
}
