'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getViewerContext } from '@/lib/view-as'
import {
  RIDE_PHOTOS_BUCKET, MAX_PHOTO_BYTES, ALLOWED_PHOTO_TYPES, consentRecord,
} from '@/lib/ride-photos'

export type PhotoResult = { ok: boolean; message: string }

/**
 * The signed-in customer, and only them. Staff previewing someone's portal
 * are refused: a photo, and consent to use it, can only come from its owner.
 */
async function realCustomer(): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Please sign in again.' }
  const { viewingAs } = await getViewerContext()
  if (viewingAs) return { error: `You're previewing ${viewingAs.name}'s portal. Only they can share or change their photos.` }
  return { id: user.id }
}

async function ownPhoto(customerId: string, photoId: string) {
  const admin = createServiceClient()
  const { data } = await admin
    .from('community_photos')
    .select('id, customer_id, storage_path, marketing_consent')
    .eq('id', photoId)
    .maybeSingle()
  return data && data.customer_id === customerId ? data : null
}

export async function uploadRidePhoto(_prev: PhotoResult | null, formData: FormData): Promise<PhotoResult> {
  const me = await realCustomer()
  if ('error' in me) return { ok: false, message: me.error }

  const file = formData.get('photo')
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'Choose a photo first.' }
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) return { ok: false, message: 'Please use a JPG, PNG or WebP photo.' }
  if (file.size > MAX_PHOTO_BYTES) return { ok: false, message: 'That photo is too large. Try a smaller one.' }

  const caption = String(formData.get('caption') || '').trim().slice(0, 600) || null
  const consent = formData.get('consent') === 'yes'
  const admin = createServiceClient()

  // A bike can only be tagged if it is theirs.
  let bikeId: string | null = String(formData.get('bike_id') || '').trim() || null
  if (bikeId) {
    const { data: bike } = await admin.from('bikes').select('customer_id').eq('id', bikeId).maybeSingle()
    if (bike?.customer_id !== me.id) bikeId = null
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${me.id}/${randomUUID()}.${ext}`
  const { error: upErr } = await admin.storage
    .from(RIDE_PHOTOS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (upErr) return { ok: false, message: 'The upload failed: ' + upErr.message }

  const now = new Date().toISOString()
  const { error: rowErr } = await admin.from('community_photos').insert({
    customer_id: me.id,
    storage_path: path,
    bike_id: bikeId,
    caption,
    marketing_consent: consent,
    consent_text: consent ? consentRecord() : null,
    consented_at: consent ? now : null,
    review_status: 'new',
  })
  if (rowErr) {
    // Never leave a file behind with no record of who it belongs to.
    await admin.storage.from(RIDE_PHOTOS_BUCKET).remove([path])
    return { ok: false, message: 'The photo could not be saved: ' + rowErr.message }
  }

  revalidatePath('/dashboard/photos')
  revalidatePath('/admin/photos')
  return {
    ok: true,
    message: consent
      ? 'Thanks for sharing! We may feature it once the team has had a look.'
      : 'Saved to your photos. It stays private; tick the permission box on a new upload if you’d like us to feature one.',
  }
}

export async function withdrawConsent(formData: FormData): Promise<void> {
  const me = await realCustomer()
  if ('error' in me) return
  const photo = await ownPhoto(me.id, String(formData.get('photo_id') || ''))
  if (!photo || !photo.marketing_consent) return
  await createServiceClient()
    .from('community_photos')
    .update({ marketing_consent: false, consent_withdrawn_at: new Date().toISOString(), review_status: 'hidden' })
    .eq('id', photo.id)
  revalidatePath('/dashboard/photos')
  revalidatePath('/admin/photos')
}

export async function deleteRidePhoto(formData: FormData): Promise<void> {
  const me = await realCustomer()
  if ('error' in me) return
  const photo = await ownPhoto(me.id, String(formData.get('photo_id') || ''))
  if (!photo) return
  const admin = createServiceClient()
  if (photo.storage_path) await admin.storage.from(RIDE_PHOTOS_BUCKET).remove([photo.storage_path])
  await admin.from('community_photos').delete().eq('id', photo.id)
  revalidatePath('/dashboard/photos')
  revalidatePath('/admin/photos')
}
