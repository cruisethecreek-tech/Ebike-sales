'use server'

import { createClient } from '@/lib/supabase/server'
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
  const label = String(formData.get('label') ?? '').trim() || null
  const simIccid = String(formData.get('sim_iccid') ?? '').replace(/\s+/g, '') || null

  if (!id) fail('Missing tracker.')
  if (!/^[0-9]{15}$/.test(imei)) fail('IMEI must be exactly 15 digits (it is on the tracker label).')
  if (!bikeField) fail('Pick a bike, or "No bike" to keep it on the shelf.')

  const supabase = await createClient()
  const { error } = await supabase
    .from('trackers')
    .update({ imei, bike_id: bikeField === 'none' ? null : bikeField, label, sim_iccid: simIccid })
    .eq('id', id)

  if (error) {
    fail(error.code === '23505' ? 'Another tracker already has that IMEI or is on that bike.' : error.message)
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
