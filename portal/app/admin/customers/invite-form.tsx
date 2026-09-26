'use client'

import { useActionState } from 'react'
import { inviteCustomer, type InviteResult } from './actions'

/**
 * The invite form, with its outcome shown.
 *
 * It was a bare <form action={inviteCustomer}>, which meant the page simply
 * refreshed whatever happened. That was fine while it worked and a disaster
 * when it did not: for an account that already existed the action generated a
 * link and emailed nobody, and the refresh was indistinguishable from success.
 */
export function InviteCustomerForm() {
  const [state, action, pending] = useActionState<InviteResult | null, FormData>(
    inviteCustomer,
    null,
  )

  return (
    <div className="space-y-3">
      <form action={action} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
        <div>
          <label className="block text-xs font-semibold text-[#4A4A4A] mb-1">Email *</label>
          <input name="email" type="email" required placeholder="rider@email.com" className="input w-full text-xs" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#4A4A4A] mb-1">First Name *</label>
          <input name="first_name" type="text" required placeholder="Danielle" className="input w-full text-xs" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#4A4A4A] mb-1">Last Name</label>
          <input name="last_name" type="text" placeholder="Smith" className="input w-full text-xs" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#4A4A4A] mb-1">Phone</label>
          <input name="phone" type="tel" placeholder="(330) 555-1234" className="input w-full text-xs" />
        </div>
        <div>
          <button
            type="submit"
            disabled={pending}
            className="btn-primary w-full h-10 text-xs font-bold shadow-sm disabled:opacity-60"
          >
            {pending ? 'Sending…' : 'Send Invite'}
          </button>
        </div>
      </form>

      {state && (
        <div
          className={`rounded-lg p-2.5 text-xs ${
            state.ok
              ? 'bg-green-50 text-green-800 border border-green-200 font-medium'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {state.message}
        </div>
      )}
    </div>
  )
}
