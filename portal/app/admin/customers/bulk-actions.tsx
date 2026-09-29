'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { STORE_URL } from '@/lib/constants'
import {
  archiveCustomers,
  restoreCustomers,
  deleteCustomersForever,
  mergeCustomers,
} from './actions'

type Outcome = { ok: boolean; message: string; problems?: string[]; invoiceNumbers?: string[] }

export interface BulkCustomer {
  id: string
  name: string
  email?: string | null
  registered?: boolean
  lastSignInAt?: string | null
  is_admin?: boolean
  bikeCount: number
  invoiceCount: number
  totalInvoiced: number
}

/**
 * What can be done to the customers ticked in the directory.
 *
 * In the directory: archive them, or merge two. In the archive: restore them,
 * delete them permanently, or merge two. Deletion stays archive-only for the
 * same reason as the single delete — nobody reaches it from a list of people
 * they deal with every day.
 */
export function BulkActions({
  selected,
  inArchive,
  onDone,
}: {
  selected: BulkCustomer[]
  inArchive: boolean
  onDone: () => void
}) {
  const [mode, setMode] = useState<'idle' | 'delete' | 'merge'>('idle')
  const [typed, setTyped] = useState('')
  const [keepId, setKeepId] = useState<string | null>(null)
  const [result, setResult] = useState<Outcome | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  const n = selected.length
  const confirmPhrase = `delete ${n}`

  function finish(r: Outcome) {
    setResult(r)
    if (r.ok) {
      setMode('idle')
      setTyped('')
      onDone()
      router.refresh()
    }
  }

  // Default to keeping the account the customer actually signs in with, then
  // the one with more history. That is almost always the right one; the
  // choice is still shown.
  function suggestedKeep(pair: BulkCustomer[]) {
    const [a, b] = pair
    if (a.is_admin !== b.is_admin) return a.is_admin ? a.id : b.id
    if (!!a.registered !== !!b.registered) return a.registered ? a.id : b.id
    const score = (c: BulkCustomer) => c.invoiceCount + c.bikeCount
    return score(a) >= score(b) ? a.id : b.id
  }

  const keep = selected.find((c) => c.id === keepId)
  const other = selected.find((c) => c.id !== keepId)

  // Stays up after a success clears the ticks, so the outcome (and, after a
  // merge, the invoices to fix in the Sheet) is still there to read.
  if (n === 0 && !result) return null

  return (
    <div className="sticky top-2 z-20 bg-[#1A2E1C] text-white rounded-xl p-3 shadow-lg space-y-2">
      {n > 0 && (
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="font-bold mr-1">{n} checked</span>

        {!inArchive && (
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => finish(await archiveCustomers(selected.map((c) => c.id))))}
            className="px-3 py-1.5 rounded-lg bg-[#C9A96E] text-[#1A2E1C] font-bold hover:bg-[#d8bb85] disabled:opacity-60"
          >
            {pending && mode === 'idle' ? 'Archiving…' : `🗄 Archive ${n}`}
          </button>
        )}

        {inArchive && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => start(async () => finish(await restoreCustomers(selected.map((c) => c.id))))}
              className="px-3 py-1.5 rounded-lg bg-white text-[#1A2E1C] font-bold hover:bg-[#F5F0E8] disabled:opacity-60"
            >
              ↩ Restore {n}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => { setMode(mode === 'delete' ? 'idle' : 'delete'); setResult(null) }}
              className="px-3 py-1.5 rounded-lg bg-[#9B2C2C] text-white font-bold hover:bg-[#7A2222] disabled:opacity-60"
            >
              🗑 Delete {n} permanently…
            </button>
          </>
        )}

        <button
          type="button"
          disabled={pending || n !== 2}
          title={n === 2 ? 'Combine these two records into one' : 'Check exactly two customers to merge them'}
          onClick={() => {
            setMode(mode === 'merge' ? 'idle' : 'merge')
            setKeepId(suggestedKeep(selected))
            setResult(null)
          }}
          className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/40 font-bold hover:bg-white/20 disabled:opacity-40"
        >
          🔗 Merge{n === 2 ? ' these 2' : ' (check 2)'}
        </button>

        <button
          type="button"
          onClick={() => { onDone(); setMode('idle'); setResult(null); setTyped('') }}
          className="ml-auto px-2 py-1 rounded-lg text-white/80 hover:text-white underline"
        >
          Clear
        </button>
      </div>
      )}

      {mode === 'delete' && (
        <div className="p-3 rounded-lg bg-[#FDECEC] text-[#1A1A1A] space-y-2">
          <p className="text-[11px] font-bold text-[#9B2C2C] uppercase tracking-wide">This cannot be undone</p>
          <p className="text-[11px]">
            Deletes the login, bikes and portal invoices of: {selected.map((c) => c.name).join(', ')}. The
            Google Sheet is not touched.
          </p>
          <label className="block text-[11px] font-bold">
            Type <span className="font-mono">{confirmPhrase}</span> to confirm:
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmPhrase}
              className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-[#9B2C2C] bg-white text-xs font-normal"
            />
          </label>
          <button
            type="button"
            disabled={pending || typed.trim().toLowerCase() !== confirmPhrase}
            onClick={() =>
              start(async () => finish(await deleteCustomersForever(selected.map((c) => c.id), typed)))
            }
            className="px-3 py-1.5 rounded-lg bg-[#9B2C2C] text-white text-[11px] font-bold disabled:opacity-40"
          >
            {pending ? 'Deleting…' : `Delete ${n} forever`}
          </button>
        </div>
      )}

      {mode === 'merge' && n === 2 && (
        <div className="p-3 rounded-lg bg-[#F5F0E8] text-[#1A1A1A] space-y-2">
          <p className="text-[11px] font-bold text-[#1A2E1C]">Which record do you keep?</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {selected.map((c) => (
              <label
                key={c.id}
                className={`p-2.5 rounded-lg border-2 cursor-pointer text-[11px] space-y-0.5 ${
                  keepId === c.id ? 'border-[#2D4A32] bg-white' : 'border-transparent bg-white/60'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="keep"
                    checked={keepId === c.id}
                    onChange={() => setKeepId(c.id)}
                  />
                  <span className="font-bold text-sm">{c.name}</span>
                  {c.is_admin && <span className="px-1 rounded bg-[#C9A96E] text-[10px] font-bold">ADMIN</span>}
                </span>
                <span className="block text-gray-600 break-all">{c.email || 'No email'}</span>
                <span className="block text-gray-600">
                  {c.registered ? '✓ Signs in to the portal' : 'Has never signed in'} · {c.bikeCount}{' '}
                  {c.bikeCount === 1 ? 'bike' : 'bikes'} · {c.invoiceCount}{' '}
                  {c.invoiceCount === 1 ? 'invoice' : 'invoices'} (${c.totalInvoiced.toFixed(2)})
                </span>
              </label>
            ))}
          </div>

          {keep && other && (
            <>
              <p className="text-[11px]">
                Everything on <strong>{other.name}</strong>
                {other.email ? ` (${other.email})` : ''} moves to <strong>{keep.name}</strong>
                {keep.email ? ` (${keep.email})` : ''}. {other.name} then goes to the archive, where it can
                be deleted once you are happy.
              </p>
              {other.invoiceCount > 0 && (
                <p className="text-[11px] text-[#8A6D1F]">
                  Their invoices still carry {other.email || 'the old email'} in the Sheet. Change it to{' '}
                  {keep.email || 'the kept email'} in the invoice generator, or the next save of that
                  invoice moves it back.
                </p>
              )}
              <button
                type="button"
                disabled={pending || (other.is_admin && !keep.is_admin)}
                onClick={() => start(async () => finish(await mergeCustomers(keep.id, other.id)))}
                className="px-3 py-1.5 rounded-lg bg-[#2D4A32] text-white text-[11px] font-bold hover:bg-[#1A2E1C] disabled:opacity-40"
              >
                {pending ? 'Merging…' : `Merge into ${keep.name}`}
              </button>
            </>
          )}
        </div>
      )}

      {result && (
        <div className="text-[11px] space-y-0.5">
          {n === 0 && (
            <button type="button" onClick={() => setResult(null)} className="float-right underline text-white/80">
              Dismiss
            </button>
          )}
          <p className={`font-bold ${result.ok ? 'text-[#B7E4C0]' : 'text-[#FFB4B4]'}`}>{result.message}</p>
          {result.problems?.map((p) => (
            <p key={p} className="text-[#FFD9A0]">{p}</p>
          ))}
          {!!result.invoiceNumbers?.length && (
            <p className="text-[#FFD9A0]">
              Update the email on:{' '}
              {result.invoiceNumbers.map((num, i) => (
                <span key={num}>
                  {i > 0 && ', '}
                  <a
                    href={`${STORE_URL}/invoice.html?edit=${encodeURIComponent(num)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-mono"
                  >
                    {num}
                  </a>
                </span>
              ))}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
