import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getViewerContext } from '@/lib/view-as'
import { RIDE_PHOTOS_BUCKET, SIGNED_URL_SECONDS } from '@/lib/ride-photos'
import { UploadForm } from './upload-form'
import { withdrawConsent, deleteRidePhoto } from './actions'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'My Ride Photos — Cruise the Creek',
}

type Row = {
  id: string
  storage_path: string | null
  caption: string | null
  bike_id: string | null
  marketing_consent: boolean
  consented_at: string | null
  consent_withdrawn_at: string | null
  review_status: 'new' | 'approved' | 'hidden'
  created_at: string
}

export default async function PhotosPage() {
  const supabase = await createClient()
  const { userId, viewingAs } = await getViewerContext()

  let photos: (Row & { url: string | null })[] = []
  let bikes: { id: string; label: string }[] = []

  if (userId) {
    const [{ data: rows }, { data: bikeRows }] = await Promise.all([
      supabase
        .from('community_photos')
        .select('id, storage_path, caption, bike_id, marketing_consent, consented_at, consent_withdrawn_at, review_status, created_at')
        .eq('customer_id', userId)
        .order('created_at', { ascending: false }),
      supabase.from('bikes').select('id, brand, model, color_name').eq('customer_id', userId),
    ])

    bikes = (bikeRows || []).map((b) => ({
      id: b.id,
      label: [b.brand, b.model, b.color_name ? `(${b.color_name})` : ''].filter(Boolean).join(' '),
    }))

    // The bucket is private: short-lived links, made only after RLS has
    // already limited the rows to this customer's own.
    const paths = (rows || []).map((r) => r.storage_path).filter(Boolean) as string[]
    const urls = new Map<string, string>()
    if (paths.length) {
      const { data: signed } = await createServiceClient()
        .storage.from(RIDE_PHOTOS_BUCKET)
        .createSignedUrls(paths, SIGNED_URL_SECONDS)
      for (const s of signed || []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl)
    }
    photos = (rows || []).map((r) => ({ ...(r as Row), url: r.storage_path ? urls.get(r.storage_path) ?? null : null }))
  }

  const bikeLabel = new Map(bikes.map((b) => [b.id, b.label]))

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-16">
      <div>
        <h1 className="uppercase tracking-wide text-4xl text-[#2D4A32] mb-1" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
          📸 My Ride Photos
        </h1>
        <p className="text-sm text-[#4A4A4A]">
          Share your favorite shots from the trail. With your permission, we may feature them on our social media.
        </p>
      </div>

      {viewingAs ? (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
          You&apos;re previewing {viewingAs.name}&apos;s portal. Only they can upload photos or change their permission.
        </div>
      ) : (
        <UploadForm bikes={bikes} />
      )}

      {photos.length === 0 ? (
        <p className="text-sm text-gray-500">No photos yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {photos.map((p) => (
            <div key={p.id} className="bg-white rounded-2xl border border-[#E5E5E5] shadow-sm overflow-hidden flex flex-col">
              {p.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.url} alt={p.caption || 'Ride photo'} className="w-full h-52 object-cover bg-[#F5F0E8]" />
              ) : (
                <div className="w-full h-52 bg-[#F5F0E8]" />
              )}
              <div className="p-4 space-y-2 text-xs flex-1 flex flex-col">
                {p.caption && <p className="text-[#1A2E1C] text-sm">{p.caption}</p>}
                {p.bike_id && bikeLabel.get(p.bike_id) && <p className="text-gray-500">🚲 {bikeLabel.get(p.bike_id)}</p>}
                <p className="text-gray-400">{new Date(p.created_at).toLocaleDateString()}</p>

                <div className="mt-auto pt-2 space-y-2">
                  {p.marketing_consent ? (
                    <p className="text-[#15803D] font-bold">
                      ✓ OK to feature{p.review_status === 'approved' ? ' · Picked for our socials' : ''}
                    </p>
                  ) : p.consent_withdrawn_at ? (
                    <p className="text-gray-500">Permission withdrawn {new Date(p.consent_withdrawn_at).toLocaleDateString()}</p>
                  ) : (
                    <p className="text-gray-500">Private to you and the shop</p>
                  )}

                  {!viewingAs && (
                    <div className="flex gap-3">
                      {p.marketing_consent && (
                        <form action={withdrawConsent}>
                          <input type="hidden" name="photo_id" value={p.id} />
                          <button type="submit" className="underline text-[#B45309]">Withdraw permission</button>
                        </form>
                      )}
                      <form action={deleteRidePhoto}>
                        <input type="hidden" name="photo_id" value={p.id} />
                        <button type="submit" className="underline text-red-700">Delete</button>
                      </form>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
