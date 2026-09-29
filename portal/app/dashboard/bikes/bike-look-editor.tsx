'use client'

import { useState, useTransition } from 'react'
import { setBikeLook } from './look-actions'
import type { CatalogModel } from '@/lib/bike-catalog'

type Props = {
  bikeId: string
  /** Catalogue models of this bike's brand. */
  models: CatalogModel[]
  /** Best guess at which model and colour this bike is, from its typed name. */
  suggestedModelKey: string | null
  suggestedColor: string | null
  current: { name: string | null; hex: string | null }
}

/**
 * Staff-only: pick the bike's colour from the shop catalogue, so the customer
 * sees the right product photo and swatch on My Bikes. Shown on the page only
 * when the signed-in person is an admin (usually while previewing a customer).
 */
export function BikeLookEditor({ bikeId, models, suggestedModelKey, suggestedColor, current }: Props) {
  const [open, setOpen] = useState(false)
  const [modelKey, setModelKey] = useState(suggestedModelKey ?? models[0]?.key ?? '')
  const [colorName, setColorName] = useState<string | null>(suggestedColor)
  const [custom, setCustom] = useState(models.length === 0)
  const [customName, setCustomName] = useState(current.name ?? '')
  const [customHex, setCustomHex] = useState(current.hex ?? '#2D4A32')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()

  const model = models.find((m) => m.key === modelKey)

  const save = (pick: Parameters<typeof setBikeLook>[1]) =>
    start(async () => {
      const r = await setBikeLook(bikeId, pick)
      setMessage({ ok: r.ok, text: r.message })
      if (r.ok) setOpen(false)
    })

  if (!open) {
    return (
      <div className="flex items-center gap-2 text-[11px]">
        <button
          type="button"
          onClick={() => { setOpen(true); setMessage(null) }}
          className="px-2.5 py-1 rounded-lg border border-dashed border-[#9484B8] text-[#5B4B86] font-bold hover:bg-[#F3EFFA]"
        >
          🎨 {current.name ? 'Change bike colour' : 'Set bike colour'} (staff)
        </button>
        {message && <span className={message.ok ? 'text-[#15803D]' : 'text-red-700'}>{message.text}</span>}
      </div>
    )
  }

  return (
    <div className="p-3 rounded-xl border border-[#9484B8]/50 bg-[#F8F6FC] space-y-3 text-xs">
      <div className="flex justify-between items-center">
        <span className="font-bold text-[#5B4B86]">🎨 Bike colour · staff only</span>
        <button type="button" onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-800">Close</button>
      </div>

      {models.length > 0 && (
        <div className="flex gap-2">
          <button type="button" onClick={() => setCustom(false)}
            className={`px-2 py-1 rounded ${!custom ? 'bg-[#5B4B86] text-white' : 'bg-white border'}`}>
            From the shop catalogue
          </button>
          <button type="button" onClick={() => setCustom(true)}
            className={`px-2 py-1 rounded ${custom ? 'bg-[#5B4B86] text-white' : 'bg-white border'}`}>
            Colour not listed
          </button>
        </div>
      )}

      {!custom && model ? (
        <>
          <label className="block">
            <span className="text-gray-600">Model</span>
            <select
              value={modelKey}
              onChange={(e) => { setModelKey(e.target.value); setColorName(null) }}
              className="select w-full mt-1 text-xs"
            >
              {models.map((m) => (
                <option key={m.key} value={m.key}>{m.name}</option>
              ))}
            </select>
          </label>

          {model.colors.length === 0 ? (
            <p className="text-gray-500">This model has no colours in the catalogue. Use &quot;Colour not listed&quot;.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {model.colors.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => setColorName(c.name)}
                  aria-pressed={colorName === c.name}
                  className={`rounded-lg border bg-white p-1.5 text-left transition ${
                    colorName === c.name ? 'border-[#5B4B86] ring-2 ring-[#9484B8]' : 'border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {c.img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.img} alt="" className="w-full h-14 object-contain" loading="lazy" />
                  ) : (
                    <div className="w-full h-14" />
                  )}
                  <span className="flex items-center gap-1 mt-1 leading-tight">
                    <span
                      className="inline-block w-3 h-3 rounded-full border border-black/20 shrink-0"
                      style={c.hex ? { backgroundColor: c.hex } : { background: 'repeating-linear-gradient(135deg,#E8E4DC 0 3px,#D2CCC0 3px 6px)' }}
                    />
                    <span className="truncate">{c.name}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!colorName || pending}
              onClick={() => colorName && save({ kind: 'catalog', modelKey, colorName })}
              className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Save colour'}
            </button>
            {current.name && (
              <button type="button" disabled={pending} onClick={() => save({ kind: 'clear' })}
                className="text-gray-500 underline">Clear</button>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <p className="text-gray-600">For a model or colour the shop no longer lists. Shows a swatch, with no photo.</p>
          <div className="flex items-end gap-2">
            <label className="flex-1">
              <span className="text-gray-600">Colour name</span>
              <input value={customName} onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Lemans Blue" className="input w-full mt-1 text-xs" />
            </label>
            <label>
              <span className="text-gray-600 block">Swatch</span>
              <input type="color" value={customHex} onChange={(e) => setCustomHex(e.target.value)}
                className="h-9 w-12 mt-1 rounded border" />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" disabled={pending || !customName.trim()}
              onClick={() => save({ kind: 'custom', colorName: customName, colorHex: customHex })}
              className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50">
              {pending ? 'Saving…' : 'Save colour'}
            </button>
            {current.name && (
              <button type="button" disabled={pending} onClick={() => save({ kind: 'clear' })}
                className="text-gray-500 underline">Clear</button>
            )}
          </div>
        </div>
      )}

      {message && <p className={message.ok ? 'text-[#15803D]' : 'text-red-700'}>{message.text}</p>}
    </div>
  )
}
