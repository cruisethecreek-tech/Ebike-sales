'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminUser } from '@/lib/require-admin'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Mark a ride photo approved for marketing, or hide it. Approval requires the
 * customer's consent to still be in place; a photo whose consent was
 * withdrawn can only be hidden.
 */
export async function setPhotoReview(formData: FormData): Promise<void> {
  await requireAdminUser()
  const id = String(formData.get('photo_id') || '')
  const status = String(formData.get('status') || '')
  if (!id || !['new', 'approved', 'hidden'].includes(status)) return

  const admin = createServiceClient()
  let q = admin.from('community_photos').update({ review_status: status }).eq('id', id)
  if (status === 'approved') q = q.eq('marketing_consent', true)
  await q
  revalidatePath('/admin/photos')
  revalidatePath('/dashboard/photos')
}
