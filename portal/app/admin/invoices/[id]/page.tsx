import { createClient } from '@/lib/supabase/server'
import { StatusBadge } from '@/app/components/status-badge'
import { STORE_URL } from '@/lib/constants'
import { StatusButtons } from '../status-buttons'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SyncNowViewing } from '@/app/admin/sync-now-viewing'

export default async function AdminInvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: invoice } = await supabase
    .from('invoices')
    .select('*, customers(first_name, last_name, phone, referral_code)')
    .eq('id', id)
    .single()

  if (!invoice) notFound()

  const dateStr = invoice.issued_at
    ? new Date(invoice.issued_at).toLocaleDateString()
    : new Date(invoice.created_at).toLocaleDateString()

  return (
    <div className="space-y-6 max-w-2xl">
      {/* This page is about one customer, so the dock should say so rather
          than keep naming whoever was picked last. */}
      <SyncNowViewing customerId={invoice.customer_id} />
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link href="/admin/invoices" className="text-sm font-medium" style={{ color: '#6B8F71' }}>
          ← Back to Invoices
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/invoices/${invoice.invoice_number || invoice.id}`}
            target="_blank"
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#2D4A32] text-white hover:bg-[#1A2E1C] transition-colors shadow-sm"
          >
            📄 View Customer Receipt ↗
          </Link>
          <a
            href={`${STORE_URL}/invoice.html?edit=${invoice.invoice_number}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary text-xs px-3.5 py-1.5 flex items-center gap-1.5 shadow-sm font-bold"
          >
            ⚡ Open in Generator ↗
          </a>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[#E5E5E5] p-6 space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="uppercase tracking-wide text-3xl text-[#1A2E1C]" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.04em' }}>
              {invoice.invoice_number}
            </h1>
            <p className="text-[#4A4A4A] mt-1 font-medium">
              {invoice.customers?.first_name} {invoice.customers?.last_name}
            </p>
            {invoice.customers?.phone && (
              <p className="text-sm text-[#4A4A4A]">📞 {invoice.customers.phone}</p>
            )}
          </div>
          <StatusBadge status={invoice.status} />
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-[#4A4A4A] block text-xs">Amount</span>
            <span className="text-2xl font-bold text-[#2D4A32]">${Number(invoice.total_amount).toFixed(2)}</span>
          </div>
          <div>
            <span className="text-[#4A4A4A] block text-xs">Issued Date</span>
            <span className="font-semibold text-[#1A1A1A]">{dateStr}</span>
          </div>
          <div>
            <span className="text-[#4A4A4A] block text-xs">Paid Date</span>
            <span className="font-semibold text-[#1A1A1A]">{invoice.paid_at ? new Date(invoice.paid_at).toLocaleDateString() : '—'}</span>
          </div>
          <div>
            <span className="text-[#4A4A4A] block text-xs">Ref Code</span>
            <span className="font-mono text-sm font-semibold">{invoice.customers?.referral_code || '—'}</span>
          </div>
        </div>

        {/* What was sold. The list view shows only the first line; this is
            the place to see the whole invoice without reopening it in the
            generator. */}
        {Array.isArray(invoice.items) && invoice.items.length > 0 ? (
          <div className="border-t pt-4 border-[#E5E5E5]">
            <h3 className="text-xs font-bold text-[#4A4A4A] mb-3 uppercase tracking-wider">Items</h3>
            <ul className="divide-y divide-[#E5E5E5]">
              {invoice.items.map((it: any, i: number) => {
                const qty = Number(it?.qty) || 1
                const price = Number(it?.price) || 0
                return (
                  <li key={i} className="py-2 flex items-baseline justify-between gap-4">
                    <span className="text-sm text-[#1A2E1C]">
                      {qty > 1 && <span className="text-[#4A4A4A]">{qty}× </span>}
                      {String(it?.description || 'Item')}
                    </span>
                    <span className="text-sm font-semibold text-[#1A1A1A] whitespace-nowrap">
                      ${(qty * price).toFixed(2)}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : (
          <div className="border-t pt-4 border-[#E5E5E5]">
            <h3 className="text-xs font-bold text-[#4A4A4A] mb-2 uppercase tracking-wider">Items</h3>
            <p className="text-sm text-[#4A4A4A]">
              Not recorded. This invoice synced before line items were stored —
              open it in the generator and hit Save Changes to fill this in.
            </p>
          </div>
        )}

        {invoice.description && (
          <div>
            <span className="text-xs text-[#4A4A4A] block mb-1 font-medium">Description</span>
            <p className="text-sm bg-[#F5F0E8] p-3 rounded-lg">{invoice.description}</p>
          </div>
        )}

        {/* Status Update */}
        <div className="border-t pt-4 border-[#E5E5E5]">
          <h3 className="text-xs font-bold text-[#4A4A4A] mb-3 uppercase tracking-wider">Update Status</h3>
          <StatusButtons invoiceId={invoice.id} current={invoice.status} />
        </div>
      </div>
    </div>
  )
}
