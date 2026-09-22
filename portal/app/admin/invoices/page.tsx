import { createClient } from '@/lib/supabase/server'
import { StatusBadge } from '@/app/components/status-badge'
import { STORE_URL } from '@/lib/constants'
import { DeleteInvoiceButton } from './delete-invoice-button'
import { InvoiceItems } from './invoice-items'
import { ShopLinkBadge } from './shop-link-badge'
import { BulkResync } from './bulk-resync'
import Link from 'next/link'

export default async function AdminInvoices() {
  const supabase = await createClient()

  // Both in one round trip. The bikes read does not depend on the invoices
  // read, and awaiting it separately just added its latency to a page that
  // already waits on the middleware, the layout's auth check and the layout's
  // own three reads.
  //
  // Invoices synced before the items column existed have none. A bike
  // registered against the same invoice number is the same line item,
  // recovered from the record it created, so use it rather than showing a
  // blank cell that reads like a bug.
  const [{ data: invoices }, { data: bikes }] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, invoice_number, total_amount, status, issued_at, created_at, items, supplier_url, customers(first_name, last_name)')
      .order('issued_at', { ascending: false }),
    supabase
      .from('bikes')
      .select('brand, model, receipt_number')
      .not('receipt_number', 'is', null),
  ])

  const bikesByReceipt = new Map<string, Array<{ brand: string; model: string }>>()
  for (const b of bikes || []) {
    const key = String(b.receipt_number)
    if (!bikesByReceipt.has(key)) bikesByReceipt.set(key, [])
    bikesByReceipt.get(key)!.push({ brand: b.brand, model: b.model })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1
            className="uppercase tracking-wide text-3xl text-[#1A2E1C]"
            style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.04em' }}
          >
            Invoices
          </h1>
          <p className="text-xs text-[#4A4A4A]">Manage & edit all customer invoices</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <a
            href={`${STORE_URL}/invoice.html`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary text-xs px-3.5 py-2 flex items-center gap-1.5 shadow-sm"
          >
            ⚡ Open Invoice Generator ↗
          </a>
          {/* For the audit: push every portal status to the Sheet in one pass
              rather than opening 50-odd invoices one at a time. */}
          <BulkResync
            targets={(invoices || []).map((inv: any) => ({
              id: inv.id,
              invoiceNumber: inv.invoice_number || '',
              status: inv.status || '',
            }))}
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[#E5E5E5] overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-[#F5F0E8] text-[#1A2E1C]">
            <tr>
              <th className="p-3 sm:p-4 border-b font-semibold text-xs uppercase tracking-wider">Invoice #</th>
              <th className="p-3 sm:p-4 border-b font-semibold text-xs uppercase tracking-wider">Customer</th>
              <th className="p-3 sm:p-4 border-b font-semibold text-xs uppercase tracking-wider">Item</th>
              <th className="p-3 sm:p-4 border-b font-semibold text-xs uppercase tracking-wider">Amount</th>
              <th className="p-3 sm:p-4 border-b font-semibold text-xs uppercase tracking-wider">Status</th>
              <th className="p-3 sm:p-4 border-b font-semibold text-xs uppercase tracking-wider">Issued Date</th>
              <th className="p-3 sm:p-4 border-b font-semibold text-xs uppercase tracking-wider text-center" title="Shop.com order / warranty tracking link">Shop</th>
              <th className="p-3 sm:p-4 border-b font-semibold text-xs uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices?.map((inv: any) => {
              const dateStr = inv.issued_at
                ? new Date(inv.issued_at).toLocaleDateString()
                : new Date(inv.created_at).toLocaleDateString()

              return (
                <tr key={inv.id} className="border-b last:border-0 hover:bg-[#FBF7EF] transition-colors">
                  <td className="p-3 sm:p-4">
                    {/* Direct link to Invoice Generator in new tab */}
                    <a
                      href={`${STORE_URL}/invoice.html?edit=${inv.invoice_number}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-sm font-bold underline hover:opacity-80 inline-flex items-center gap-1"
                      style={{ color: '#2D4A32' }}
                      title="Open in Invoice Generator"
                    >
                      {inv.invoice_number} ↗
                    </a>
                  </td>
                  <td className="p-3 sm:p-4 font-medium text-[#1A2E1C]">
                    {inv.customers?.first_name || 'Customer'}{' '}
                    {inv.customers?.last_name && !['(none)', 'none', 'null'].includes(inv.customers.last_name.toLowerCase())
                      ? inv.customers.last_name
                      : ''}
                  </td>
                  <td className="p-3 sm:p-4 text-sm max-w-[240px]">
                    <InvoiceItems
                      items={inv.items}
                      fallbackBikes={bikesByReceipt.get(String(inv.invoice_number)) || []}
                    />
                  </td>
                  <td className="p-3 sm:p-4 font-semibold text-[#1A1A1A] whitespace-nowrap">
                    ${Number(inv.total_amount).toFixed(2)}
                  </td>
                  <td className="p-3 sm:p-4">
                    <StatusBadge status={inv.status} />
                  </td>
                  <td className="p-3 sm:p-4 text-xs text-[#4A4A4A] whitespace-nowrap">
                    {dateStr}
                  </td>
                  <td className="p-3 sm:p-4 text-center">
                    <ShopLinkBadge supplierUrl={inv.supplier_url} />
                  </td>
                  <td className="p-3 sm:p-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      <a
                        href={`${STORE_URL}/invoice.html?edit=${inv.invoice_number}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded bg-[#2D4A32] text-white text-xs font-bold hover:bg-[#1A2E1C]"
                      >
                        ⚡ Edit in Tool ↗
                      </a>
                      <Link
                        href={`/admin/invoices/${inv.id}`}
                        className="px-2 py-1 rounded border border-[#C9A96E] text-[#2D4A32] text-xs font-semibold hover:bg-white"
                      >
                        Status
                      </Link>
                      <DeleteInvoiceButton
                        invoiceId={inv.id}
                        invoiceNumber={inv.invoice_number}
                      />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
