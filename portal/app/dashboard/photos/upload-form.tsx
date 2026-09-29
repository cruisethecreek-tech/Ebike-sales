'use client'

import { useActionState, useState } from 'react'
import { uploadRidePhoto, type PhotoResult } from './actions'
import { CONSENT_TEXT, MAX_PHOTO_BYTES } from '@/lib/ride-photos'

type BikeOption = { id: string; label: string }

/**
 * Phone photos are 3–12 MB; the server takes under 4. Shrink to 2000px on the
 * long side as a JPEG before sending, which also drops the location data
 * phones embed in the original. If the browser cannot read the file (some
 * HEIC photos), send it as it is and let the size check decide.
 */
async function shrink(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
    if (!blob) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

export function UploadForm({ bikes }: { bikes: BikeOption[] }) {
  const [state, action, pending] = useActionState<PhotoResult | null, FormData>(uploadRidePhoto, null)
  const [preview, setPreview] = useState<string | null>(null)
  const [prepError, setPrepError] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setPrepError(null)
    const picked = e.target.files?.[0]
    if (!picked) { setPreview(null); return }
    setPreparing(true)
    const small = await shrink(picked)
    setPreparing(false)
    if (small.size > MAX_PHOTO_BYTES) {
      setPrepError('That photo is too large to upload. Try a screenshot of it, or a different photo.')
      e.target.value = ''
      setPreview(null)
      return
    }
    // Swap the chosen file for the shrunk one, so the form sends that.
    const dt = new DataTransfer()
    dt.items.add(small)
    e.target.files = dt.files
    setPreview(URL.createObjectURL(small))
  }

  // The form resets itself after sending; the preview has to be cleared too.
  const submit = (fd: FormData) => { setPreview(null); action(fd) }

  return (
    <form
      action={submit}
      className="bg-white rounded-2xl p-6 border border-[#E5E5E5] shadow-sm space-y-4"
    >
      <h2 className="uppercase tracking-wide text-2xl text-[#1A2E1C]" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
        📸 Share a ride photo
      </h2>

      <label className="block">
        <span className="label">Photo</span>
        <input
          type="file"
          name="photo"
          accept="image/jpeg,image/png,image/webp,image/heic"
          required
          onChange={onPick}
          className="block w-full text-sm mt-1"
        />
      </label>
      {preparing && <p className="text-xs text-gray-500">Preparing photo…</p>}
      {prepError && <p className="text-xs text-red-700">{prepError}</p>}
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Your photo" className="max-h-64 rounded-xl border border-[#E5E5E5]" />
      )}

      {bikes.length > 0 && (
        <label className="block">
          <span className="label">Which bike? (optional)</span>
          <select name="bike_id" className="select w-full mt-1" defaultValue="">
            <option value="">Not saying</option>
            {bikes.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </label>
      )}

      <label className="block">
        <span className="label">Tell us about the ride (optional)</span>
        <textarea
          name="caption"
          rows={3}
          maxLength={600}
          placeholder="Where you went, who came along, what you loved about it…"
          className="input w-full mt-1"
        />
      </label>

      <label className="flex items-start gap-3 p-3 rounded-xl bg-[#F5F0E8] border border-[#E5E5E5] text-xs text-[#1A2E1C] cursor-pointer">
        <input type="checkbox" name="consent" value="yes" className="mt-0.5 w-4 h-4 shrink-0" />
        <span>
          <strong>Yes, Cruise the Creek may feature this.</strong> {CONSENT_TEXT}
        </span>
      </label>
      <p className="text-[11px] text-gray-500 -mt-2">
        Leave it unticked and the photo stays private to you and the shop.
      </p>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending || preparing} className="btn-primary text-sm px-5 py-2 disabled:opacity-50">
          {pending ? 'Uploading…' : 'Share photo'}
        </button>
        {state && <span className={`text-xs ${state.ok ? 'text-[#15803D]' : 'text-red-700'}`}>{state.message}</span>}
      </div>
    </form>
  )
}
