'use client'

import { useState, useTransition } from 'react'
import { setBikeShopInvoice } from './look-actions'

/**
 * Staff-only: the bike's shop invoice link, on My Bikes. Customers never see
 * it (it is the shop's purchase record). Same field as Admin > Customers.
 */
export function ShopInvoiceEditor({ bikeId, current }: { bikeId: string; current: string | null }) {
  const [saved, setSaved] = useState(current || '')
  const [value, setValue] = useState(current || '')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()

  const save = () =>
    start(async () => {
      try {
        const r = await setBikeShopInvoice(bikeId, value)
        setMessage({ ok: r.ok, text: r.message })
        if (r.ok) setSaved(value.trim())
      } catch {
        setMessage({ ok: false, text: 'Could not save. Check your connection and try again.' })
      }
    })

  return (
    <div className="p-3 rounded-xl border border-dashed border-[#C9A96E] bg-[#FBF7EF] space-y-1.5 text-xs">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-bold uppercase text-[#2D4A32] tracking-wider">
          🔗 Shop invoice link <span className="normal-case font-semibold text-gray-500">(staff only)</span>
        </span>
        {saved ? (
          <a href={saved} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#2D4A32] font-bold hover:underline">
            Open shop invoice ↗
          </a>
        ) : (
          <span className="text-[10px] text-gray-500">None on file</span>
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="url"
          value={value}
          onChange={(e) => { setValue(e.target.value); setMessage(null) }}
          placeholder="Paste the Shop.com order link"
          className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-[#C9A96E] bg-white text-xs placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2D4A32]"
        />
        <button
          type="button"
          onClick={save}
          disabled={pending || value.trim() === saved}
          className="px-3 py-1 bg-[#2D4A32] text-white text-xs font-bold rounded-lg hover:bg-[#1A2E1C] disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
      {message && (
        <p className={message.ok ? 'text-green-700 font-bold' : 'text-red-700 font-bold'}>{message.text}</p>
      )}
    </div>
  )
}
