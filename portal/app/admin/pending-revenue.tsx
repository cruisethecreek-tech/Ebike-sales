'use client'

import { useState } from 'react'
import Link from 'next/link'

export interface PendingInvoice {
  id: string
  invoiceNumber: string
  customerId: string | null
  customerName: string
  amount: number
  date: string
}

interface KpiStatsProps {
  customers: string
  totalRevenue: string
  pendingRevenue: string
  totalInvoices: string
  referrals: string
  unredeemedCredits: string
  pending: PendingInvoice[]
}

export function KpiStats(props: KpiStatsProps) {
  const [showPending, setShowPending] = useState(false)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
        <StatCard title="Total Customers" value={props.customers} />
        <StatCard title="Total Revenue" value={props.totalRevenue} />
        <button
          type="button"
          onClick={() => setShowPending((v) => !v)}
          aria-expanded={showPending}
          className={`text-left bg-white p-3.5 sm:p-5 rounded-xl shadow-sm border transition-colors hover:border-[#2D4A32] ${
            showPending ? 'border-[#2D4A32] ring-2 ring-[#2D4A32]' : 'border-[#E5E5E5]'
          }`}
          title="Show what's pending"
        >
          <h3 className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider flex items-center justify-between gap-1">
            Pending Revenue
            <span className="text-[#2D4A32] normal-case">{showPending ? '▲' : '▼'}</span>
          </h3>
          <p
            className="uppercase tracking-wide text-2xl sm:text-4xl mt-1 text-[#2D4A32]"
            style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.04em' }}
          >
            {props.pendingRevenue}
          </p>
          <p className="text-[11px] text-[#6B8F71] font-semibold">
            {props.pending.length} invoice{props.pending.length !== 1 ? 's' : ''} · tap to see
          </p>
        </button>
        <StatCard title="Total Invoices" value={props.totalInvoices} />
        <StatCard title="Total Referrals" value={props.referrals} />
        <StatCard title="Unredeemed Credits" value={props.unredeemedCredits} />
      </div>

      {showPending && (
        <div className="p-4 rounded-xl bg-[#F5F0E8] border border-[#E5E5E5] space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#2D4A32]">
              Pending invoices ({props.pending.length})
            </h4>
            <button
              type="button"
              onClick={() => setShowPending(false)}
              className="text-xs font-semibold text-gray-500 hover:text-[#1A2E1C]"
            >
              Close ✕
            </button>
          </div>

          {props.pending.length === 0 ? (
            <p className="text-xs text-gray-500">Nothing pending right now.</p>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {props.pending.map((inv) => (
                <div
                  key={inv.id}
                  className="p-2.5 rounded-lg bg-white flex items-center justify-between gap-3 text-xs border border-gray-100"
                >
                  <div className="min-w-0">
                    {inv.customerId ? (
                      <Link
                        href={`/admin/customers?customer=${inv.customerId}`}
                        className="font-bold text-sm text-[#1A2E1C] underline hover:opacity-80"
                      >
                        {inv.customerName}
                      </Link>
                    ) : (
                      <span className="font-bold text-sm text-[#1A2E1C]">{inv.customerName}</span>
                    )}
                    <p className="text-gray-500">
                      <Link href={`/admin/invoices/${inv.id}`} className="font-mono underline hover:opacity-80">
                        {inv.invoiceNumber}
                      </Link>
                      {inv.date ? ` · ${inv.date}` : ''}
                    </p>
                  </div>
                  <span className="font-bold text-sm text-[#1A1A1A] whitespace-nowrap">
                    ${inv.amount.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
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
