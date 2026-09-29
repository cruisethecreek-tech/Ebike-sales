import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdminUser } from '@/lib/require-admin'
import { RIDE_PHOTOS_BUCKET, SIGNED_URL_SECONDS } from '@/lib/ride-photos'
import { setPhotoReview } from './actions'

export const dynamic = 'force-dynamic'

type Filter = 'ready' | 'approved' | 'all'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'ready', label: 'OK to use, not reviewed' },
  { key: 'approved', label: 'Approved for marketing' },
  { key: 'all', label: 'All photos' },
]

export default async function AdminPhotos({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireAdminUser()
  const { show } = await searchParams
  const filter: Filter = show === 'approved' || show === 'all' ? show : 'ready'

  const admin = createServiceClient()
  let q = admin
    .from('community_photos')
    .select('id, customer_id, storage_path, caption, bike_id, marketing_consent, consent_text, consented_at, consent_withdrawn_at, review_status, created_at, customers(first_name, last_name), bikes(brand, model, color_name)')
    .order('created_at', { ascending: false })
    .limit(200)
  if (filter === 'ready') q = q.eq('marketing_consent', true).eq('review_status', 'new')
  if (filter === 'approved') q = q.eq('marketing_consent', true).eq('review_status', 'approved')
  const { data: rows, error } = await q

  const paths = (rows || []).map((r) => r.storage_path).filter(Boolean) as string[]
  const view = new Map<string, string>()
  const download = new Map<string, string>()
  if (paths.length) {
    const bucket = admin.storage.from(RIDE_PHOTOS_BUCKET)
    const [{ data: v }, { data: d }] = await Promise.all([
      bucket.createSignedUrls(paths, SIGNED_URL_SECONDS),
      bucket.createSignedUrls(paths, SIGNED_URL_SECONDS, { download: true }),
    ])
    for (const s of v || []) if (s.path && s.signedUrl) view.set(s.path, s.signedUrl)
    for (const s of d || []) if (s.path && s.signedUrl) download.set(s.path, s.signedUrl)
  }

  return (
    <div className="space-y-6 w-full max-w-full">
      <div>
        <h1 className="uppercase tracking-wide text-3xl text-[#1A2E1C]" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.04em' }}>
          📸 Ride Photos
        </h1>
        <p className="text-xs text-[#4A4A4A]">
          Photos customers shared from their portal. Only use a photo in marketing while it shows &quot;OK to use&quot;;
          customers can withdraw permission at any time.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/admin/photos?show=${f.key}`}
            className={`px-3 py-1.5 rounded-full border ${filter === f.key ? 'bg-[#2D4A32] text-white border-[#2D4A32]' : 'bg-white border-[#E5E5E5]'}`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {error && <p className="text-sm text-red-700">Could not load photos: {error.message}</p>}
      {!error && (rows || []).length === 0 && <p className="text-sm text-gray-500">Nothing here yet.</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {(rows || []).map((p) => {
          const c = Array.isArray(p.customers) ? p.customers[0] : p.customers
          const b = Array.isArray(p.bikes) ? p.bikes[0] : p.bikes
          const name = [c?.first_name, c?.last_name].filter(Boolean).join(' ') || 'Customer'
          const url = p.storage_path ? view.get(p.storage_path) : undefined
          const dl = p.storage_path ? download.get(p.storage_path) : undefined
          return (
            <div key={p.id} className="bg-white rounded-2xl border border-[#E5E5E5] shadow-sm overflow-hidden flex flex-col">
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={p.caption || 'Ride photo'} className="w-full h-56 object-cover bg-[#F5F0E8]" />
              ) : (
                <div className="w-full h-56 bg-[#F5F0E8]" />
              )}
              <div className="p-4 space-y-2 text-xs flex-1 flex flex-col">
                <p className="font-bold text-[#1A2E1C]">{name}</p>
                {b && <p className="text-gray-500">🚲 {[b.brand, b.model, b.color_name && `(${b.color_name})`].filter(Boolean).join(' ')}</p>}
                {p.caption && <p className="text-[#1A2E1C] text-sm">&ldquo;{p.caption}&rdquo;</p>}

                {p.marketing_consent ? (
                  <p className="text-[#15803D] font-bold" title={p.consent_text || ''}>
                    ✓ OK to use · agreed {p.consented_at ? new Date(p.consented_at).toLocaleDateString() : ''}
                  </p>
                ) : p.consent_withdrawn_at ? (
                  <p className="text-red-700 font-bold">✕ Permission withdrawn {new Date(p.consent_withdrawn_at).toLocaleDateString()}. Do not use.</p>
                ) : (
                  <p className="text-gray-500 font-bold">Private: no permission to use</p>
                )}
                <p className="text-gray-400">
                  Shared {new Date(p.created_at).toLocaleDateString()} · {p.review_status === 'approved' ? 'Approved' : p.review_status === 'hidden' ? 'Hidden' : 'Not reviewed'}
                </p>

                <div className="mt-auto pt-2 flex flex-wrap gap-2">
                  {p.marketing_consent && p.review_status !== 'approved' && (
                    <form action={setPhotoReview}>
                      <input type="hidden" name="photo_id" value={p.id} />
                      <input type="hidden" name="status" value="approved" />
                      <button className="btn-primary text-xs px-3 py-1.5">Approve for marketing</button>
                    </form>
                  )}
                  {p.review_status !== 'hidden' && (
                    <form action={setPhotoReview}>
                      <input type="hidden" name="photo_id" value={p.id} />
                      <input type="hidden" name="status" value="hidden" />
                      <button className="px-3 py-1.5 rounded-lg border text-xs">Hide</button>
                    </form>
                  )}
                  {dl && p.marketing_consent && (
                    <a href={dl} className="px-3 py-1.5 rounded-lg border text-xs">⬇ Download</a>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
