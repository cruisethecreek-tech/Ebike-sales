'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SheetInvoice } from '@/lib/sheet-invoices'
import { runImport } from './import-payload'

/**
 * Import one Sheet invoice into the portal, quietly.
 *
 * Quiet matters: the account is created with admin.createUser rather than an
 * invite, so back-filling historical invoices does not email a customer about
 * a bike they bought two months ago.
 */
export function ImportMissing({ invoice }: { invoice: SheetInvoice }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle')
  const [message, setMessage] = useState('')
  const router = useRouter()

  async function run() {
    setState('busy')
    setMessage('')
    const r = await runImport(invoice)
    if (!r.ok) {
      setState('failed')
      setMessage(r.error)
      return
    }
    setState('done')
    if (r.bikeErrors?.length) setMessage('Bike not registered: ' + r.bikeErrors.join('; '))
    router.refresh()
  }

  if (state === 'done') {
    return (
      <span className="inline-flex flex-col items-end gap-0.5">
        <span className="text-[11px] font-bold text-[#2D4A32]">✓ Imported</span>
        {message && <span className="text-[10px] text-[#8A6D1F] max-w-[220px] text-right">{message}</span>}
      </span>
    )
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        onClick={run}
        disabled={state === 'busy'}
        className="px-2.5 py-1 rounded bg-[#2D4A32] text-white text-[11px] font-bold hover:bg-[#1A2E1C] disabled:opacity-60"
      >
        {state === 'busy' ? 'Importing…' : 'Import'}
      </button>
      {state === 'failed' && (
        <span className="text-[10px] text-[#9B2C2C] max-w-[220px] text-right">{message}</span>
      )}
    </span>
  )
}
