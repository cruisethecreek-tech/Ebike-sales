'use client'

import { useActionState, useState, useEffect } from 'react'
import Link from 'next/link'
import { updateBikeSerial } from './actions'

interface BikeProps {
  id: string
  serial_number: string | null
  receipt_number?: string | null
  brand: string
  model: string
}

export function SerialNumberEditor({ bike }: { bike: BikeProps }) {
  const [isEditing, setIsEditing] = useState(false)
  const [currentSerial, setCurrentSerial] = useState(bike.serial_number || '')
  const [state, formAction, isPending] = useActionState(updateBikeSerial, null)

  useEffect(() => {
    if (state?.success) {
      setCurrentSerial(state.serial_number || '')
      setIsEditing(false)
    }
  }, [state])

  return (
    <div className="space-y-2">
      {/* ── Serial Number Slot ── */}
      {isEditing ? (
        <form action={formAction} className="p-3 bg-white border-2 border-[#2D4A32] rounded-xl space-y-2 animate-fadeIn">
          <input type="hidden" name="bike_id" value={bike.id} />
          <div className="flex justify-between items-center">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#1A2E1C]">
              Frame Serial Number
            </label>
            <span className="text-[10px] text-gray-500">(Located under bottom bracket or on frame badge)</span>
          </div>

          <div className="flex gap-2 items-center">
            <input
              type="text"
              name="serial_number"
              defaultValue={currentSerial}
              placeholder="e.g. SN12345678 or VT-98765"
              autoFocus
              className="flex-1 px-3 py-1.5 border border-[#C9A96E] rounded-lg text-xs font-mono uppercase font-bold text-[#1A2E1C] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2D4A32]"
            />
            <button
              type="submit"
              disabled={isPending}
              className="px-3.5 py-1.5 bg-[#2D4A32] text-white text-xs font-bold rounded-lg hover:bg-[#1A2E1C] transition-colors shadow-xs"
            >
              {isPending ? 'Saving...' : 'Save 💾'}
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-800 font-semibold"
            >
              Cancel
            </button>
          </div>

          {state?.error && (
            <p className="text-[11px] text-red-600 font-semibold">{state.error}</p>
          )}
        </form>
      ) : currentSerial ? (
        <div className="p-3 bg-[#FBF7EF] border border-[#C9A96E]/50 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#8A6D3B] block">
              🔢 Frame Serial Number
            </span>
            <span className="text-xs font-mono font-bold text-[#1A2E1C] tracking-wide">
              {currentSerial}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="text-[11px] font-bold text-[#2D4A32] hover:text-[#1A2E1C] bg-white border border-[#2D4A32]/20 px-2.5 py-1 rounded-md shadow-2xs hover:bg-[#F5F0E8] transition-colors"
          >
            ✏️ Edit Serial #
          </button>
        </div>
      ) : (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1.5">
          <div className="flex items-center justify-between flex-wrap gap-1">
            <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
              ⚠️ Serial Number Missing
            </span>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="text-[11px] font-bold text-[#2D4A32] bg-white border border-[#2D4A32]/30 px-2.5 py-1 rounded-md shadow-2xs hover:bg-[#FAF8F2] transition-colors"
            >
              + Enter Serial Number
            </button>
          </div>
          <p className="text-[11px] text-amber-800 leading-tight">
            Enter your bike's serial number so it's permanently logged on file for manufacturer warranty claims, theft protection, and Creek Ready servicing.
          </p>
        </div>
      )}

      {/* ── Receipt / Invoice Slot (if present) ── */}
      {bike.receipt_number && (
        <div className="p-2.5 bg-[#F5F0E8] border border-[#E5E5E5] rounded-xl flex items-center justify-between text-xs">
          <div>
            <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider block">
              🧾 Official Receipt / Invoice
            </span>
            <span className="font-mono font-bold text-[#2D4A32]">
              {bike.receipt_number}
            </span>
          </div>
          <Link
            href={`/dashboard/invoices/${bike.receipt_number}`}
            className="text-[11px] font-bold text-[#2D4A32] hover:underline flex items-center gap-1"
          >
            View Customer Receipt ↗
          </Link>
        </div>
      )}
    </div>
  )
}
