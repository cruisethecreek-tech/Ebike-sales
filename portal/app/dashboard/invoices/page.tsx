import { createClient } from '@/lib/supabase/server'
import { EmptyState } from '@/app/components/empty-state'
import { StatusBadge } from '@/app/components/status-badge'
import Link from 'next/link'

export const metadata = {
  title: 'Invoices | Cruise the Creek Portal',
}

export default async function InvoicesPage() {
  let invoices: any[] = []
  let errorMsg = null

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('customer_id', user.id)
        .order('issued_at', { ascending: false })
      
      if (error) throw error
      invoices = data || []
    }
  } catch (err: any) {
    console.error('Error fetching invoices:', err)
    errorMsg = 'Failed to load invoices. Please check your connection.'
  }

  return (
    <div className="container mx-auto p-4 max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#1A2E1C]">Invoices</h1>
          <p className="text-sm text-gray-500 mt-1">
            View, print, and track all your Cruise the Creek purchase receipts and service orders.
          </p>
        </div>
      </div>
      
      {errorMsg ? (
        <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-200">{errorMsg}</div>
      ) : invoices.length === 0 ? (
        <EmptyState title="No invoices yet" description="Your purchase history and billing documents will appear here once an order is created." />
      ) : (
        <>
          {/* Mobile view (clickable cards) */}
          <div className="md:hidden space-y-4">
            {invoices.map((invoice) => {
              const total = Number(invoice.total_amount ?? invoice.amount ?? 0)
              const invKey = invoice.invoice_number || invoice.id
              const dateStr = invoice.issued_at
                ? new Date(invoice.issued_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
                : '—'

              return (
                <Link
                  key={invoice.id}
                  href={`/dashboard/invoices/${invKey}`}
                  className="card p-5 block transition-all duration-200 hover:shadow-md hover:border-[#6B8F71] active:scale-[0.99] group bg-white"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="font-bold text-lg text-[#1A2E1C] group-hover:text-[#2D4A32] flex items-center gap-1.5">
                        <span>{invoice.invoice_number || 'Invoice'}</span>
                        <span className="text-xs text-[#6B8F71] font-normal opacity-0 group-hover:opacity-100 transition-opacity">↗</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {dateStr}
                      </div>
                    </div>
                    <StatusBadge status={invoice.status} />
                  </div>

                  <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                    <div className="font-bold text-xl text-[#2D4A32]">
                      ${total.toFixed(2)}
                    </div>
                    <span className="text-xs font-semibold text-[#2D4A32] bg-[#F5F0E8] px-3 py-1.5 rounded-full flex items-center gap-1 group-hover:bg-[#C9A96E] group-hover:text-white transition-colors">
                      View Invoice &rarr;
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>

          {/* Desktop view (interactive table) */}
          <div className="hidden md:block overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-[#FAF7F2] text-xs uppercase tracking-wider text-gray-600 font-semibold">
                  <th className="p-4">Invoice #</th>
                  <th className="p-4">Date</th>
                  <th className="p-4">Amount</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {invoices.map((invoice) => {
                  const total = Number(invoice.total_amount ?? invoice.amount ?? 0)
                  const invKey = invoice.invoice_number || invoice.id
                  const dateStr = invoice.issued_at
                    ? new Date(invoice.issued_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
                    : '—'

                  return (
                    <tr
                      key={invoice.id}
                      className="hover:bg-[#FAF7F2] transition-colors group cursor-pointer"
                    >
                      <td className="p-4 font-bold text-[#1A2E1C]">
                        <Link href={`/dashboard/invoices/${invKey}`} className="hover:underline flex items-center gap-1">
                          {invoice.invoice_number || 'N/A'}
                        </Link>
                      </td>
                      <td className="p-4 text-gray-600">{dateStr}</td>
                      <td className="p-4 font-bold text-[#2D4A32]">${total.toFixed(2)}</td>
                      <td className="p-4">
                        <StatusBadge status={invoice.status} />
                      </td>
                      <td className="p-4 text-right">
                        <Link
                          href={`/dashboard/invoices/${invKey}`}
                          className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#F5F0E8] text-[#2D4A32] hover:bg-[#2D4A32] hover:text-white transition-all shadow-sm"
                        >
                          View Invoice &rarr;
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
