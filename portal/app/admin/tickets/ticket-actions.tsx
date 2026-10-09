'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteTicket, markTicketHandled, replyToTicket } from './actions'

/**
 * Reply box plus the "handled" and delete buttons under each ticket on
 * Admin > Tickets. The reply is emailed to the customer and shows on their
 * Support page.
 */
export function TicketActions({ ticketId, needsReply }: { ticketId: string; needsReply: boolean }) {
  const router = useRouter()
  const [reply, setReply] = useState('')
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()

  const run = (fn: () => Promise<{ ok: boolean; message: string }>, clear = false) =>
    startTransition(async () => {
      try {
        const res = await fn()
        setMessage(res.message)
        if (res.ok) {
          if (clear) setReply('')
          router.refresh()
        }
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Something went wrong.')
      }
    })

  return (
    <div className="space-y-2">
      <textarea
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        rows={3}
        maxLength={4000}
        placeholder="Write a reply to the customer…"
        aria-label="Reply to the customer"
        className="w-full text-sm border border-[#E8DCC4] rounded-lg px-3 py-2 bg-white"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || !reply.trim()}
          onClick={() => run(() => replyToTicket(ticketId, reply), true)}
          className="text-sm font-bold px-3 py-1.5 rounded-lg bg-[#2D4A32] text-white disabled:opacity-40"
        >
          {pending ? 'Working…' : 'Send reply'}
        </button>
        {needsReply && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => markTicketHandled(ticketId))}
            className="text-sm font-bold px-3 py-1.5 rounded-lg border border-[#2D4A32] text-[#2D4A32] disabled:opacity-40"
            title="Take it off the to-do list without replying, e.g. after a phone call"
          >
            Handled, no reply needed
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (window.confirm('Delete this ticket and its replies for good? The customer will no longer see it.')) {
              run(() => deleteTicket(ticketId))
            }
          }}
          className="text-sm font-bold px-3 py-1.5 rounded-lg text-[#B23B2E] border border-[#E8C4BF] disabled:opacity-40"
        >
          Delete
        </button>
        {message && <span className="text-xs text-[#4A4A4A]">{message}</span>}
      </div>
    </div>
  )
}
