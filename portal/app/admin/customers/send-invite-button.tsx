'use client'

import { useActionState } from 'react'
import { inviteCustomer, type InviteResult } from './actions'

/**
 * Send this customer their way into the portal, from the screen that told you
 * they had never been sent one.
 *
 * The drawer said NOT INVITED and offered no way to change that. The only
 * invite control was a form at the top of the page for adding a new customer,
 * which is not obviously the thing to use on someone who already exists —
 * so the honest badge was a dead end.
 */
export function SendInviteButton({
  email,
  firstName,
  lastName,
  alreadyInvited,
}: {
  email?: string | null
  firstName: string
  lastName?: string | null
  alreadyInvited: boolean
}) {
  const [state, action, pending] = useActionState<InviteResult | null, FormData>(
    inviteCustomer,
    null,
  )

  if (!email) {
    return (
      <span className="text-[11px] text-[#9B2C2C] font-semibold">
        No email on file — cannot invite
      </span>
    )
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <form action={action}>
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="first_name" value={firstName} />
        <input type="hidden" name="last_name" value={lastName || ''} />
        <button
          type="submit"
          disabled={pending}
          className="w-full px-3.5 py-2.5 rounded-lg bg-[#2D4A32] text-white text-xs font-bold hover:bg-[#1A2E1C] disabled:opacity-60"
        >
          {pending
            ? 'Sending…'
            : alreadyInvited
              ? '✉️ Send Sign-In Link Again'
              : '✉️ Send Portal Invite'}
        </button>
      </form>
      {state && (
        <span
          className={`text-[11px] ${state.ok ? 'text-[#2D4A32] font-semibold' : 'text-[#9B2C2C]'}`}
        >
          {state.ok ? '✓ ' : ''}
          {state.message}
        </span>
      )}
    </span>
  )
}
