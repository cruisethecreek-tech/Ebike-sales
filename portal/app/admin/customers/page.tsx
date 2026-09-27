import { createClient } from '@/lib/supabase/server'
import { listAuthAccounts } from '@/lib/auth-accounts'
import { InviteCustomerForm } from './invite-form'
import { CustomerDirectory } from './customer-directory'

export default async function AdminCustomers() {
  const supabase = await createClient()

  const { data: customers } = await supabase
    .from('customers')
    .select('*')
    .order('last_name', { ascending: true })

  const { data: invoices } = await supabase
    .from('invoices')
    .select('customer_id, invoice_number, total_amount, status, issued_at')

  const { data: bikes } = await supabase
    .from('bikes')
    .select('*')
    .order('purchase_date', { ascending: false })

  // Who has actually signed in, and their email — neither is in `customers`.
  const { accounts, error: accountsError } = await listAuthAccounts()

  const customersData = (customers || []).map((c) => {
    const custInvoices = (invoices || []).filter((i) => i.customer_id === c.id)
    const custBikes = (bikes || []).filter((b) => b.customer_id === c.id)
    // "Total Spent" counted only invoices marked paid, and most invoices in
    // this shop are still marked pending — so a customer with a $2,000 bike
    // read $0.00. That is not a cautious number, it is a wrong one, and it
    // makes the column useless for the thing it is there for.
    //
    // Invoiced is what the customer was billed; paid is what has been marked
    // settled. Keep both, and let the UI show the gap rather than hiding the
    // whole figure behind a status flag that is often just out of date.
    const totalInvoiced = custInvoices
      .reduce((sum, i) => sum + Number(i.total_amount || 0), 0)
    const totalPaid = custInvoices
      .filter((i) => i.status === 'paid')
      .reduce((sum, i) => sum + Number(i.total_amount || 0), 0)

    const latestPurchaseDate = custBikes[0]?.purchase_date || custInvoices[0]?.issued_at || null

    const account = accounts.get(c.id)

    return {
      ...c,
      email: account?.email ?? null,
      registered: account?.registered ?? false,
      lastSignInAt: account?.lastSignInAt ?? null,
      invitedAt: account?.invitedAt ?? null,
      invoiceCount: custInvoices.length,
      totalSpent: totalInvoiced,
      totalInvoiced,
      totalPaid,
      totalOutstanding: Math.max(0, totalInvoiced - totalPaid),
      bikes: custBikes,
      latestPurchaseDate,
    }
  })

  const registeredCount = customersData.filter((c) => c.registered).length
  // Counted separately because they are different facts. "Invited but never
  // arrived" describes someone who got an email and ignored it; most of this
  // list never got one, and saying otherwise hid that entirely.
  const invitedCount = customersData.filter((c) => !c.registered && c.invitedAt).length
  const notInvitedCount = customersData.filter((c) => !c.registered && !c.invitedAt).length

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
          <p className="text-xs text-[#4A4A4A]">
            {accountsError
              ? 'Riders, bike inventory & purchase dates'
              : `${registeredCount} signed in \u00b7 ${invitedCount} invited, never arrived \u00b7 ${notInvitedCount} never invited`}
          </p>
        </div>
      </div>

      {/* The number that should prompt an action, stated once and plainly. */}
      {!accountsError && notInvitedCount > 0 && (
        <div className="rounded-xl border border-[#F0B4B4] bg-[#FDECEC] p-3 text-xs text-[#9B2C2C]">
          <strong className="font-bold">
            {notInvitedCount} customer{notInvitedCount === 1 ? ' has' : 's have'} never been sent an
            invite.
          </strong>{' '}
          Their accounts were created in bulk when invoices were imported, which writes the account
          but sends no email — so they do not know the portal exists. Use ✉️ Invite New Customer
          above with their existing email address to send them one.
        </div>
      )}

      {accountsError && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <strong className="font-bold">Sign-up status unavailable.</strong> Everyone below is shown
          as not-yet-registered because the login records could not be read: {accountsError}
        </div>
      )}

      {/* Invite Customer Form */}
      <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-[#6B8F71]/20">
        <h2
          className="uppercase tracking-wide text-xl text-[#2D4A32] mb-3"
          style={{ fontFamily: "'Bebas Neue', sans-serif" }}
        >
          ✉️ Invite New Customer
        </h2>
        <InviteCustomerForm />
      </div>

      {/* Interactive Alphabetical Directory */}
      {/* Every invoice number there is, so a bike card can tell a receipt
          that resolves from one that points at nothing. */}
      <CustomerDirectory
        customers={customersData}
        knownInvoiceNumbers={(invoices || [])
          .map((i) => i.invoice_number)
          .filter((n): n is string => !!n)}
      />
    </div>
  )
}
