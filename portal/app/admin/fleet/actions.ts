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

/**
 * Move a tracker onto a different bike, or off every bike.
 *
 * The hardware outlives the bike it is bolted to. A rental gets sold, a bike
 * is written off, a customer trades up — and until now the only way to follow
 * that was to delete the tracker and register it again, which loses its
 * history. bike_id was always meant to move: it is nullable so a tracker can
 * sit on the shelf between bikes.
 *
 * What the new owner can see is already handled by the database and must stay
 * that way. `trackers_touch_assigned_at` pushes assigned_at forward whenever
 * bike_id changes, and the positions policy only lets a customer read fixes
 * from `tracker_visible_since` onward — so a transfer draws a line under the
 * previous rider's history rather than handing it to the next one. Nothing
 * here may write assigned_at itself, or that line moves with it.
 */
export async function transferTracker(formData: FormData): Promise<void> {
  await requireAdminUser()

  const trackerId = String(formData.get('tracker_id') ?? '')
  // "Back on the shelf" and an empty pick both mean no bike. A select cannot
  // submit an empty value from a disabled placeholder, so the shelf carries its
  // own sentinel rather than relying on the browser to send "".
  const picked = String(formData.get('bike_id') ?? '')
  const bikeId = picked && picked !== '__shelf__' ? picked : null

  if (!trackerId) {
    redirect('/admin/fleet?error=' + encodeURIComponent('No tracker was named for the transfer.'))
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('trackers')
    .update({ bike_id: bikeId })
    .eq('id', trackerId)

  if (error) {
    const message = error.code === '23505'
      ? 'That bike already has a tracker on it. Move the other one off first.'
      : error.message
    redirect('/admin/fleet?error=' + encodeURIComponent(message))
  }

  revalidatePath('/admin/fleet')
  // The customer's own page shows the bike's location, so it has to be told too.
  revalidatePath('/dashboard/bikes')
  redirect('/admin/fleet?moved=' + (bikeId ? '1' : 'shelf'))
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
