'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { checkInRepair, type CheckInResult } from '@/app/admin/tickets/actions'

/**
 * Check a customer's bike in for repair from their card. Opens a repair
 * ticket at "Checked in", which the customer can follow live on their
 * portal; staff move it along from Admin > Tickets.
 */
export function CheckInRepair({
  customerId,
  firstName,
  bikes,
}: {
  customerId: string
  firstName: string
  bikes: { id: string; brand: string; model: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<CheckInResult, FormData>(checkInRepair, null)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full px-3.5 py-2.5 rounded-lg bg-white border border-[#2D4A32] text-[#2D4A32] text-xs font-bold hover:bg-[#FAF8F2]"
      >
        🔧 Check In a Repair
      </button>
    )
  }

  if (state?.ok) {
    return (
      <p className="p-2.5 rounded-lg bg-[#E8F3EA] text-[#2D4A32] text-xs font-semibold">
        {state.message}{' '}
        <Link href="/admin/tickets" className="underline">Move it along on Tickets →</Link>
      </p>
    )
  }

  return (
    <form action={action} className="p-3 rounded-lg bg-white border border-[#E8DCC4] space-y-2 text-xs">
      <input type="hidden" name="customer_id" value={customerId} />
      <p className="font-bold text-[#1A2E1C]">Check in {firstName}&apos;s bike for repair</p>
      <label className="block">
        <span className="font-semibold text-[#4A4A4A]">Bike</span>
        <select name="bike_id" defaultValue={bikes.length === 1 ? bikes[0].id : ''} className="mt-1 w-full border border-[#E8DCC4] rounded-lg px-2 py-1.5 bg-white">
          <option value="">{bikes.length ? 'Not on file / other bike' : 'No bike on file'}</option>
          {bikes.map((b) => (
            <option key={b.id} value={b.id}>{`${b.brand} ${b.model}`.trim()}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="font-semibold text-[#4A4A4A]">What&apos;s wrong</span>
        <textarea
          name="description"
          required
          maxLength={2000}
          rows={3}
          placeholder="Rear brake rubbing, display shows error 30"
          className="mt-1 w-full border border-[#E8DCC4] rounded-lg px-2 py-1.5"
        />
      </label>
      <label className="block">
        <span className="font-semibold text-[#4A4A4A]">Note for the customer (optional)</span>
        <input
          name="note"
          maxLength={500}
          placeholder="We'll take a look first thing tomorrow"
          className="mt-1 w-full border border-[#E8DCC4] rounded-lg px-2 py-1.5"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="px-3 py-2 rounded-lg bg-[#2D4A32] text-white font-bold disabled:opacity-60"
        >
          {pending ? 'Checking in…' : 'Check in and email customer'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 rounded-lg border border-[#E5E5E5]">
          Cancel
        </button>
      </div>
      {state && !state.ok && <p className="text-[#9B2C2C]">{state.message}</p>}
    </form>
  )
}
