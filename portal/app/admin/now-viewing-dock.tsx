'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { STORE_URL } from '@/lib/constants'

interface CustomerWithData {
  id: string
  first_name: string
  last_name: string
  phone?: string | null
  email?: string | null
  referral_code?: string | null
  is_admin?: boolean
  bikes: Array<{
    id: string
    brand: string
    model: string
    serial_number?: string | null
    receipt_number?: string | null
    purchase_date?: string | null
  }>
  invoices: Array<{
    id: string
    invoice_number: string
    total_amount: number
    status: string
    issued_at: string
  }>
}

function getGoogleVoiceUrls(phone?: string | null) {
  if (!phone) return { callUrl: '#', textUrl: '#' }
  const digits = phone.replace(/\D/g, '')
  const num = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  return {
    callUrl: `https://voice.google.com/u/0/calls?a=nc,%2B1${num}`,
    textUrl: `https://voice.google.com/u/0/messages?itemId=t.%2B1${num}`,
  }
}

interface NowViewingDockProps {
  customers: CustomerWithData[]
}

function cleanName(firstName?: string | null, lastName?: string | null): string {
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

export function NowViewingDock({ customers }: NowViewingDockProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL')
  const [copiedCode, setCopiedCode] = useState(false)

  const brands = ['ALL', 'Heybike', 'Velotric', 'Mooncool', 'Jasion']

  // Listen for customer selection events from other components (like directory table or cards)
  useEffect(() => {
    function handleSelect(e: any) {
      if (e.detail?.id) {
        setSelectedId(e.detail.id)
      } else if (e.detail?.id === null) {
        setSelectedId(null)
      }
    }
    window.addEventListener('ctc-select-customer', handleSelect)

    // Load initial selection from localStorage
    try {
      const saved = localStorage.getItem('ctc_selected_customer_id')
      if (saved && customers.some((c) => c.id === saved)) {
        setSelectedId(saved)
      }
    } catch (_) {}

    return () => window.removeEventListener('ctc-select-customer', handleSelect)
  }, [customers])

  function selectCustomer(id: string) {
    setSelectedId(id)
    try {
      localStorage.setItem('ctc_selected_customer_id', id)
      window.dispatchEvent(new CustomEvent('ctc-select-customer', { detail: { id } }))
    } catch (_) {}
  }

  function clearSelection() {
    setSelectedId(null)
    try {
      localStorage.removeItem('ctc_selected_customer_id')
      window.dispatchEvent(new CustomEvent('ctc-select-customer', { detail: { id: null } }))
    } catch (_) {}
  }

  // Find currently selected customer
  const selectedCustomer = useMemo(() => {
    if (!selectedId) return null
    return customers.find((c) => c.id === selectedId) || null
  }, [selectedId, customers])

  // Filter customers based on search query and brand filter
  const filteredCustomers = useMemo(() => {
    let list = customers

    if (selectedBrand !== 'ALL') {
      list = list.filter((c) =>
        c.bikes?.some((b) => b.brand?.toLowerCase() === selectedBrand.toLowerCase())
      )
    }

    if (!query.trim()) return list

    const q = query.toLowerCase().trim()
    return list.filter((c) => {
      const fullName = cleanName(c.first_name, c.last_name).toLowerCase()
      const phone = (c.phone || '').toLowerCase()
      const email = (c.email || '').toLowerCase()
      const refCode = (c.referral_code || '').toLowerCase()
      const matchesBike = c.bikes?.some((b) =>
        `${b.brand} ${b.model}`.toLowerCase().includes(q)
      )
      const matchesInvoice = c.invoices?.some((inv) =>
        (inv.invoice_number || '').toLowerCase().includes(q)
      )

      return (
        fullName.includes(q) ||
        phone.includes(q) ||
        email.includes(q) ||
        refCode.includes(q) ||
        matchesBike ||
        matchesInvoice
      )
    })
  }, [customers, query, selectedBrand])

  function copyReferralLink(code: string) {
    const url = `https://portal.cruisethecreek.com/auth?ref=${encodeURIComponent(code)}`
    navigator.clipboard.writeText(url)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  return (
    <>
      {/* ── Persistent Bottom Dock ── */}
      <div className="fixed bottom-0 inset-x-0 z-40 p-2 sm:p-4 pointer-events-none flex justify-center">
        <div className="pointer-events-auto w-full max-w-xl">
          <button
            onClick={() => setIsOpen(true)}
            className="w-full shadow-2xl rounded-2xl p-3 sm:p-3.5 flex items-center justify-between transition-all transform active:scale-[0.99] border border-[#6B8F71]/50"
            style={{
              backgroundColor: '#1A2E1C',
              color: '#F5F0E8',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="p-1.5 rounded-lg bg-[#2D4A32] text-sm">
                {selectedCustomer ? '👤' : '🔍'}
              </span>
              <div className="text-left min-w-0">
                <div className="text-[10px] uppercase font-bold tracking-widest text-[#C9A96E]">
                  Now Viewing
                </div>
                <div className="text-sm font-bold truncate text-[#F5F0E8]">
                  {selectedCustomer
                    ? cleanName(selectedCustomer.first_name, selectedCustomer.last_name)
                    : 'Search Customers, Bikes, Invoices…'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {selectedCustomer?.phone && (
                <span className="hidden sm:inline-block text-[11px] font-medium px-2 py-0.5 rounded bg-[#2D4A32] text-[#F5F0E8]">
                  📞 {selectedCustomer.phone}
                </span>
              )}
              {selectedCustomer?.bikes?.length ? (
                <span className="hidden sm:inline-block text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#2D4A32] text-[#C9A96E]">
                  🚴 {selectedCustomer.bikes[0].brand} {selectedCustomer.bikes[0].model}
                </span>
              ) : null}
              <span className="text-xs px-2.5 py-1 rounded-lg bg-[#C9A96E] text-[#1A2E1C] font-bold shadow-xs">
                {selectedCustomer ? '⚡ Actions & Details' : '▼ Search'}
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* ── Bottom Modal / Sheet ── */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-fadeIn">
          {/* Backdrop Click to close */}
          <div className="flex-1" onClick={() => setIsOpen(false)} />

          <div
            className="w-full max-w-3xl mx-auto rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col overflow-hidden border-t border-[#6B8F71]/30"
            style={{ backgroundColor: '#FBF7EF' }}
          >
            {/* Header / Search bar */}
            <div className="p-4 sm:p-5 border-b border-[#E5E5E5] space-y-3" style={{ backgroundColor: '#F5F0E8' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🔍</span>
                  <h3
                    className="text-xl uppercase font-bold text-[#1A2E1C]"
                    style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.04em' }}
                  >
                    Find Customer, Bike or Invoice
                  </h3>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 px-3 rounded-full bg-white hover:bg-gray-200 text-[#4A4A4A] text-xs font-bold border border-[#E5E5E5]"
                >
                  ✕ Close
                </button>
              </div>

              {/* Search input */}
              <div className="relative">
                <input
                  type="text"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name, phone, bike (e.g. Discover 3), brand, CTR-..."
                  className="w-full px-4 py-2.5 rounded-xl border border-[#C9A96E] bg-white text-[#1A1A1A] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2D4A32] text-sm font-medium"
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    className="absolute right-3 top-2.5 text-xs text-gray-400 hover:text-gray-600 font-bold"
                  >
                    CLEAR
                  </button>
                )}
              </div>

              {/* Brand filter chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                <span className="text-gray-500 font-medium">Brand:</span>
                {brands.map((b) => (
                  <button
                    key={b}
                    onClick={() => setSelectedBrand(b)}
                    className="px-2.5 py-1 rounded-full whitespace-nowrap font-medium transition-colors"
                    style={{
                      backgroundColor: selectedBrand === b ? '#2D4A32' : '#ffffff',
                      color: selectedBrand === b ? '#ffffff' : '#2D4A32',
                      border: '1px solid #C9A96E',
                    }}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>

            {/* Content area: Selected customer detail card OR results list */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {selectedCustomer && (
                <div className="p-4 sm:p-5 rounded-2xl bg-white border-2 border-[#2D4A32] shadow-md space-y-4">
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2.5 py-0.5 rounded bg-[#2D4A32] text-[#F5F0E8] font-bold uppercase tracking-wider">
                          Currently Viewing Customer
                        </span>
                        {selectedCustomer.is_admin && (
                          <span className="text-xs px-2 py-0.5 rounded bg-[#C9A96E] text-[#1A2E1C] font-bold">
                            👑 Admin
                          </span>
                        )}
                      </div>
                      <h4
                        className="text-2xl font-bold uppercase mt-1 text-[#1A2E1C]"
                        style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.04em' }}
                      >
                        {cleanName(selectedCustomer.first_name, selectedCustomer.last_name)}
                      </h4>
                    </div>

                    <button
                      onClick={clearSelection}
                      className="text-xs text-red-600 hover:text-red-800 font-bold px-2 py-1 rounded bg-red-50 hover:bg-red-100"
                    >
                      ✕ Clear Selection
                    </button>
                  </div>

                  {/* ── Action Buttons Bar ── */}
                  <div className="p-3.5 rounded-xl bg-[#F5F0E8] border border-[#C9A96E]/60 space-y-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#2D4A32] block">
                      ⚡ Action Hub for {selectedCustomer.first_name}:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                      {/* 1. Open Invoice Generator */}
                      <a
                        href={`${STORE_URL}/invoice.html?customer=${encodeURIComponent(
                          cleanName(selectedCustomer.first_name, selectedCustomer.last_name)
                        )}&phone=${encodeURIComponent(selectedCustomer.phone || '')}&email=${encodeURIComponent(
                          selectedCustomer.email || ''
                        )}&ref=${encodeURIComponent(selectedCustomer.referral_code || '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2.5 rounded-lg bg-[#2D4A32] text-white font-bold flex items-center justify-center gap-1.5 hover:bg-[#1A2E1C] shadow-xs text-center"
                      >
                        🧾 Generate Invoice ↗
                      </a>

                      {/* 2. Book Creek Ready Tune-up ($100.00 with 20% Discount) */}
                      <a
                        href={`${STORE_URL}/repair-intake.html?service=tuneup&discount=20&promo=20OFF&ref=${encodeURIComponent(
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
                        🌲 Book Tune-Up ($100.00) ↗
                      </a>

                      {/* 3. Call / Text via Google Voice */}
                      {selectedCustomer.phone ? (
                        <div className="flex gap-1">
                          <a
                            href={getGoogleVoiceUrls(selectedCustomer.phone).callUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Natively open Google Voice to Call"
                            className="flex-1 p-2 rounded-lg bg-white border border-[#2D4A32] text-[#2D4A32] font-bold flex items-center justify-center gap-1 hover:bg-[#FAF8F2] text-center"
                          >
                            📞 Call (Voice)
                          </a>
                          <a
                            href={getGoogleVoiceUrls(selectedCustomer.phone).textUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Natively open Google Voice to Text"
                            className="flex-1 p-2 rounded-lg bg-white border border-[#2D4A32] text-[#2D4A32] font-bold flex items-center justify-center gap-1 hover:bg-[#FAF8F2] text-center"
                          >
                            💬 Text (Voice)
                          </a>
                        </div>
                      ) : (
                        <div className="p-2.5 rounded-lg bg-gray-100 text-gray-400 font-semibold text-center">
                          📞 No phone
                        </div>
                      )}

                      {/* 4. Copy Ref Link */}
                      {selectedCustomer.referral_code ? (
                        <button
                          type="button"
                          onClick={() => copyReferralLink(selectedCustomer.referral_code!)}
                          className="p-2.5 rounded-lg bg-white border border-[#C9A96E] text-[#2D4A32] font-bold flex items-center justify-center gap-1 hover:bg-[#FAF8F2]"
                        >
                          {copiedCode ? '✅ Copied Link!' : `🎁 Copy Ref (${selectedCustomer.referral_code})`}
                        </button>
                      ) : (
                        <div className="p-2.5 rounded-lg bg-gray-100 text-gray-400 font-semibold text-center">
                          🎁 No code
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Contact info & details */}
                  <div className="flex flex-wrap gap-2 text-xs">
                    {selectedCustomer.phone && (
                      <a
                        href={`tel:${selectedCustomer.phone}`}
                        className="px-3 py-1.5 rounded-lg bg-[#F5F0E8] text-[#2D4A32] font-semibold flex items-center gap-1 hover:bg-[#e8dfd1]"
                      >
                        📞 {selectedCustomer.phone}
                      </a>
                    )}
                    {selectedCustomer.email && (
                      <a
                        href={`mailto:${selectedCustomer.email}`}
                        className="px-3 py-1.5 rounded-lg bg-[#F5F0E8] text-[#2D4A32] font-semibold flex items-center gap-1 hover:bg-[#e8dfd1]"
                      >
                        ✉️ {selectedCustomer.email}
                      </a>
                    )}
                    {selectedCustomer.referral_code && (
                      <span className="px-3 py-1.5 rounded-lg bg-[#F5F0E8] text-[#1A2E1C] font-mono font-bold">
                        🎁 Ref: {selectedCustomer.referral_code}
                      </span>
                    )}
                  </div>

                  {/* Customer's Bikes */}
                  <div className="border-t border-[#E5E5E5] pt-3">
                    <div className="flex justify-between items-center mb-2">
                      <h5 className="text-xs uppercase font-bold text-[#4A4A4A] tracking-wider">
                        🚴 Bikes Owned ({selectedCustomer.bikes?.length || 0})
                      </h5>
                    </div>
                    {selectedCustomer.bikes?.length > 0 ? (
                      <div className="space-y-2">
                        {selectedCustomer.bikes.map((b) => (
                          <div
                            key={b.id}
                            className="p-3 rounded-xl bg-[#F5F0E8] border border-[#E5E5E5] space-y-2 text-xs"
                          >
                            <div className="flex justify-between items-center">
                              <div className="font-bold text-[#1A2E1C]">
                                <span className="px-1.5 py-0.5 rounded bg-[#2D4A32] text-white text-[10px] mr-1.5 uppercase font-bold">
                                  {b.brand}
                                </span>
                                {b.model}
                              </div>
                              {b.purchase_date && (
                                <span className="text-gray-500 text-[11px]">
                                  {new Date(b.purchase_date).toLocaleDateString()}
                                </span>
                              )}
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                              <div className="bg-white p-2 rounded-lg border border-[#C9A96E]/40">
                                <span className="text-gray-500 block text-[9px] uppercase font-bold">Serial Number</span>
                                <span className="font-mono font-bold text-[#1A2E1C]">
                                  {b.serial_number || '⚠️ Not entered'}
                                </span>
                              </div>
                              <div className="bg-white p-2 rounded-lg border border-[#C9A96E]/40">
                                <span className="text-gray-500 block text-[9px] uppercase font-bold">Receipt / Invoice #</span>
                                {b.receipt_number ? (
                                  <Link
                                    href={`/dashboard/invoices/${b.receipt_number}`}
                                    target="_blank"
                                    className="font-mono font-bold text-[#2D4A32] hover:underline"
                                  >
                                    {b.receipt_number} ↗
                                  </Link>
                                ) : (
                                  <span className="text-gray-400 font-mono">—</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 italic">No bikes registered yet.</p>
                    )}
                  </div>

                  {/* Customer's Invoices */}
                  <div className="border-t border-[#E5E5E5] pt-3">
                    <h5 className="text-xs uppercase font-bold text-[#4A4A4A] tracking-wider mb-2">
                      🧾 Invoices ({selectedCustomer.invoices?.length || 0})
                    </h5>
                    {selectedCustomer.invoices?.length > 0 ? (
                      <div className="space-y-2">
                        {selectedCustomer.invoices.map((inv) => (
                          <div
                            key={inv.id}
                            className="p-3 rounded-xl bg-[#F5F0E8] flex flex-wrap items-center justify-between gap-2 text-xs"
                          >
                            <div>
                              <div className="font-bold text-[#1A2E1C] font-mono">
                                {inv.invoice_number}
                              </div>
                              <div className="text-[11px] text-gray-600">
                                ${Number(inv.total_amount).toFixed(2)} · {new Date(inv.issued_at).toLocaleDateString()} ·{' '}
                                <span
                                  className={
                                    inv.status === 'paid'
                                      ? 'text-green-700 font-bold'
                                      : 'text-amber-700 font-bold'
                                  }
                                >
                                  {inv.status.toUpperCase()}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <a
                                href={`${STORE_URL}/invoice.html?edit=${encodeURIComponent(
                                  inv.invoice_number
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 rounded-lg bg-[#2D4A32] text-white font-bold hover:bg-[#1A2E1C] transition-colors"
                              >
                                ⚡ Open in Generator ↗
                              </a>
                              <Link
                                href={`/admin/invoices/${inv.id}`}
                                onClick={() => setIsOpen(false)}
                                className="px-2.5 py-1.5 rounded-lg bg-white border border-[#C9A96E] text-[#2D4A32] font-semibold hover:bg-gray-50"
                              >
                                Edit Status
                              </Link>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500 italic flex items-center justify-between">
                        <span>No invoices on file yet.</span>
                        <a
                          href={`${STORE_URL}/invoice.html?customer=${encodeURIComponent(
                            cleanName(selectedCustomer.first_name, selectedCustomer.last_name)
                          )}&phone=${encodeURIComponent(selectedCustomer.phone || '')}&email=${encodeURIComponent(
                            selectedCustomer.email || ''
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-bold text-[#2D4A32] underline"
                        >
                          + Create First Invoice ↗
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Search Results List */}
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase text-[#4A4A4A] tracking-wider">
                  {query
                    ? `Search Results (${filteredCustomers.length})`
                    : `All Customers (${filteredCustomers.length})`}
                </div>

                {filteredCustomers.length === 0 ? (
                  <div className="p-8 text-center bg-white rounded-xl text-sm text-gray-500">
                    No customers found matching &quot;{query}&quot;
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {filteredCustomers.map((c) => {
                      const isCurrent = selectedId === c.id
                      const name = cleanName(c.first_name, c.last_name)
                      return (
                        <div
                          key={c.id}
                          onClick={() => selectCustomer(c.id)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all ${
                            isCurrent
                              ? 'bg-[#2D4A32]/10 border-[#2D4A32] ring-2 ring-[#2D4A32]'
                              : 'bg-white border-[#E5E5E5] hover:border-[#2D4A32]'
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-bold text-sm text-[#1A2E1C]">
                                {name} {c.is_admin ? '👑' : ''}
                              </div>
                              <div className="text-xs text-[#4A4A4A]">
                                {c.phone || c.email || 'No contact'}
                              </div>
                            </div>
                            <span className="text-xs px-2 py-0.5 rounded bg-[#F5F0E8] text-[#2D4A32] font-bold">
                              {c.invoices?.length || 0} inv
                            </span>
                          </div>

                          {c.bikes?.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {c.bikes.map((b) => (
                                <span
                                  key={b.id}
                                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#F5F0E8] text-[#2D4A32]"
                                >
                                  🚴 {b.brand} {b.model}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
