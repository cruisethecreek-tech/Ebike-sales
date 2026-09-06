'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'

interface Bike {
  id: string
  brand: string
  model: string
  purchase_date?: string | null
}

interface CustomerData {
  id: string
  first_name: string
  last_name: string
  phone?: string | null
  email?: string | null
  referral_code?: string | null
  is_admin?: boolean
  invoiceCount: number
  totalSpent: number
  bikes: Bike[]
  latestPurchaseDate?: string | null
}

export function formatCustomerName(firstName?: string | null, lastName?: string | null): string {
  const f = (firstName || '').trim()
  let l = (lastName || '').trim()
  if (
    l.toLowerCase() === '(none)' ||
    l.toLowerCase() === 'none' ||
    l.toLowerCase() === 'null' ||
    l.toLowerCase() === 'undefined'
  ) {
    l = ''
  }
  const full = `${f} ${l}`.trim()
  return full || 'Customer'
}

export function CustomerDirectory({ customers }: { customers: CustomerData[] }) {
  const [activeLetter, setActiveLetter] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState(false)

  const alphabet = ['ALL', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')]

  // Listen for global customer selection events (e.g. from bottom dock)
  useEffect(() => {
    function handleSelect(e: any) {
      if (e.detail?.id) {
        setSelectedCustomerId(e.detail.id)
      }
    }
    window.addEventListener('ctc-select-customer', handleSelect)

    // Check localStorage initial
    try {
      const saved = localStorage.getItem('ctc_selected_customer_id')
      if (saved && customers.some((c) => c.id === saved)) {
        setSelectedCustomerId(saved)
      }
    } catch (_) {}

    return () => window.removeEventListener('ctc-select-customer', handleSelect)
  }, [customers])

  function selectCustomer(id: string) {
    setSelectedCustomerId(id)
    try {
      localStorage.setItem('ctc_selected_customer_id', id)
      window.dispatchEvent(new CustomEvent('ctc-select-customer', { detail: { id } }))
    } catch (_) {}
  }

  function clearSelection() {
    setSelectedCustomerId(null)
    try {
      localStorage.removeItem('ctc_selected_customer_id')
      window.dispatchEvent(new CustomEvent('ctc-select-customer', { detail: { id: null } }))
    } catch (_) {}
  }

  // Filter customers by selected letter or search
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      const cleanName = formatCustomerName(c.first_name, c.last_name).toUpperCase()
      const firstName = (c.first_name || '').trim().toUpperCase()

      // Letter filter
      const matchesLetter =
        activeLetter === 'ALL' ||
        cleanName.startsWith(activeLetter) ||
        firstName.startsWith(activeLetter)

      if (!matchesLetter) return false

      // Search query filter
      if (!searchQuery.trim()) return true

      const q = searchQuery.toLowerCase().trim()
      const phone = (c.phone || '').toLowerCase()
      const ref = (c.referral_code || '').toLowerCase()
      const email = (c.email || '').toLowerCase()
      const bikeMatch = c.bikes.some((b) => `${b.brand} ${b.model}`.toLowerCase().includes(q))

      return (
        cleanName.toLowerCase().includes(q) ||
        phone.includes(q) ||
        ref.includes(q) ||
        email.includes(q) ||
        bikeMatch
      )
    })
  }, [customers, activeLetter, searchQuery])

  const selectedCustomer = useMemo(() => {
    if (!selectedCustomerId) return null
    return customers.find((c) => c.id === selectedCustomerId) || null
  }, [selectedCustomerId, customers])

  function copyReferralLink(code: string) {
    const url = `https://portal.cruisethecreek.com/auth?ref=${encodeURIComponent(code)}`
    navigator.clipboard.writeText(url)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  return (
    <div className="space-y-4">
      {/* ── Alphabetical Quick-Filter Bar ── */}
      <div className="bg-white p-3 rounded-xl border border-[#E5E5E5] shadow-xs space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-[#4A4A4A]">
            🔤 Alphabetical Filter:
          </span>
          <div className="text-xs font-semibold text-[#2D4A32]">
            Showing {filteredCustomers.length} of {customers.length} Customers
          </div>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar text-xs">
          {alphabet.map((letter) => {
            const isSelected = activeLetter === letter
            return (
              <button
                key={letter}
                onClick={() => setActiveLetter(letter)}
                className={`min-w-[28px] h-7 px-1.5 rounded-lg font-bold transition-all flex items-center justify-center ${
                  isSelected
                    ? 'bg-[#2D4A32] text-white shadow-xs scale-105'
                    : 'bg-[#F5F0E8] text-[#2D4A32] hover:bg-[#e8dfd1]'
                }`}
              >
                {letter}
              </button>
            )
          })}
        </div>

        {/* Live Search Bar */}
        <div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, phone, bike (e.g. Discover 3), or ref code..."
            className="w-full px-3 py-2 rounded-lg border border-[#C9A96E] bg-white text-xs placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2D4A32]"
          />
        </div>
      </div>

      {/* ── Selected Customer Actionable Drawer ── */}
      {selectedCustomer && (
        <div className="p-5 rounded-2xl bg-white border-2 border-[#2D4A32] shadow-lg space-y-4 animate-fadeIn">
          <div className="flex justify-between items-start flex-wrap gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-2.5 py-0.5 rounded bg-[#2D4A32] text-[#F5F0E8] font-bold uppercase tracking-wider">
                  👤 Currently Viewing & Active Customer
                </span>
                {selectedCustomer.is_admin && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#C9A96E] text-[#1A2E1C] font-bold">
                    👑 ADMIN
                  </span>
                )}
              </div>
              <h3
                className="text-3xl font-bold uppercase mt-1 text-[#1A2E1C]"
                style={{ fontFamily: "'Bebas Neue', sans-serif" }}
              >
                {formatCustomerName(selectedCustomer.first_name, selectedCustomer.last_name)}
              </h3>
            </div>
            <button
              onClick={clearSelection}
              className="text-xs text-red-600 hover:text-red-800 font-bold px-2 py-1 rounded bg-red-50 hover:bg-red-100"
            >
              ✕ Close
            </button>
          </div>

          {/* ── Direct Action Buttons Suite ── */}
          <div className="p-3.5 rounded-xl bg-[#F5F0E8] border border-[#C9A96E]/50 space-y-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#2D4A32] block">
              ⚡ Quick Actions for {selectedCustomer.first_name}:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
              {/* 1. Open Invoice Generator pre-filled */}
              <a
                href={`https://ebike-sales.pages.dev/invoice.html?customer=${encodeURIComponent(
                  formatCustomerName(selectedCustomer.first_name, selectedCustomer.last_name)
                )}&phone=${encodeURIComponent(selectedCustomer.phone || '')}&email=${encodeURIComponent(
                  selectedCustomer.email || ''
                )}&ref=${encodeURIComponent(selectedCustomer.referral_code || '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2.5 rounded-lg bg-[#2D4A32] text-white font-bold flex items-center justify-center gap-1.5 hover:bg-[#1A2E1C] shadow-xs text-center"
              >
                🧾 Open in Invoice Generator ↗
              </a>

              {/* 2. Book Creek Ready Tune-up ($93.75) */}
              <a
                href={`https://ebike-sales.pages.dev/repair-intake.html?service=tuneup&discount=25&promo=25OFF&ref=${encodeURIComponent(
                  selectedCustomer.referral_code || ''
                )}&firstName=${encodeURIComponent(selectedCustomer.first_name)}&lastName=${encodeURIComponent(
                  selectedCustomer.last_name && selectedCustomer.last_name.toLowerCase() !== '(none)'
                    ? selectedCustomer.last_name
                    : ''
                )}&phone=${encodeURIComponent(selectedCustomer.phone || '')}&email=${encodeURIComponent(
                  selectedCustomer.email || ''
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2.5 rounded-lg bg-[#C9A96E] text-[#1A2E1C] font-bold flex items-center justify-center gap-1.5 hover:bg-[#dbb978] shadow-xs text-center"
              >
                🌲 Book Tune-Up ($93.75) ↗
              </a>

              {/* 3. Call or Text */}
              {selectedCustomer.phone ? (
                <div className="flex gap-1">
                  <a
                    href={`tel:${selectedCustomer.phone.replace(/\D/g, '')}`}
                    className="flex-1 p-2 rounded-lg bg-white border border-[#2D4A32] text-[#2D4A32] font-bold flex items-center justify-center gap-1 hover:bg-[#FAF8F2]"
                  >
                    📞 Call
                  </a>
                  <a
                    href={`sms:${selectedCustomer.phone.replace(/\D/g, '')}`}
                    className="flex-1 p-2 rounded-lg bg-white border border-[#2D4A32] text-[#2D4A32] font-bold flex items-center justify-center gap-1 hover:bg-[#FAF8F2]"
                  >
                    💬 Text
                  </a>
                </div>
              ) : (
                <div className="p-2.5 rounded-lg bg-gray-100 text-gray-400 font-semibold text-center">
                  📞 No phone on file
                </div>
              )}

              {/* 4. Referral link copy */}
              {selectedCustomer.referral_code ? (
                <button
                  type="button"
                  onClick={() => copyReferralLink(selectedCustomer.referral_code!)}
                  className="p-2.5 rounded-lg bg-white border border-[#C9A96E] text-[#2D4A32] font-bold flex items-center justify-center gap-1 hover:bg-[#FAF8F2]"
                >
                  {copiedCode ? '✅ Link Copied!' : `🎁 Copy Ref Link (${selectedCustomer.referral_code})`}
                </button>
              ) : (
                <div className="p-2.5 rounded-lg bg-gray-100 text-gray-400 font-semibold text-center">
                  🎁 No ref code
                </div>
              )}
            </div>
          </div>

          {/* Customer Overview Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="p-2.5 rounded-lg bg-[#FAF8F2] border border-[#E5E5E5]">
              <span className="text-gray-500 block text-[10px] font-bold uppercase">Phone</span>
              <span className="font-semibold text-[#1A1A1A]">{selectedCustomer.phone || '—'}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-[#FAF8F2] border border-[#E5E5E5]">
              <span className="text-gray-500 block text-[10px] font-bold uppercase">Total Spent</span>
              <span className="font-bold text-[#2D4A32]">${selectedCustomer.totalSpent.toFixed(2)}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-[#FAF8F2] border border-[#E5E5E5]">
              <span className="text-gray-500 block text-[10px] font-bold uppercase">Invoices</span>
              <span className="font-semibold text-[#1A1A1A]">{selectedCustomer.invoiceCount}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-[#FAF8F2] border border-[#E5E5E5]">
              <span className="text-gray-500 block text-[10px] font-bold uppercase">Referral Code</span>
              <span className="font-mono font-bold text-[#2D4A32]">{selectedCustomer.referral_code || '—'}</span>
            </div>
          </div>

          {/* Customer Bikes List */}
          <div className="pt-2 border-t border-gray-100">
            <h4 className="text-xs font-bold text-[#4A4A4A] uppercase tracking-wider mb-2">
              🚴 Registered Bikes & Purchase Dates ({selectedCustomer.bikes.length}):
            </h4>
            {selectedCustomer.bikes.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {selectedCustomer.bikes.map((b) => (
                  <div
                    key={b.id}
                    className="p-3 rounded-xl bg-[#F5F0E8] border border-[#E5E5E5] flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="px-1.5 py-0.5 rounded bg-[#2D4A32] text-white text-[10px] mr-1.5 uppercase font-bold">
                        {b.brand}
                      </span>
                      <span className="font-semibold text-[#1A2E1C]">{b.model}</span>
                    </div>
                    <span className="text-gray-600 text-[11px] font-medium">
                      📅 {b.purchase_date ? new Date(b.purchase_date).toLocaleDateString() : 'Date on file'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500 italic bg-[#FAF8F2] p-3 rounded-lg">
                No bikes registered for this customer yet. (Bikes attach automatically when an invoice with a bike is created in the Invoice Generator).
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Desktop Table ── */}
      <div className="hidden md:block bg-white rounded-xl shadow-sm border border-[#E5E5E5] overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-[#F5F0E8] text-[#1A2E1C]">
            <tr>
              <th className="p-3.5 border-b font-semibold text-xs uppercase tracking-wider">Customer Name</th>
              <th className="p-3.5 border-b font-semibold text-xs uppercase tracking-wider">Phone</th>
              <th className="p-3.5 border-b font-semibold text-xs uppercase tracking-wider">Bikes Owned & Purchase Date</th>
              <th className="p-3.5 border-b font-semibold text-xs uppercase tracking-wider">Invoices</th>
              <th className="p-3.5 border-b font-semibold text-xs uppercase tracking-wider">Total Spent</th>
              <th className="p-3.5 border-b font-semibold text-xs uppercase tracking-wider">Ref Code</th>
              <th className="p-3.5 border-b font-semibold text-xs uppercase tracking-wider text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredCustomers.map((c) => {
              const isSelected = selectedCustomerId === c.id
              const cleanName = formatCustomerName(c.first_name, c.last_name)
              return (
                <tr
                  key={c.id}
                  onClick={() => selectCustomer(c.id)}
                  className={`border-b last:border-0 transition-colors cursor-pointer ${
                    isSelected ? 'bg-[#2D4A32]/10 font-medium' : 'hover:bg-[#FBF7EF]'
                  }`}
                >
                  <td className="p-3.5 font-bold text-sm text-[#1A2E1C]">
                    {cleanName}{' '}
                    {c.is_admin && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#C9A96E] font-bold text-[#1A2E1C]">
                        ADMIN
                      </span>
                    )}
                  </td>
                  <td className="p-3.5 text-xs text-[#4A4A4A]">{c.phone || '—'}</td>
                  <td className="p-3.5">
                    {c.bikes.length > 0 ? (
                      <div className="space-y-1">
                        {c.bikes.map((b) => (
                          <div key={b.id} className="flex items-center gap-1.5 text-xs">
                            <span className="px-1.5 py-0.5 rounded bg-[#2D4A32]/10 text-[#2D4A32] text-[10px] font-bold uppercase">
                              {b.brand}
                            </span>
                            <span className="font-semibold text-[#1A1A1A]">{b.model}</span>
                            {b.purchase_date && (
                              <span className="text-gray-500 text-[11px]">
                                ({new Date(b.purchase_date).toLocaleDateString()})
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="p-3.5 text-xs font-semibold">{c.invoiceCount}</td>
                  <td className="p-3.5 text-xs font-bold text-[#2D4A32]">${c.totalSpent.toFixed(2)}</td>
                  <td className="p-3.5 font-mono text-xs text-gray-600">{c.referral_code || '—'}</td>
                  <td className="p-3.5 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        selectCustomer(c.id)
                      }}
                      className="px-3 py-1 rounded-md bg-[#2D4A32] text-white text-xs font-bold hover:bg-[#1A2E1C] shadow-xs"
                    >
                      {isSelected ? '✓ Active' : 'Select & Actions →'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Mobile Cards ── */}
      <div className="md:hidden space-y-2.5">
        {filteredCustomers.map((c) => {
          const isSelected = selectedCustomerId === c.id
          const cleanName = formatCustomerName(c.first_name, c.last_name)
          return (
            <div
              key={c.id}
              onClick={() => selectCustomer(c.id)}
              className={`p-3.5 rounded-xl border shadow-xs space-y-2 cursor-pointer transition-all ${
                isSelected
                  ? 'bg-[#2D4A32]/10 border-[#2D4A32] ring-2 ring-[#2D4A32]'
                  : 'bg-white border-[#E5E5E5] hover:border-[#2D4A32]'
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold text-base text-[#1A2E1C]">
                    {cleanName}{' '}
                    {c.is_admin && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#C9A96E] font-bold text-[#1A2E1C]">
                        ADMIN
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-[#4A4A4A]">{c.phone || 'No phone'}</p>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-[#2D4A32]">${c.totalSpent.toFixed(2)}</span>
                  <p className="text-[11px] text-gray-500">
                    {c.invoiceCount} invoice{c.invoiceCount !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {/* Bikes with Purchase Date */}
              {c.bikes.length > 0 && (
                <div className="space-y-1 pt-1">
                  {c.bikes.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between text-xs bg-[#F5F0E8] p-1.5 rounded-md"
                    >
                      <span className="font-semibold text-[#1A2E1C]">
                        🚴 {b.brand} {b.model}
                      </span>
                      {b.purchase_date && (
                        <span className="text-[10px] text-gray-600 font-medium">
                          {new Date(b.purchase_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2 border-t border-[#F5F0E8] flex justify-between items-center text-xs text-[#4A4A4A]">
                <span className="font-mono text-[11px] bg-[#F5F0E8] px-2 py-0.5 rounded text-[#2D4A32]">
                  🎁 {c.referral_code || 'No code'}
                </span>
                <span className="text-[#2D4A32] font-bold text-xs">
                  {isSelected ? '✓ Active & Selected' : 'Tap for Actions & Invoice →'}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
