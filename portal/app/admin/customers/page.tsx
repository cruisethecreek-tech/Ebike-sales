import { createClient } from '@/lib/supabase/server'
import { inviteCustomer } from './actions'
import { CustomerDirectory } from './customer-directory'

export default async function AdminCustomers() {
  const supabase = await createClient()

  const { data: customers } = await supabase
    .from('customers')
    .select('*')
    .order('last_name', { ascending: true })

  const { data: invoices } = await supabase
    .from('invoices')
    .select('customer_id, total_amount, status, issued_at')

  const { data: bikes } = await supabase
    .from('bikes')
    .select('*')
    .order('purchase_date', { ascending: false })

  const customersData = (customers || []).map((c) => {
    const custInvoices = (invoices || []).filter((i) => i.customer_id === c.id)
    const custBikes = (bikes || []).filter((b) => b.customer_id === c.id)
    const totalSpent = custInvoices
      .filter((i) => i.status === 'paid')
      .reduce((sum, i) => sum + Number(i.total_amount), 0)

    const latestPurchaseDate = custBikes[0]?.purchase_date || custInvoices[0]?.issued_at || null

    return {
      ...c,
      invoiceCount: custInvoices.length,
      totalSpent,
      bikes: custBikes,
      latestPurchaseDate,
    }
  })

  return (
    <div className="space-y-6 w-full max-w-full">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1
            className="uppercase tracking-wide text-3xl text-[#1A2E1C]"
            style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.04em' }}
          >
            Customers Directory ({customersData.length})
          </h1>
          <p className="text-xs text-[#4A4A4A]">Riders, bike inventory & purchase dates</p>
        </div>
      </div>

      {/* Invite Customer Form */}
      <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-[#6B8F71]/20">
        <h2
          className="uppercase tracking-wide text-xl text-[#2D4A32] mb-3"
          style={{ fontFamily: "'Bebas Neue', sans-serif" }}
        >
          ✉️ Invite New Customer
        </h2>
        <form action={inviteCustomer} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-[#4A4A4A] mb-1">Email *</label>
            <input name="email" type="email" required placeholder="rider@email.com" className="input w-full text-xs" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#4A4A4A] mb-1">First Name *</label>
            <input name="first_name" type="text" required placeholder="Danielle" className="input w-full text-xs" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#4A4A4A] mb-1">Last Name</label>
            <input name="last_name" type="text" placeholder="Smith" className="input w-full text-xs" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#4A4A4A] mb-1">Phone</label>
            <input name="phone" type="tel" placeholder="(330) 555-1234" className="input w-full text-xs" />
          </div>
          <div>
            <button type="submit" className="btn-primary w-full h-10 text-xs font-bold shadow-sm">
              Send Invite
            </button>
          </div>
        </form>
      </div>

      {/* Interactive Alphabetical Directory */}
      <CustomerDirectory customers={customersData} />
    </div>
  )
}
