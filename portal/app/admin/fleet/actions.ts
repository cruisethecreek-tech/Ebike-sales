'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAdminUser } from '@/lib/require-admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// Both actions run on the caller's own session, not the service role: the
// trackers and tracker_alerts policies already limit writes to admins, and
// requireAdminUser() turns a non-admin call into a clear error up front.

export async function registerTracker(formData: FormData): Promise<void> {
  await requireAdminUser()

  const imei = String(formData.get('imei') ?? '').replace(/\s+/g, '')
  const bikeId = String(formData.get('bike_id') ?? '')
  const label = String(formData.get('label') ?? '').trim() || null
  const simIccid = String(formData.get('sim_iccid') ?? '').replace(/\s+/g, '') || null

  if (!/^[0-9]{15}$/.test(imei)) {
    redirect('/admin/fleet?error=' + encodeURIComponent('IMEI must be exactly 15 digits (it is on the tracker label).'))
  }
  if (!bikeId) {
    redirect('/admin/fleet?error=' + encodeURIComponent('Pick the bike this tracker is fitted to.'))
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('trackers')
    .insert({ imei, bike_id: bikeId, label, sim_iccid: simIccid })

  if (error) {
    const message = error.code === '23505'
      ? 'That IMEI or bike already has a tracker.'
      : error.message
    redirect('/admin/fleet?error=' + encodeURIComponent(message))
  }

  revalidatePath('/admin/fleet')
  redirect('/admin/fleet?added=1')
}

export async function acknowledgeAlert(formData: FormData): Promise<void> {
  await requireAdminUser()

  const id = Number(formData.get('id'))
  if (!Number.isInteger(id)) return

  const supabase = await createClient()
  await supabase
    .from('tracker_alerts')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('id', id)

  revalidatePath('/admin/fleet')
}
