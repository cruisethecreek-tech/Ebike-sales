'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SheetInvoice } from '@/lib/sheet-invoices'
import { runImport } from './import-payload'

/**
 * Import every invoice the Sheet has and the portal does not.
 *
 * One at a time, on purpose: each import may create an auth account, and
 * Supabase rate-limits that. Sequential also means a failure names the invoice
 * it happened on instead of vanishing into a Promise.all.
 *
 * Every outcome is listed when it finishes, including the failures. A bulk
 * action that says "done" and leaves three behind is the shape of the bug that
 * made this page necessary.
 */
export function ImportAll({ invoices, label = 'all' }: { invoices: SheetInvoice[]; label?: string }) {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(0)
  const [results, setResults] = useState<{ invoiceNumber: string; error?: string; bikeErrors?: string[] }[]>([])
  const router = useRouter()

  async function run() {
    setBusy(true)
    setResults([])
    setDone(0)
    const out: { invoiceNumber: string; error?: string; bikeErrors?: string[] }[] = []
    for (const inv of invoices) {
      const r = await runImport(inv)
      out.push(
        r.ok
          ? { invoiceNumber: inv.invoiceNumber, bikeErrors: r.bikeErrors }
          : { invoiceNumber: inv.invoiceNumber, error: r.error },
      )
      setDone(out.length)
      setResults([...out])
    }
    setBusy(false)
    router.refresh()
  }

  const failed = results.filter((r) => r.error)
  const withBikeTrouble = results.filter((r) => !r.error && r.bikeErrors?.length)

  return (
    <div className="mt-2 space-y-2">
      <button
        onClick={run}
        disabled={busy || invoices.length === 0}
        className="px-3 py-1.5 rounded bg-[#2D4A32] text-white text-[11px] font-bold hover:bg-[#1A2E1C] disabled:opacity-60"
      >
        {busy ? `Importing ${done} of ${invoices.length}…` : `Import ${label} ${invoices.length}`}
      </button>

      {!busy && results.length > 0 && (
        <div className="text-[11px] space-y-1">
          <p className={failed.length ? 'font-bold text-[#9B2C2C]' : 'font-bold text-[#2D4A32]'}>
            {results.length - failed.length} imported
            {failed.length ? `, ${failed.length} failed` : ''}
          </p>
          {failed.map((r) => (
            <p key={r.invoiceNumber} className="text-[#9B2C2C]">
              <span className="font-mono font-bold">{r.invoiceNumber}</span> — {r.error}
            </p>
          ))}
          {withBikeTrouble.map((r) => (
            <p key={r.invoiceNumber} className="text-[#8A6D1F]">
              <span className="font-mono font-bold">{r.invoiceNumber}</span> imported, but its bike
              was not registered: {r.bikeErrors!.join('; ')}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
