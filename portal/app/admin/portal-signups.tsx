'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DockInviteButton } from './dock-invite-button'
import { inviteCustomers } from './customers/actions'
import { BULK_INVITE_LIMIT } from '@/lib/bulk-invite'

export interface SignupTodo {
  id: string
  name: string
  /** ISO date of the last invite, or null if never invited. */
  lastInviteAt: string | null
  daysAgo: number | null
}

const SHOWN = 6

/**
 * Who has made it into the portal, and the to-do list of who to nudge:
 * anyone invited a month or more ago who never signed in, then anyone never
 * invited at all. Sending from here removes them from the list until the
 * next month comes round.
 */
export function PortalSignups({
  counts,
  todo,
  reinviteDays,
}: {
  counts: { signedIn: number; invited: number; due: number; never: number; noEmail: number }
  todo: SignupTodo[]
  reinviteDays: number
}) {
  const [showAll, setShowAll] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  const batch = todo.slice(0, BULK_INVITE_LIMIT)
  const shown = showAll ? todo : todo.slice(0, SHOWN)

  const tiles = [
    { label: 'Signed in', value: counts.signedIn, tone: 'text-[#2D4A32]' },
    { label: `Invited, waiting (<${reinviteDays} days)`, value: counts.invited, tone: 'text-[#8A6D1F]' },
    { label: 'Due a reinvite', value: counts.due, tone: 'text-[#9B2C2C]' },
    { label: 'Never invited', value: counts.never, tone: 'text-[#9B2C2C]' },
  ]

  return (
    <div className="p-4 rounded-xl bg-white border border-[#E5E5E5] shadow-sm space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-bold text-[#1A2E1C]">🔑 Portal sign-ups</h3>
        <Link href="/admin/customers" className="text-xs font-bold underline text-[#2D4A32]">
          Customers →
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {tiles.map((t) => (
          <div key={t.label} className="p-2.5 rounded-lg bg-[#FBF7EF] border border-[#F0E8DA]">
            <div className={`text-2xl font-bold ${t.tone}`}>{t.value}</div>
            <div className="text-[11px] text-[#4A4A4A] leading-tight">{t.label}</div>
          </div>
        ))}
      </div>
      {counts.noEmail > 0 && (
        <p className="text-[11px] text-[#4A4A4A]">
          {counts.noEmail} more have no real email on file. Use Copy Sign-In Link on their card to text them.
        </p>
      )}

      {todo.length === 0 ? (
        <p className="text-sm text-[#2D4A32] font-semibold">✓ Nobody is due an invite right now.</p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h4 className="text-sm font-bold text-[#1A2E1C]">
              📋 To do: invite {todo.length} customer{todo.length === 1 ? '' : 's'}
            </h4>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(`Email a portal invite to ${batch.length} customer${batch.length === 1 ? '' : 's'}?`)) return
                start(async () => {
                  const r = await inviteCustomers(batch.map((t) => t.id))
                  setResult([r.message, ...r.problems].join(' '))
                  router.refresh()
                })
              }}
              className="px-3 py-1.5 rounded-lg bg-[#2D4A32] text-white text-xs font-bold hover:bg-[#1A2E1C] disabled:opacity-60"
            >
              {pending ? 'Sending…' : `✉️ Email ${batch.length === todo.length ? 'all' : 'the first'} ${batch.length}`}
            </button>
          </div>
          {result && <p className="text-[11px] text-[#2D4A32] font-semibold">{result}</p>}

          <ul className="divide-y divide-[#F0E8DA]">
            {shown.map((t) => (
              <li key={t.id} className="py-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/admin/customers?customer=${t.id}`}
                    className="font-bold text-sm text-[#1A2E1C] underline decoration-dotted underline-offset-2"
                  >
                    {t.name}
                  </Link>
                  <div className="text-[11px] text-[#4A4A4A]">
                    {t.lastInviteAt
                      ? `Invited ${new Date(t.lastInviteAt).toLocaleDateString()} (${t.daysAgo} days ago), never signed in`
                      : 'Never sent an invite'}
                  </div>
                </div>
                <div className="shrink-0 max-w-[45%] text-right">
                  <DockInviteButton customerId={t.id} compact />
                </div>
              </li>
            ))}
          </ul>
          {todo.length > SHOWN && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="text-xs font-bold underline text-[#2D4A32]"
            >
              {showAll ? 'Show fewer' : `Show all ${todo.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
