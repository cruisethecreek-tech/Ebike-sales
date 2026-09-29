'use client'

import { useState } from 'react'
import type { SheetInvoice } from '@/lib/sheet-invoices'
import { ImportMissing } from './import-missing'
import { ImportAll } from './import-all'

/**
 * The importable invoices, with a tick per row so a few can go in without
 * taking the whole list — the same customer sometimes shows up under two
 * spellings of an email, and only one of those should become a login.
 */
export function ImportableTable({ invoices }: { invoices: SheetInvoice[] }) {
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const picked = invoices.filter((i) => checked.has(i.invoiceNumber))
  const allChecked = invoices.length > 0 && picked.length === invoices.length

  function toggle(num: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(num)) next.delete(num)
      else next.add(num)
      return next
    })
  }

  return (
    <>
      <div className="px-3 pb-3 bg-[#F5F0E8] border-b flex gap-2 flex-wrap items-start">
        <ImportAll invoices={invoices} />
        {picked.length > 0 && <ImportAll key={picked.map((p) => p.invoiceNumber).join()} invoices={picked} label="checked" />}
      </div>
      <table className="w-full text-left text-xs">
        <thead className="text-[#4A4A4A]">
          <tr>
            <th className="p-2 w-8">
              <input
                type="checkbox"
                aria-label="Tick every invoice"
                checked={allChecked}
                onChange={() =>
                  setChecked(allChecked ? new Set() : new Set(invoices.map((i) => i.invoiceNumber)))
                }
                className="h-4 w-4 accent-[#2D4A32] cursor-pointer"
              />
            </th>
            <th className="p-2 font-semibold">Invoice</th>
            <th className="p-2 font-semibold">Customer</th>
            <th className="p-2 font-semibold">Email</th>
            <th className="p-2 font-semibold">Date</th>
            <th className="p-2 font-semibold text-right">Total</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.invoiceNumber} className="border-t">
              <td className="p-2">
                <input
                  type="checkbox"
                  aria-label={`Tick ${inv.invoiceNumber}`}
                  checked={checked.has(inv.invoiceNumber)}
                  onChange={() => toggle(inv.invoiceNumber)}
                  className="h-4 w-4 accent-[#2D4A32] cursor-pointer"
                />
              </td>
              <td className="p-2 font-mono font-bold">{inv.invoiceNumber}</td>
              <td className="p-2">{inv.customerName || '—'}</td>
              <td className="p-2 text-[#4A4A4A]">{inv.customerEmail}</td>
              <td className="p-2 text-[#4A4A4A] whitespace-nowrap">{inv.invoiceDate || '—'}</td>
              <td className="p-2 text-right font-semibold">${inv.total.toFixed(2)}</td>
              <td className="p-2 text-right">
                <ImportMissing invoice={inv} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
