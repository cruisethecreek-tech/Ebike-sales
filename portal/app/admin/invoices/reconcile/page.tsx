import { createClient } from '@/lib/supabase/server'
import { fetchAllSheetInvoices, type SheetInvoice } from '@/lib/sheet-invoices'
import { canonicalInvoiceNumber } from '@/lib/invoice-number'
import { ImportMissing } from './import-missing'
import { ImportAll } from './import-all'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

/**
 * What is in the Sheet but not in the portal.
 *
 * The Sheet is the system of record and the portal is a mirror, but nothing
 * ever compared the two. An invoice that failed to sync was simply absent —
 * no error, no gap in any list, nothing to notice. 15 were found by a human
 * scrolling both lists side by side.
 *
 * The usual reason is the sync's own guard: an invoice with no customer email
 * is skipped, because a portal invoice belongs to an auth user and an auth
 * user needs an address. That is a reasonable rule with no way to see it
 * being applied, which is the part this page fixes.
 */
export default async function ReconcileInvoices() {
  const supabase = await createClient()

  let sheetInvoices: SheetInvoice[]
  let sheetError: string | null = null
  try {
    sheetInvoices = await fetchAllSheetInvoices()
  } catch (err: any) {
    sheetError = err?.message || 'Could not read the Sheet.'
    sheetInvoices = []
  }

  const { data: portalRows, error: portalError } = await supabase
    .from('invoices')
    .select('invoice_number')

  const inPortal = new Set(
    (portalRows || []).map((r) => canonicalInvoiceNumber(r.invoice_number) || ''),
  )

  const missing = sheetInvoices
    .filter((inv) => !inPortal.has(canonicalInvoiceNumber(inv.invoiceNumber) || ''))
    .sort((a, b) => b.invoiceNumber.localeCompare(a.invoiceNumber))

  const importable = missing.filter((m) => m.customerEmail.trim())
  const blocked = missing.filter((m) => !m.customerEmail.trim())

  return (
    <div className="space-y-6">
      <div>
        <h1
          className="uppercase tracking-wide text-3xl text-[#1A2E1C]"
          style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.04em' }}
        >
          Sheet vs Portal
        </h1>
        <p className="text-xs text-[#4A4A4A]">
          Every invoice in the Sheet that never reached the portal.{' '}
          <Link href="/admin/invoices" className="underline">Back to invoices</Link>
        </p>
      </div>

      {/* An unreadable Sheet must never look like "nothing is missing". */}
      {sheetError && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-800">
          <strong className="font-bold">The Sheet could not be read, so nothing below is
          trustworthy.</strong> {sheetError}
        </div>
      )}
      {portalError && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-800">
          <strong className="font-bold">The portal invoices could not be read.</strong>{' '}
          {portalError.message}
        </div>
      )}

      {!sheetError && (
        <div className="rounded-xl border border-[#6B8F71]/30 bg-white p-4 text-sm">
          <span className="font-bold text-[#1A2E1C]">{sheetInvoices.length}</span> in the Sheet ·{' '}
          <span className="font-bold text-[#1A2E1C]">{inPortal.size}</span> in the portal ·{' '}
          <span className={missing.length ? 'font-bold text-[#9B2C2C]' : 'font-bold text-[#2D4A32]'}>
            {missing.length} missing
          </span>
        </div>
      )}

      {importable.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E5E5E5] overflow-x-auto">
          <div className="p-3 border-b bg-[#F5F0E8]">
            <h2 className="font-bold text-sm text-[#1A2E1C]">
              Can be imported ({importable.length})
            </h2>
            <p className="text-[11px] text-[#4A4A4A] mt-0.5">
              Importing creates the portal account quietly. Nobody is emailed.
            </p>
            <ImportAll invoices={importable} />
          </div>
          <table className="w-full text-left text-xs">
            <thead className="text-[#4A4A4A]">
              <tr>
                <th className="p-2 font-semibold">Invoice</th>
                <th className="p-2 font-semibold">Customer</th>
                <th className="p-2 font-semibold">Email</th>
                <th className="p-2 font-semibold">Date</th>
                <th className="p-2 font-semibold text-right">Total</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {importable.map((inv) => (
                <tr key={inv.invoiceNumber} className="border-t">
                  <td className="p-2 font-mono font-bold">{inv.invoiceNumber}</td>
                  <td className="p-2">{inv.customerName || '—'}</td>
                  <td className="p-2 text-[#4A4A4A]">{inv.customerEmail}</td>
                  <td className="p-2 text-[#4A4A4A] whitespace-nowrap">{inv.invoiceDate || '—'}</td>
                  <td className="p-2 text-right font-semibold">${inv.total.toFixed(2)}</td>
                  <td className="p-2 text-right">
                    <ImportMissing invoice={inv} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {blocked.length > 0 && (
        <div className="bg-white rounded-xl border border-[#F0B4B4] overflow-x-auto">
          <div className="p-3 border-b bg-[#FDECEC]">
            <h2 className="font-bold text-sm text-[#9B2C2C]">
              Cannot be imported — no email address ({blocked.length})
            </h2>
            <p className="text-[11px] text-[#9B2C2C] mt-0.5">
              A portal invoice belongs to a login, and a login needs an email. Add one to the
              invoice in the generator, save it, then import from here.
            </p>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="text-[#4A4A4A]">
              <tr>
                <th className="p-2 font-semibold">Invoice</th>
                <th className="p-2 font-semibold">Customer</th>
                <th className="p-2 font-semibold">Date</th>
                <th className="p-2 font-semibold text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {blocked.map((inv) => (
                <tr key={inv.invoiceNumber} className="border-t">
                  <td className="p-2 font-mono font-bold">{inv.invoiceNumber}</td>
                  <td className="p-2">{inv.customerName || '—'}</td>
                  <td className="p-2 text-[#4A4A4A] whitespace-nowrap">{inv.invoiceDate || '—'}</td>
                  <td className="p-2 text-right font-semibold">${inv.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!sheetError && missing.length === 0 && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          Every invoice in the Sheet is in the portal.
        </div>
      )}
    </div>
  )
}
