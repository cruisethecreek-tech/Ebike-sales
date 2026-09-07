import { createClient } from '@/lib/supabase/server'
import { StatusBadge } from '@/app/components/status-badge'
import { BrandBreakdownChart } from './brand-breakdown-chart'
import { STORE_URL } from '@/lib/constants'
import Link from 'next/link'

export default async function AdminOverview() {
  const supabase = await createClient()

  const { count: customersCount } = await supabase.from('customers').select('*', { count: 'exact', head: true })
  
  const { data: invoices } = await supabase
    .from('invoices')
    .select('total_amount, status, id, invoice_number, issued_at, created_at, customer_id, customers(first_name, last_name)')
    .order('issued_at', { ascending: false })

  const { data: bikes } = await supabase
    .from('bikes')
    .select('brand, model')
  
  const totalInvoices = invoices?.length || 0
  const totalRevenue = invoices?.filter(i => i.status === 'paid').reduce((sum, i) => sum + Number(i.total_amount), 0) || 0
  const pendingRevenue = invoices?.filter(i => i.status === 'pending').reduce((sum, i) => sum + Number(i.total_amount), 0) || 0

  const { count: referralsCount } = await supabase.from('customers').select('*', { count: 'exact', head: true }).not('referred_by', 'is', null)

  const { data: credits } = await supabase.from('referral_credits').select('amount, redeemed')
  const unredeemedCredits = credits?.filter(c => !c.redeemed).reduce((sum, c) => sum + Number(c.amount), 0) || 0

  const recentInvoices = invoices?.slice(0, 10) || []

  // Compute Brand Breakdown
  const totalBikes = bikes?.length || 0
  const brandColors: Record<string, string> = {
    Velotric: '#2D4A32', // Deep Forest
    Heybike: '#C9A96E',  // Warm Gold/Tan
    Mooncool: '#6B8F71', // Sage Green
    Jasion: '#B47850',   // Copper/Rust
    other: '#8A948E',    // Slate/Gray
  }

  const brandGroups = new Map<string, Array<{ model: string; count: number }>>()
  const brandCounts = new Map<string, number>()

  ;(bikes || []).forEach((b) => {
    const brand = b.brand || 'other'
    const model = b.model || 'Standard'

    brandCounts.set(brand, (brandCounts.get(brand) || 0) + 1)

    if (!brandGroups.has(brand)) {
      brandGroups.set(brand, [])
    }
    const modelList = brandGroups.get(brand)!
    const existing = modelList.find((m) => m.model.toLowerCase() === model.toLowerCase())
    if (existing) {
      existing.count++
    } else {
      modelList.push({ model, count: 1 })
    }
  })

  const brandStats = Array.from(brandCounts.entries()).map(([brand, count]) => ({
    brand,
    count,
    percentage: totalBikes > 0 ? (count / totalBikes) * 100 : 0,
    color: brandColors[brand] || '#6B8F71',
    models: (brandGroups.get(brand) || []).sort((a, b) => b.count - a.count),
  })).sort((a, b) => b.count - a.count)

  return (
    <div className="space-y-8 w-full max-w-full">
      {/* Quick Actions Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2
            className="uppercase tracking-wide text-2xl text-[#1A2E1C]"
            style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.04em' }}
          >
            Business Overview
          </h2>
          <p className="text-xs text-[#4A4A4A]">Real-time sales, bikes & referral metrics</p>
        </div>
        <a
          href={`${STORE_URL}/invoice.html`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary text-xs px-3.5 py-2 flex items-center gap-1.5 shadow-sm font-bold"
        >
          ⚡ New Invoice / Generator ↗
        </a>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
        <StatCard title="Total Customers" value={customersCount?.toString() || '0'} />
        <StatCard title="Total Revenue" value={`$${totalRevenue.toFixed(2)}`} />
        <StatCard title="Pending Revenue" value={`$${pendingRevenue.toFixed(2)}`} />
        <StatCard title="Total Invoices" value={totalInvoices.toString()} />
        <StatCard title="Total Referrals" value={referralsCount?.toString() || '0'} />
        <StatCard title="Unredeemed Credits" value={`$${unredeemedCredits.toFixed(2)}`} />
      </div>

      {/* ── Interactive Brand & Model Breakdown Chart ── */}
      {brandStats.length > 0 && (
        <BrandBreakdownChart stats={brandStats} totalBikes={totalBikes} />
      )}

      {/* ── Recent Invoices ── */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3
            className="uppercase tracking-wide text-xl text-[#1A2E1C]"
            style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.04em' }}
          >
            Recent Invoices
          </h3>
          <span className="text-xs text-[#6B8F71] font-semibold">
            💡 Tap invoice # to open directly in Generator
          </span>
        </div>

        {/* Desktop Table View */}
        <div className="hidden sm:block bg-white rounded-xl shadow-sm border border-[#E5E5E5] overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#F5F0E8] text-[#1A2E1C]">
              <tr>
                <th className="p-3.5 border-b font-semibold text-xs uppercase tracking-wider">Customer</th>
                <th className="p-3.5 border-b font-semibold text-xs uppercase tracking-wider">Invoice #</th>
                <th className="p-3.5 border-b font-semibold text-xs uppercase tracking-wider">Amount</th>
                <th className="p-3.5 border-b font-semibold text-xs uppercase tracking-wider">Status</th>
                <th className="p-3.5 border-b font-semibold text-xs uppercase tracking-wider">Issued Date</th>
                <th className="p-3.5 border-b font-semibold text-xs uppercase tracking-wider text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {recentInvoices.map((inv: any) => {
                const dateStr = inv.issued_at
                  ? new Date(inv.issued_at).toLocaleDateString()
                  : new Date(inv.created_at).toLocaleDateString()

                return (
                  <tr key={inv.id} className="border-b last:border-0 hover:bg-[#FBF7EF] transition-colors">
                    <td className="p-3.5 font-bold text-sm text-[#1A2E1C]">
                      {inv.customers?.first_name} {inv.customers?.last_name}
                    </td>
                    <td className="p-3.5">
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
                    <td className="p-3.5 font-bold text-[#1A1A1A]">
                      ${Number(inv.total_amount).toFixed(2)}
                    </td>
                    <td className="p-3.5">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="p-3.5 text-xs text-[#4A4A4A]">
                      {dateStr}
                    </td>
                    <td className="p-3.5 text-right">
                      <Link
                        href={`/admin/invoices/${inv.id}`}
                        className="px-2.5 py-1 rounded-md border border-[#C9A96E] text-[#2D4A32] text-xs font-semibold hover:bg-white"
                      >
                        Status
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards View */}
        <div className="sm:hidden space-y-2.5">
          {recentInvoices.map((inv: any) => {
            const dateStr = inv.issued_at
              ? new Date(inv.issued_at).toLocaleDateString()
              : new Date(inv.created_at).toLocaleDateString()

            return (
              <div key={inv.id} className="p-3.5 rounded-xl bg-white border border-[#E5E5E5] shadow-xs space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <a
                      href={`${STORE_URL}/invoice.html?edit=${inv.invoice_number}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono font-bold text-sm underline inline-flex items-center gap-1"
                      style={{ color: '#2D4A32' }}
                    >
                      {inv.invoice_number} ↗
                    </a>
                    <p className="font-bold text-sm text-[#1A2E1C]">
                      {inv.customers?.first_name} {inv.customers?.last_name}
                    </p>
                  </div>
                  <div className="text-right space-y-1">
                    <p className="font-bold text-sm text-[#1A1A1A]">${Number(inv.total_amount).toFixed(2)}</p>
                    <StatusBadge status={inv.status} />
                  </div>
                </div>

                <div className="pt-2 border-t border-[#F5F0E8] flex justify-between items-center text-xs">
                  <span className="text-gray-500">Issued: {dateStr}</span>
                  <Link
                    href={`/admin/invoices/${inv.id}`}
                    className="px-2.5 py-1 rounded border border-[#C9A96E] text-[#2D4A32] text-xs font-bold"
                  >
                    Edit Status
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white p-3.5 sm:p-5 rounded-xl shadow-sm border border-[#E5E5E5]">
      <h3 className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">{title}</h3>
      <p
        className="uppercase tracking-wide text-2xl sm:text-4xl mt-1 text-[#2D4A32]"
        style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.04em' }}
      >
        {value}
      </p>
    </div>
  )
}
