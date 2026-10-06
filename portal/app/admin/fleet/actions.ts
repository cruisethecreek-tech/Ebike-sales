'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdminUser } from '@/lib/require-admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// Every action runs on the caller's own session, not the service role: the
// trackers and tracker_alerts policies already limit writes to admins, and
// requireAdminUser() turns a non-admin call into a clear error up front.

export async function registerTracker(formData: FormData): Promise<void> {
  await requireAdminUser()

  const imei = String(formData.get('imei') ?? '').replace(/\s+/g, '')
  const bikeId = String(formData.get('bike_id') ?? '')
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
    .insert({ imei, bike_id: bikeId, sim_iccid: simIccid })

  if (error) {
    const message = error.code === '23505'
      ? 'That IMEI or bike already has a tracker. A retired tracker is put back from Retired Trackers below.'
      : error.message
    redirect('/admin/fleet?error=' + encodeURIComponent(message))
  }

  revalidatePath('/admin/fleet')
  redirect('/admin/fleet?added=1')
}

function fail(message: string): never {
  redirect('/admin/fleet?manage_error=' + encodeURIComponent(message) + '#manage')
}

function done(notice: string): never {
  revalidatePath('/admin/fleet')
  redirect('/admin/fleet?notice=' + encodeURIComponent(notice) + '#manage')
}

// Edit or move a tracker. Moving it to another bike resets assigned_at (the
// trackers_touch_assigned_at trigger), so the new bike's owner never sees the
// old bike's history. bike_id "none" keeps the tracker active with no bike,
// for a tracker sitting on the shelf between bikes.
export async function updateTracker(formData: FormData): Promise<void> {
  await requireAdminUser()

  const id = String(formData.get('id') ?? '')
  const imei = String(formData.get('imei') ?? '').replace(/\s+/g, '')
  const bikeField = String(formData.get('bike_id') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  const simIccid = String(formData.get('sim_iccid') ?? '').replace(/\s+/g, '') || null

  if (!id) fail('Missing tracker.')
  if (!/^[0-9]{15}$/.test(imei)) fail('IMEI must be exactly 15 digits (it is on the tracker label).')
  if (!bikeField) fail('Pick a bike, or "No bike" to keep it on the shelf.')

  const bikeId = bikeField === 'none' ? null : bikeField
  const supabase = await createClient()
  // Staff have no RLS update on bikes (owner only), so bike reads and the
  // rename go through the service client, after requireAdminUser above.
  const service = createServiceClient()

  const { data: current } = await supabase.from('trackers').select('bike_id').eq('id', id).maybeSingle()
  // On a bike, the name field is the bike's own name (bikes.model), so My
  // Bikes and Fleet GPS show the same thing. It only renames the bike the
  // tracker was already on: when moving a tracker, the field still shows the
  // old bike's name and must not be copied onto the new one.
  const renameBike = bikeId && bikeId === current?.bike_id ? name : ''

  // The label copies the bike's name, so theft pushes (traccar-ingest reads
  // the label first) and the retired list use it too. Off a bike, it is the
  // only name the tracker has.
  let label: string | null = name || null
  if (bikeId && !renameBike) {
    const { data: bike } = await service.from('bikes').select('model').eq('id', bikeId).maybeSingle()
    label = bike?.model ?? null
  }

  const { error } = await supabase
    .from('trackers')
    .update({ imei, bike_id: bikeId, label, sim_iccid: simIccid })
    .eq('id', id)

  if (error) {
    fail(error.code === '23505' ? 'Another tracker already has that IMEI or is on that bike.' : error.message)
  }

  if (renameBike && bikeId) {
    const { error: bikeError } = await service
      .from('bikes')
      .update({ model: renameBike })
      .eq('id', bikeId)
      .neq('model', renameBike)
    if (bikeError) fail(`Tracker saved, but the bike name was not changed: ${bikeError.message}`)
  }
  done('Tracker saved.')
}

// Retire: stop tracking but keep the history. The tracker leaves its bike (so
// the bike can take another tracker) and traccar-ingest ignores inactive
// trackers, so nothing new is recorded until it is put back.
export async function retireTracker(formData: FormData): Promise<void> {
  await requireAdminUser()

  const id = String(formData.get('id') ?? '')
  if (!id) fail('Missing tracker.')

  const supabase = await createClient()
  const { error } = await supabase
    .from('trackers')
    .update({ active: false, bike_id: null })
    .eq('id', id)

  if (error) fail(error.message)
  done('Tracker retired. Its history is kept, and it is listed under Retired Trackers.')
}

export async function restoreTracker(formData: FormData): Promise<void> {
  await requireAdminUser()

  const id = String(formData.get('id') ?? '')
  const bikeField = String(formData.get('bike_id') ?? '')
  if (!id) fail('Missing tracker.')
  if (!bikeField) fail('Pick the bike this tracker is going on, or "No bike".')

  const supabase = await createClient()
  const { error } = await supabase
    .from('trackers')
    .update({ active: true, bike_id: bikeField === 'none' ? null : bikeField })
    .eq('id', id)

  if (error) fail(error.code === '23505' ? 'That bike already has a tracker.' : error.message)
  done('Tracker put back in service.')
}

// Delete permanently, with every position and alert it ever recorded (the
// foreign keys cascade). Only offered for retired trackers, and the IMEI has
// to be typed back, so it is never one tap away.
export async function deleteTracker(formData: FormData): Promise<void> {
  await requireAdminUser()

  const id = String(formData.get('id') ?? '')
  const confirmImei = String(formData.get('confirm_imei') ?? '').replace(/\s+/g, '')
  if (!id) fail('Missing tracker.')

  const supabase = await createClient()
  const { data: tracker, error: readError } = await supabase
    .from('trackers')
    .select('imei, active')
    .eq('id', id)
    .maybeSingle()
  if (readError) fail(readError.message)
  if (!tracker) fail('That tracker no longer exists.')
  if (tracker.active) fail('Retire the tracker before deleting it.')
  if (confirmImei !== tracker.imei) fail('Type the full IMEI to confirm the delete.')

  const { error } = await supabase.from('trackers').delete().eq('id', id)
  if (error) fail(error.message)
  done('Tracker and its history deleted.')
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

// Lock a bike: its last known position becomes the lock point, and
// traccar-ingest raises a "Moved while locked" alert (with a phone push) once
// a good fix puts it more than 150 m away or riding faster than 10 km/h.
export async function lockTracker(formData: FormData): Promise<void> {
  await requireAdminUser()

  const id = String(formData.get('id') ?? '')
  if (!id) return

  const supabase = await createClient()
  const { data: latest } = await supabase
    .from('positions')
    .select('latitude, longitude')
    .eq('tracker_id', id)
    .order('fix_time', { ascending: false })
    .limit(1)
    .maybeSingle()

  await supabase
    .from('trackers')
    .update({
      locked_at: new Date().toISOString(),
      lock_latitude: latest?.latitude ?? null,
      lock_longitude: latest?.longitude ?? null,
    })
    .eq('id', id)

  revalidatePath('/admin/fleet')
}

export async function unlockTracker(formData: FormData): Promise<void> {
  await requireAdminUser()

  const id = String(formData.get('id') ?? '')
  if (!id) return

  const supabase = await createClient()
  await supabase
    .from('trackers')
    .update({ locked_at: null, lock_latitude: null, lock_longitude: null })
    .eq('id', id)

  revalidatePath('/admin/fleet')
}

// A cancelled or unpaid CreekGuard plan has been dealt with (tracker retired,
// SIM deactivated), so it leaves the list on Fleet GPS. The row stays as a
// record.
export async function markCreekguardOff(formData: FormData): Promise<void> {
  await requireAdminUser()

  const id = String(formData.get('id') ?? '')
  if (!id) return

  const supabase = await createClient()
  await supabase
    .from('creekguard_subscriptions')
    .update({ tracker_off_at: new Date().toISOString() })
    .eq('stripe_subscription_id', id)

  revalidatePath('/admin/fleet')
}
