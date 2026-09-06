import { createClient } from '@/lib/supabase/server'
import { redeemCredit, approveAndIssueCredit } from './actions'

export default async function AdminReferrals() {
  const supabase = await createClient()

  // Fetch all customers
  const { data: allCustomers } = await supabase
    .from('customers')
    .select('id, first_name, last_name, referral_code, phone')
    .order('last_name', { ascending: true })

  // Fetch referred customers
  const { data: referredList } = await supabase
    .from('customers')
    .select('id, first_name, last_name, referred_by, created_at')
    .not('referred_by', 'is', null)

  // Fetch all referral credits
  const { data: credits } = await supabase
    .from('referral_credits')
    .select('*, customers(first_name, last_name)')
    .order('created_at', { ascending: false })

  const availableTotal = (credits || []).filter(c => !c.redeemed).reduce((s, c) => s + Number(c.amount), 0)
  const redeemedTotal = (credits || []).filter(c => c.redeemed).reduce((s, c) => s + Number(c.amount), 0)

  return (
    <div className="space-y-8 w-full max-w-full">
      <div>
        <h1
          className="uppercase tracking-wide text-3xl text-[#1A2E1C]"
          style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.04em' }}
        >
          🎁 Referral Program Management
        </h1>
        <p className="text-xs text-[#4A4A4A]">Manually approve referral rewards & track customer credit balances</p>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#E5E5E5] shadow-xs">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Referrals Logged</h3>
          <p className="text-2xl sm:text-3xl font-bold text-[#2D4A32] mt-1" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
            {referredList?.length || 0}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-[#E5E5E5] shadow-xs">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Unredeemed Credits</h3>
          <p className="text-2xl sm:text-3xl font-bold text-[#B45309] mt-1" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
            ${availableTotal.toFixed(2)}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-[#E5E5E5] shadow-xs">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Credits Redeemed</h3>
          <p className="text-2xl sm:text-3xl font-bold text-[#15803D] mt-1" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
            ${redeemedTotal.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Manual Referral Approval Form */}
      <div className="bg-white rounded-2xl p-5 border border-[#6B8F71]/30 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">✅</span>
          <div>
            <h2
              className="uppercase tracking-wide text-xl text-[#2D4A32]"
              style={{ fontFamily: "'Bebas Neue', sans-serif" }}
            >
              Manual Referral Approval & Credit Grant
            </h2>
            <p className="text-xs text-[#4A4A4A]">
              Verify that a referred customer completed an e-bike purchase, then grant $100 credit to the referring customer.
            </p>
          </div>
        </div>

        <form action={approveAndIssueCredit} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-4">
            <label className="block text-xs font-semibold text-[#4A4A4A] mb-1">
              Select Referring Customer *
            </label>
            <select
              name="customer_id"
              required
              className="w-full px-3 py-2 rounded-lg border border-[#C9A96E] bg-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#2D4A32]"
            >
              <option value="">Choose customer...</option>
              {(allCustomers || []).map((c) => {
                const l = (c.last_name || '').trim()
                const cleanLast = ['(none)', 'none', 'null'].includes(l.toLowerCase()) ? '' : l
                return (
                  <option key={c.id} value={c.id}>
                    {c.first_name} {cleanLast} ({c.referral_code || 'No code'})
                  </option>
                )
              })}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-[#4A4A4A] mb-1">Credit Amount ($)</label>
            <input
              name="amount"
              type="number"
              defaultValue="100"
              step="25"
              required
              className="w-full px-3 py-2 rounded-lg border border-[#C9A96E] bg-white text-xs font-bold text-[#2D4A32]"
            />
          </div>

          <div className="sm:col-span-4">
            <label className="block text-xs font-semibold text-[#4A4A4A] mb-1">Verification Note / Reason</label>
            <input
              name="reason"
              type="text"
              placeholder="e.g. Verified John Doe purchase on CTR-058"
              className="w-full px-3 py-2 rounded-lg border border-[#C9A96E] bg-white text-xs"
            />
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              className="btn-primary w-full h-[38px] text-xs font-bold shadow-xs flex items-center justify-center gap-1"
            >
              ⚡ Approve & Grant
            </button>
          </div>
        </form>
      </div>

      {/* Credit Ledger Table */}
      <div className="space-y-4">
        <h2
          className="uppercase tracking-wide text-2xl text-[#1A2E1C]"
          style={{ fontFamily: "'Bebas Neue', sans-serif" }}
        >
          Customer Credit Ledger ({(credits || []).length})
        </h2>

        <div className="bg-white rounded-xl shadow-sm border border-[#E5E5E5] overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#F5F0E8] text-[#1A2E1C]">
              <tr>
                <th className="p-3.5 border-b font-semibold text-xs uppercase tracking-wider">Customer</th>
                <th className="p-3.5 border-b font-semibold text-xs uppercase tracking-wider">Amount</th>
                <th className="p-3.5 border-b font-semibold text-xs uppercase tracking-wider">Reason</th>
                <th className="p-3.5 border-b font-semibold text-xs uppercase tracking-wider">Status</th>
                <th className="p-3.5 border-b font-semibold text-xs uppercase tracking-wider">Issued Date</th>
                <th className="p-3.5 border-b font-semibold text-xs uppercase tracking-wider">Note</th>
                <th className="p-3.5 border-b font-semibold text-xs uppercase tracking-wider text-right">Redeem</th>
              </tr>
            </thead>
            <tbody>
              {(!credits || credits.length === 0) ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-xs text-gray-500">
                    No referral credits on file. Grant one using the approval form above!
                  </td>
                </tr>
              ) : (
                credits.map((credit: any) => {
                  const isRedeemed = credit.status === 'redeemed' || credit.redeemed
                  return (
                    <tr key={credit.id} className="border-b last:border-0 hover:bg-[#FBF7EF] text-xs">
                      <td className="p-3.5 font-bold text-[#1A2E1C]">
                        {credit.customers?.first_name || 'Customer'}{' '}
                        {credit.customers?.last_name && !['(none)', 'none', 'null'].includes(credit.customers.last_name.toLowerCase())
                          ? credit.customers.last_name
                          : ''}
                      </td>
                      <td className="p-3.5 font-bold text-[#2D4A32] text-sm">
                        ${Number(credit.amount).toFixed(2)}
                      </td>
                      <td className="p-3.5 text-gray-600 max-w-xs">{credit.reason || 'Referral reward'}</td>
                      <td className="p-3.5">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            isRedeemed
                              ? 'bg-gray-100 text-gray-600 border border-gray-200'
                              : 'bg-[#DCFCE7] text-[#15803D] border border-[#86EFAC]'
                          }`}
                        >
                          {isRedeemed ? 'Redeemed' : 'Available ✅'}
                        </span>
                      </td>
                      <td className="p-3.5 text-gray-500">
                        {new Date(credit.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-3.5 text-gray-600 font-mono text-[11px]">
                        {credit.redeemed_note || '—'}
                      </td>
                      <td className="p-3.5 text-right">
                        {!isRedeemed && (
                          <form action={redeemCredit} className="inline-flex gap-1.5 items-center justify-end">
                            <input type="hidden" name="id" value={credit.id} />
                            <input
                              type="text"
                              name="note"
                              placeholder="Inv # / Item"
                              className="px-2 py-1 text-xs border rounded-md w-28 bg-white"
                              required
                            />
                            <button
                              type="submit"
                              className="px-2.5 py-1 bg-[#2D4A32] text-[#F5F0E8] rounded-md text-xs font-bold hover:bg-[#1A2E1C]"
                            >
                              Redeem
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
