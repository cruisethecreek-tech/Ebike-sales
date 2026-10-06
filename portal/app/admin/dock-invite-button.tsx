'use client'

import { useActionState } from 'react'
import { inviteCustomerById, type InviteResult } from './customers/actions'

/** Send Portal Invite from the Find Customer panel (see inviteCustomerById). */
export function DockInviteButton({ customerId }: { customerId: string }) {
  const [state, action, pending] = useActionState<InviteResult | null, FormData>(inviteCustomerById, null)

  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="customer_id" value={customerId} />
      <button
        type="submit"
        disabled={pending}
        className="w-full p-2.5 rounded-lg bg-[#2D4A32] text-white font-bold flex items-center justify-center gap-1.5 hover:bg-[#1A2E1C] shadow-xs disabled:opacity-60"
      >
        {pending ? 'Sending…' : '✉️ Send Portal Invite'}
      </button>
      {state && (
        <span className={`text-[11px] ${state.ok ? 'text-[#2D4A32] font-semibold' : 'text-[#9B2C2C]'}`}>
          {state.ok ? '✓ ' : ''}
          {state.message}
        </span>
      )}
    </form>
  )
}
