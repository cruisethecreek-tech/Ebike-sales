'use client'

import { useState } from 'react'
import { STORE_URL } from '@/lib/constants'
import { adminUpdateCustomerDetails } from './actions'

type Props = {
  customerId: string
  firstName: string
  lastName: string
  email?: string | null
  phone?: string | null
  preferredContact?: string | null
}

const FIELD =
  'w-full px-2.5 py-1.5 rounded-lg border border-[#C9A96E] bg-white text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#2D4A32]'
const LABEL = 'block text-[10px] font-bold uppercase tracking-wider text-[#2D4A32] mb-1'

/**
 * Edit a customer's name, email, phone and preferred contact from their card.
 * Closed by default so the card reads as before; opening it is one click.
 */
export function EditCustomerDetails(props: Props) {
  const initial = {
    firstName: props.firstName || '',
    lastName: props.lastName && props.lastName.toLowerCase() !== '(none)' ? props.lastName : '',
    email: props.email || '',
    phone: props.phone || '',
    preferredContact: props.preferredContact || 'text',
  }
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(initial)
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string; invoiceNumbers?: string[] } | null>(null)

  const set = (k: keyof typeof initial) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value })

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    try {
      const r = await adminUpdateCustomerDetails(props.customerId, form)
      setResult(r)
      if (r.ok && !r.invoiceNumbers?.length) setOpen(false)
    } catch {
      // A dropped connection or an expired session: say so rather than
      // leaving the button on "Saving…".
      setResult({ ok: false, message: 'Could not reach the portal. Nothing was saved; try again.' })
    } finally {
      setPending(false)
    }
  }

  if (!open) {
    return (
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => { setForm(initial); setResult(null); setOpen(true) }}
          className="px-2.5 py-1 rounded border border-[#2D4A32] text-[#2D4A32] text-xs font-bold hover:bg-white"
        >
          ✏️ Edit details
        </button>
        {result?.ok && <ResultLine result={result} />}
      </div>
    )
  }

  return (
    <form onSubmit={save} className="p-3.5 rounded-xl bg-white border border-[#C9A96E] space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label>
          <span className={LABEL}>First name</span>
          <input className={FIELD} value={form.firstName} onChange={set('firstName')} required maxLength={80} />
        </label>
        <label>
          <span className={LABEL}>Last name</span>
          <input className={FIELD} value={form.lastName} onChange={set('lastName')} required maxLength={80} />
        </label>
        <label>
          <span className={LABEL}>Email (their login)</span>
          <input className={FIELD} type="email" value={form.email} onChange={set('email')} required />
        </label>
        <label>
          <span className={LABEL}>Phone</span>
          <input className={FIELD} type="tel" value={form.phone} onChange={set('phone')} placeholder="330 555 1234" />
        </label>
        <label>
          <span className={LABEL}>Preferred contact</span>
          <select className={FIELD} value={form.preferredContact} onChange={set('preferredContact')}>
            <option value="text">Text</option>
            <option value="phone">Phone call</option>
            <option value="email">Email</option>
          </select>
        </label>
      </div>
      <p className="text-[10px] text-[#4A4A4A]">
        Saving here does not email the customer. From now on, saving one of their invoices in the generator
        will not overwrite these details.
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="submit"
          disabled={pending}
          className="px-3 py-1.5 rounded bg-[#2D4A32] text-white text-xs font-bold hover:bg-[#1A2E1C] disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save details'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setResult(null) }}
          disabled={pending}
          className="px-3 py-1.5 rounded border border-[#C9A96E] text-[#2D4A32] text-xs font-semibold hover:bg-[#F5F0E8] disabled:opacity-60"
        >
          {result?.ok ? 'Done' : 'Cancel'}
        </button>
      </div>
      {result && <ResultLine result={result} />}
    </form>
  )
}

function ResultLine({ result }: { result: { ok: boolean; message: string; invoiceNumbers?: string[] } }) {
  return (
    <div role="status" className={`text-[11px] font-semibold ${result.ok ? 'text-[#2D4A32]' : 'text-[#B3261E]'}`}>
      <p>{result.message}</p>
      {!!result.invoiceNumbers?.length && (
        <p className="text-[#8a6d3b] font-normal">
          Open these in the invoice generator and save them with the new email, or the next save files them
          under the old address:{' '}
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
  )
}
