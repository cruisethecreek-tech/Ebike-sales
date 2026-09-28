'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { parseCsvRows, guessMapping } from '@/lib/csv'
import { importCustomers, type ImportRow, type RowOutcome } from './actions'

const FIELDS = [
  { key: 'email', label: 'Email', required: true, help: 'The only column that is required — a portal account is an email address.' },
  { key: 'firstName', label: 'First name', help: '' },
  { key: 'lastName', label: 'Last name', help: '' },
  { key: 'fullName', label: 'Full name', help: 'Use instead of first/last if the export has one combined column.' },
  { key: 'phone', label: 'Phone', help: '' },
  { key: 'bike', label: 'Bike / item bought', help: 'Optional. Registers it to their garage if it names a bike rather than an accessory.' },
  { key: 'purchaseDate', label: 'Purchase date', help: 'Optional. Used for warranty dates.' },
  { key: 'orderNumber', label: 'Order number', help: 'Optional. Stored as WIX-… so it cannot be confused with a CTR- invoice.' },
] as const

const NONE = '—'

export function ImportClient() {
  const [text, setText] = useState('')
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState(false)
  const [result, setResult] = useState<Awaited<ReturnType<typeof importCustomers>> | null>(null)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  const parsed = useMemo(() => {
    if (!text.trim()) return { headers: [], rows: [] }
    try {
      return parseCsvRows(text)
    } catch {
      return { headers: [], rows: [] }
    }
  }, [text])

  // Guess once, when a file first arrives. After that the dropdowns are the
  // person's, and re-guessing would undo their corrections on every keystroke.
  const effectiveMapping = useMemo(() => {
    if (touched) return mapping
    return parsed.headers.length ? guessMapping(parsed.headers) : {}
  }, [touched, mapping, parsed.headers])

  function setField(field: string, header: string) {
    setTouched(true)
    setMapping({ ...effectiveMapping, [field]: header === NONE ? '' : header })
  }

  const rows: ImportRow[] = useMemo(() => {
    const m = effectiveMapping
    if (!m.email) return []
    return parsed.rows.map((r) => {
      let firstName = m.firstName ? r[m.firstName] : ''
      let lastName = m.lastName ? r[m.lastName] : ''
      if (!firstName && !lastName && m.fullName) {
        const parts = String(r[m.fullName] || '').trim().split(/\s+/)
        firstName = parts[0] || ''
        lastName = parts.slice(1).join(' ')
      }
      return {
        email: r[m.email] || '',
        firstName,
        lastName,
        phone: m.phone ? r[m.phone] : '',
        bike: m.bike ? r[m.bike] : '',
        purchaseDate: m.purchaseDate ? r[m.purchaseDate] : '',
        orderNumber: m.orderNumber ? r[m.orderNumber] : '',
      }
    })
  }, [parsed.rows, effectiveMapping])

  const usable = rows.filter((r) => r.email.includes('@'))
  const unusable = rows.length - usable.length
  const uniqueEmails = new Set(usable.map((r) => r.email.trim().toLowerCase())).size

  async function onFile(file: File) {
    setText(await file.text())
    setTouched(false)
    setResult(null)
    setError('')
  }

  return (
    <div className="space-y-5">
      {/* ── 1. The file ── */}
      <section className="bg-white rounded-xl border border-[#E5E5E5] p-4 space-y-3">
        <h2 className="text-sm font-bold text-[#1A2E1C]">1 · Paste or upload the export</h2>
        <p className="text-xs text-[#4A4A4A]">
          In Wix: <strong>Contacts → ⋯ → Export</strong> for people, or{' '}
          <strong>Store Orders → Export</strong> for what they bought. Either works — the
          columns are matched up in the next step, so it does not matter which one you got.
        </p>

        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onFile(f)
          }}
          className="block w-full text-xs file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-[#2D4A32] file:text-white file:font-bold file:text-xs"
        />

        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setTouched(false)
            setResult(null)
          }}
          rows={5}
          placeholder="…or paste the CSV here, including its header row."
          className="w-full px-3 py-2 rounded-lg border border-[#C9A96E] bg-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#2D4A32]"
        />

        {text.trim() && parsed.headers.length === 0 && (
          <p className="text-xs font-bold text-[#9B2C2C]">
            Nothing readable in there. It needs to be CSV with a header row on the first line.
          </p>
        )}
      </section>

      {/* ── 2. The columns ── */}
      {parsed.headers.length > 0 && (
        <section className="bg-white rounded-xl border border-[#E5E5E5] p-4 space-y-3">
          <h2 className="text-sm font-bold text-[#1A2E1C]">
            2 · Which column is which{' '}
            <span className="font-normal text-[#4A4A4A]">
              ({parsed.rows.length} {parsed.rows.length === 1 ? 'row' : 'rows'},{' '}
              {parsed.headers.length} columns)
            </span>
          </h2>
          <p className="text-xs text-[#4A4A4A]">
            Guessed from the header names. Check them — a wrong guess here imports a phone
            number as an email address.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {FIELDS.map((f) => (
              <label key={f.key} className="text-xs">
                <span className="font-bold text-[#1A2E1C]">
                  {f.label}
                  {'required' in f && f.required && <span className="text-[#9B2C2C]"> *</span>}
                </span>
                <select
                  value={effectiveMapping[f.key] || NONE}
                  onChange={(e) => setField(f.key, e.target.value)}
                  className="mt-0.5 w-full px-2 py-1.5 rounded-lg border border-[#C9A96E] bg-white text-xs focus:outline-none focus:ring-2 focus:ring-[#2D4A32]"
                >
                  <option value={NONE}>{NONE} not in this file</option>
                  {parsed.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                {f.help && <span className="block text-[10px] text-[#4A4A4A] mt-0.5">{f.help}</span>}
              </label>
            ))}
          </div>
        </section>
      )}

      {/* ── 3. What would happen ── */}
      {rows.length > 0 && (
        <section className="bg-white rounded-xl border border-[#E5E5E5] p-4 space-y-3">
          <h2 className="text-sm font-bold text-[#1A2E1C]">3 · Check, then import</h2>

          <div className="flex flex-wrap gap-3 text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-[#F5F0E8] font-bold text-[#2D4A32]">
              {uniqueEmails} people
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-[#F5F0E8] font-bold text-[#2D4A32]">
              {usable.length} usable rows
            </span>
            {unusable > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-[#FDECEC] font-bold text-[#9B2C2C]">
                {unusable} with no email — these are skipped
              </span>
            )}
          </div>

          {/* The first few rows as the importer reads them, not as the file
              wrote them. Seeing the mapping applied is the only way to catch a
              column that lined up by accident. */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="text-[#4A4A4A]">
                <tr>
                  <th className="p-1.5 font-semibold">Email</th>
                  <th className="p-1.5 font-semibold">Name</th>
                  <th className="p-1.5 font-semibold">Phone</th>
                  <th className="p-1.5 font-semibold">Bike</th>
                  <th className="p-1.5 font-semibold">Bought</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className={`p-1.5 ${r.email.includes('@') ? '' : 'text-[#9B2C2C] font-bold'}`}>
                      {r.email || '(blank)'}
                    </td>
                    <td className="p-1.5">{[r.firstName, r.lastName].filter(Boolean).join(' ') || '—'}</td>
                    <td className="p-1.5">{r.phone || '—'}</td>
                    <td className="p-1.5">{r.bike || '—'}</td>
                    <td className="p-1.5">{r.purchaseDate || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 5 && (
              <p className="text-[11px] text-[#4A4A4A] mt-1">…and {rows.length - 5} more.</p>
            )}
          </div>

          <div className="p-3 rounded-xl bg-[#F5F0E8] border border-[#C9A96E]/60 text-[11px] text-[#1A2E1C] space-y-1">
            <p className="font-bold">Nobody is emailed.</p>
            <p>
              Accounts are created silently, so these people will not hear from the shop because
              of this import. They appear in the directory as{' '}
              <strong>NOT INVITED</strong> until you choose to invite them.
            </p>
            <p>
              Anyone already in the portal is matched by email and left alone — an older Wix
              phone number never overwrites one you have since corrected.
            </p>
          </div>

          <button
            type="button"
            disabled={pending || usable.length === 0}
            onClick={() =>
              start(async () => {
                setError('')
                try {
                  setResult(await importCustomers(rows))
                } catch (err: any) {
                  setError(err?.message || 'The import failed.')
                }
              })
            }
            className="px-4 py-2 rounded-lg bg-[#2D4A32] text-white text-xs font-bold hover:bg-[#1A2E1C] disabled:opacity-50"
          >
            {pending ? 'Importing…' : `Import ${usable.length} rows`}
          </button>

          {error && <p className="text-xs font-bold text-[#9B2C2C]">{error}</p>}
        </section>
      )}

      {/* ── 4. What did happen ── */}
      {result && <Outcome result={result} />}
    </div>
  )
}

function Outcome({ result }: { result: Awaited<ReturnType<typeof importCustomers>> }) {
  const notes = result.outcomes.filter(
    (o: RowOutcome) => o.status === 'failed' || o.status === 'skipped',
  )
  return (
    <section className="bg-white rounded-xl border-2 border-[#2D4A32] p-4 space-y-2">
      <h2 className="text-sm font-bold text-[#1A2E1C]">Done</h2>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="px-2.5 py-1 rounded-lg bg-[#EAF3EC] font-bold text-[#2D4A32]">
          {result.created} new accounts
        </span>
        <span className="px-2.5 py-1 rounded-lg bg-[#F5F0E8] font-bold text-[#2D4A32]">
          {result.matched} already existed
        </span>
        <span className="px-2.5 py-1 rounded-lg bg-[#F5F0E8] font-bold text-[#2D4A32]">
          {result.bikesAdded} bikes registered
        </span>
        {result.skipped > 0 && (
          <span className="px-2.5 py-1 rounded-lg bg-[#FDECEC] font-bold text-[#9B2C2C]">
            {result.skipped} skipped
          </span>
        )}
        {result.failed > 0 && (
          <span className="px-2.5 py-1 rounded-lg bg-[#FDECEC] font-bold text-[#9B2C2C]">
            {result.failed} failed
          </span>
        )}
      </div>

      {/* Never just "done". The rows that did nothing are the ones worth reading. */}
      {notes.length > 0 && (
        <div className="max-h-56 overflow-y-auto text-[11px] space-y-0.5 pt-1">
          {notes.map((o, i) => (
            <p key={i} className={o.status === 'failed' ? 'text-[#9B2C2C]' : 'text-[#8A6D1F]'}>
              <span className="font-mono font-bold">{o.email}</span> — {o.detail}
            </p>
          ))}
        </div>
      )}

      <Link href="/admin/customers" className="inline-block text-xs font-bold text-[#2D4A32] underline">
        Back to the directory →
      </Link>
    </section>
  )
}
