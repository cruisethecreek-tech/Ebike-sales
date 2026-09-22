'use client'

import { useRef, useState } from 'react'
import { resyncStatusToSheet, type StatusResult } from './actions'

export interface ResyncTarget {
  id: string
  invoiceNumber: string
  status: string
}

/**
 * Push every invoice's current portal status to the Google Sheet.
 *
 * Driven from the browser, one invoice per request, deliberately. Doing all
 * of them inside a single server action would be one long-running function:
 * no maxDuration is configured, so it would hit Vercel's default limit part
 * way through and abort — leaving the Sheet half-written with no record of
 * where it stopped. A loop out here keeps each request small, shows real
 * progress, and can be stopped without losing what already landed.
 *
 * Sequential rather than parallel. These are writes to the record the shop
 * bills from, against an Apps Script that takes no lock; a few seconds saved
 * is not worth interleaving them.
 *
 * Safe to run repeatedly: each push just rewrites the status the Sheet should
 * already have. It sends no email.
 */
export function BulkResync({ targets }: { targets: ResyncTarget[] }) {
  const [armed, setArmed] = useState(false)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(0)
  const [failures, setFailures] = useState<Array<{ n: string; why: string }>>([])
  const [finished, setFinished] = useState<null | { ok: number; failed: number; stopped: boolean }>(null)
  const stopRef = useRef(false)

  const total = targets.length

  async function run() {
    stopRef.current = false
    setRunning(true)
    setArmed(false)
    setDone(0)
    setFailures([])
    setFinished(null)

    let ok = 0
    const failed: Array<{ n: string; why: string }> = []

    for (let i = 0; i < targets.length; i++) {
      if (stopRef.current) {
        setFinished({ ok, failed: failed.length, stopped: true })
        setRunning(false)
        return
      }
      const t = targets[i]
      const fd = new FormData()
      fd.set('invoice_id', t.id)
      let res: StatusResult
      try {
        res = await resyncStatusToSheet(null, fd)
      } catch (e: any) {
        res = { ok: false, message: e?.message || String(e) }
      }
      if (res.ok) ok++
      else {
        failed.push({ n: t.invoiceNumber || t.id, why: res.message || 'unknown' })
        // Show failures as they happen. Finding out at the end which of 55
        // invoices did not land is worse than watching them appear.
        setFailures([...failed])
      }
      setDone(i + 1)
    }

    setFinished({ ok, failed: failed.length, stopped: false })
    setRunning(false)
  }

  if (!total) return null

  return (
    <div className="mt-3">
      {!armed && !running && (
        <button
          type="button"
          onClick={() => { setArmed(true); setFinished(null) }}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#C9A96E] text-[#2D4A32] hover:bg-[#F5F0E8]"
        >
          ↻ Re-sync all {total} to Sheet
        </button>
      )}

      {armed && (
        <div className="rounded-lg border border-[#C9A96E] bg-[#FBF7EF] p-3">
          <p className="text-xs text-[#1A2E1C]">
            This writes the status of <b>all {total} invoices</b> to the Google Sheet — the
            record the shop bills from. Nothing in the portal changes, and no email is sent.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={run}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#2D4A32] text-white hover:bg-[#1A2E1C]"
            >
              Write {total} to the Sheet
            </button>
            <button
              type="button"
              onClick={() => setArmed(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#C9A96E] text-[#2D4A32] hover:bg-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {running && (
        <div className="rounded-lg border border-[#E5E5E5] bg-white p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-[#1A2E1C]">
              Writing to the Sheet — {done} of {total}
              {failures.length > 0 && ` · ${failures.length} failed`}
            </span>
            <button
              type="button"
              onClick={() => { stopRef.current = true }}
              className="px-2.5 py-1 rounded border border-[#B3261E] text-[#B3261E] text-xs font-semibold hover:bg-[#FDECEA]"
            >
              Stop
            </button>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-[#F0F0F0] overflow-hidden">
            <div
              className="h-full bg-[#2D4A32] transition-[width] duration-200"
              style={{ width: `${Math.round((done / total) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {finished && (
        <p
          role="alert"
          className={
            'mt-2 text-xs font-semibold ' +
            (finished.failed ? 'text-[#B3261E]' : 'text-[#2D4A32]')
          }
        >
          {finished.failed ? '❌ ' : '✅ '}
          {finished.ok} of {total} written to the Sheet
          {finished.failed ? `, ${finished.failed} failed` : ''}
          {finished.stopped ? ' (stopped early)' : ''}.
        </p>
      )}

      {failures.length > 0 && (
        <ul className="mt-1 text-[11px] text-[#B3261E] space-y-0.5">
          {failures.map((f) => (
            <li key={f.n}>
              <b>{f.n}</b> — {f.why}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
