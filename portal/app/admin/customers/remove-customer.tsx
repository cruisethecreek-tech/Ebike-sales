'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  archiveCustomer,
  restoreCustomer,
  deleteCustomerForever,
  getRemovalImpact,
} from './actions'

/**
 * Removing a customer, in the two steps it actually is.
 *
 * Archiving takes them out of the directory and touches nothing else — the
 * duplicate account, the test record, the person who asked to be taken off the
 * list. Permanent deletion is only offered from inside the archive, and only
 * after showing what it would destroy and having the name typed out.
 *
 * The reason for the second step is arithmetic, not ceremony: this list has
 * sixty-one rows, several of them near-duplicates of each other (three Patrick
 * Simms accounts, two Kristi Simms invoices), and the delete button sits beside
 * the ones people press all day.
 */
export function RemoveCustomer({
  customerId,
  name,
  archived,
  isAdmin,
}: {
  customerId: string
  name: string
  archived: boolean
  isAdmin?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [impact, setImpact] = useState<Awaited<ReturnType<typeof getRemovalImpact>> | null>(null)
  const [typed, setTyped] = useState('')
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [pending, start] = useTransition()
  const router = useRouter()

  function report(r: { ok: boolean; message: string }) {
    setFailed(!r.ok)
    setMessage(r.message)
    if (r.ok) {
      setOpen(false)
      setTyped('')
      router.refresh()
    }
  }

  // An admin account is not deletable from here at all — the shop locking
  // itself out of its own portal is not a recoverable mistake.
  if (isAdmin) {
    return (
      <p className="text-[11px] text-[#4A4A4A]">
        This is an admin account. Remove their admin rights before archiving or deleting.
      </p>
    )
  }

  if (!archived) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => report(await archiveCustomer(customerId)))}
          className="px-3 py-1.5 rounded-lg bg-white border border-[#C9A96E] text-[#8A6D1F] text-[11px] font-bold hover:bg-[#FAF3E4] disabled:opacity-60"
        >
          {pending ? 'Archiving…' : '🗄 Archive customer'}
        </button>
        <p className="text-[11px] text-[#4A4A4A]">
          Hides them from the directory. Their bikes, invoices and login stay exactly as they are,
          and you can restore them from the archive. Permanent deletion is offered there.
        </p>
        {message && (
          <p className={`text-[11px] font-semibold ${failed ? 'text-[#9B2C2C]' : 'text-[#2D4A32]'}`}>
            {message}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => report(await restoreCustomer(customerId)))}
          className="px-3 py-1.5 rounded-lg bg-[#2D4A32] text-white text-[11px] font-bold hover:bg-[#1A2E1C] disabled:opacity-60"
        >
          ↩ Restore to directory
        </button>

        {!open && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                try {
                  setImpact(await getRemovalImpact(customerId))
                  setMessage('')
                  setFailed(false)
                  setOpen(true)
                } catch (err: any) {
                  setFailed(true)
                  setMessage(err?.message || 'Could not read this customer.')
                }
              })
            }
            className="px-3 py-1.5 rounded-lg bg-white border border-[#9B2C2C] text-[#9B2C2C] text-[11px] font-bold hover:bg-[#FDECEC] disabled:opacity-60"
          >
            🗑 Delete permanently…
          </button>
        )}
      </div>

      {open && impact && (
        <div className="p-3 rounded-xl border-2 border-[#9B2C2C] bg-[#FDECEC] space-y-2">
          <p className="text-[11px] font-bold text-[#9B2C2C] uppercase tracking-wide">
            This cannot be undone
          </p>

          {/* The counts are the decision. */}
          <ul className="text-[11px] text-[#1A1A1A] space-y-0.5 list-disc pl-4">
            <li>
              Their login{impact.email ? ` (${impact.email})` : ''} — they lose access to the portal.
            </li>
            <li>{impact.bikes} registered {impact.bikes === 1 ? 'bike' : 'bikes'}.</li>
            <li>
              {impact.invoices} {impact.invoices === 1 ? 'invoice' : 'invoices'} worth $
              {impact.invoiceTotal.toFixed(2)}
              {impact.invoiceNumbers.length > 0 && ` — ${impact.invoiceNumbers.join(', ')}`}.
            </li>
          </ul>

          <p className="text-[11px] text-[#4A4A4A]">
            The Google Sheet is not touched. It stays the record of what was sold; this only
            removes the portal&apos;s copy. Delete the Sheet rows yourself if they should go too.
          </p>

          <label className="block text-[11px] font-bold text-[#1A2E1C]">
            Type <span className="font-mono">{impact.name}</span> to confirm:
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={impact.name}
              className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-[#9B2C2C] bg-white text-xs font-normal focus:outline-none focus:ring-2 focus:ring-[#9B2C2C]"
            />
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending || typed.trim().toLowerCase() !== impact.name.toLowerCase()}
              onClick={() =>
                start(async () => {
                  const r = await deleteCustomerForever(customerId, typed)
                  report(r)
                })
              }
              className="px-3 py-1.5 rounded-lg bg-[#9B2C2C] text-white text-[11px] font-bold hover:bg-[#7A2222] disabled:opacity-40"
            >
              {pending ? 'Deleting…' : `Delete ${impact.name} forever`}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setTyped('')
              }}
              className="px-3 py-1.5 rounded-lg bg-white border border-[#E5E5E5] text-[#4A4A4A] text-[11px] font-bold hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {message && (
        <p className={`text-[11px] font-semibold ${failed ? 'text-[#9B2C2C]' : 'text-[#2D4A32]'}`}>
          {message}
        </p>
      )}
    </div>
  )
}
