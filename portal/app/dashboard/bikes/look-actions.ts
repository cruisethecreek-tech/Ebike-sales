'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAdminUser } from '@/lib/require-admin'
import { loadCatalog } from '@/lib/bike-catalog'
import { revalidatePath } from 'next/cache'

export type LookResult = { ok: boolean; message: string }

/**
 * Set which colour a customer's bike is. Staff only.
 *
 * A catalogue pick is looked up again here from the model key and colour
 * name, so the photo URL and hex saved are always the catalogue's own and
 * never whatever the browser sent. A colour the catalogue does not list
 * (older or sold-out models) is saved as a name and hex with no photo.
 */
export async function setBikeLook(
  bikeId: string,
  pick:
    | { kind: 'catalog'; modelKey: string; colorName: string }
    | { kind: 'custom'; colorName: string; colorHex: string }
    | { kind: 'clear' },
): Promise<LookResult> {
  await requireAdminUser()
  if (!bikeId) return { ok: false, message: 'No bike given.' }

  let patch: { color_name: string | null; color_hex: string | null; image_url: string | null }

  if (pick.kind === 'clear') {
    patch = { color_name: null, color_hex: null, image_url: null }
  } else if (pick.kind === 'custom') {
    const name = String(pick.colorName || '').trim().slice(0, 60)
    const hex = String(pick.colorHex || '').trim().toUpperCase()
    if (!name) return { ok: false, message: 'Give the colour a name.' }
    if (!/^#[0-9A-F]{6}$/.test(hex)) return { ok: false, message: 'Pick a colour for the swatch.' }
    patch = { color_name: name, color_hex: hex, image_url: null }
  } else {
    const catalog = await loadCatalog()
    if (!catalog.length) return { ok: false, message: 'The shop catalogue could not be loaded. Try again in a minute.' }
    const model = catalog.find((m) => m.key === pick.modelKey)
    const color = model?.colors.find((c) => c.name === pick.colorName)
    if (!model || !color) return { ok: false, message: 'That colour is no longer in the catalogue.' }
    patch = { color_name: color.name, color_hex: color.hex, image_url: color.img || null }
  }

  // Under the admin's own session: the "admin: update all bikes" policy allows it.
  const supabase = await createClient()
  const { data, error } = await supabase.from('bikes').update(patch).eq('id', bikeId).select('id')
  if (error) return { ok: false, message: error.message }
  if (!data?.length) return { ok: false, message: 'Nothing changed. The bike may have been removed.' }

  revalidatePath('/dashboard/bikes')
  return {
    ok: true,
    message: pick.kind === 'clear' ? 'Colour cleared.' : `Saved: ${patch.color_name}.`,
  }
}

/**
 * Set or clear a bike's shop invoice link (the Shop.com order or warranty
 * page). Staff only, same field as the bike card in Admin > Customers, so a
 * rental or test bike on an admin's own My Bikes can be filled in there too.
 */
export async function setBikeShopInvoice(bikeId: string, url: string): Promise<LookResult> {
  await requireAdminUser()
  if (!bikeId) return { ok: false, message: 'No bike given.' }

  const raw = String(url || '').trim()
  if (raw && !(/^https?:\/\/\S+$/i.test(raw) && raw.length <= 1000)) {
    return { ok: false, message: 'Paste a full web link starting with https://' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('bikes')
    .update({ shop_invoice_url: raw || null })
    .eq('id', bikeId)
    .select('id')
  if (error) return { ok: false, message: error.message }
  if (!data?.length) return { ok: false, message: 'Nothing changed. The bike may have been removed.' }

  revalidatePath('/dashboard/bikes')
  revalidatePath('/admin/customers')
  return { ok: true, message: raw ? 'Shop invoice link saved.' : 'Shop invoice link cleared.' }
}

/**
 * Record (or clear) the day the customer received the bike. Staff only.
 * The free break-in tune-up window counts 30 days from this date.
 */
export async function setBikeDeliveredOn(bikeId: string, date: string): Promise<LookResult> {
  await requireAdminUser()
  if (!bikeId) return { ok: false, message: 'No bike given.' }

  const raw = String(date || '').trim()
  if (raw && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { ok: false, message: 'Pick a date.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('bikes')
    .update({ delivered_on: raw || null })
    .eq('id', bikeId)
    .select('id')
  if (error) return { ok: false, message: error.message }
  if (!data?.length) return { ok: false, message: 'Nothing changed. The bike may have been removed.' }

  revalidatePath('/dashboard/bikes')
  revalidatePath('/dashboard')
  revalidatePath('/admin/customers')
  return { ok: true, message: raw ? 'Delivery date saved.' : 'Delivery date cleared.' }
}

/**
 * Staff: record that the bike just had its Creek Ready tune-up, so the
 * mileage reminder starts counting the next 500 miles from here.
 */
export async function recordBikeService(bikeId: string): Promise<LookResult> {
  await requireAdminUser()
  if (!bikeId) return { ok: false, message: 'No bike given.' }

  const supabase = await createClient()
  const { data: current, error: readError } = await supabase
    .from('bike_mileage')
    .select('distance_m')
    .eq('bike_id', bikeId)
    .maybeSingle()
  if (readError) return { ok: false, message: readError.message }

  // Only the service fields are written, never distance_m, so miles the
  // GPS adds while this runs are not overwritten.
  const today = new Date().toISOString().slice(0, 10)
  const { error } = current
    ? await supabase
        .from('bike_mileage')
        .update({ service_distance_m: current.distance_m, last_serviced_on: today, updated_at: new Date().toISOString() })
        .eq('bike_id', bikeId)
    : await supabase
        .from('bike_mileage')
        .insert({ bike_id: bikeId, last_serviced_on: today })
  if (error) return { ok: false, message: error.message }

  revalidatePath('/dashboard/bikes')
  return { ok: true, message: 'Service recorded. The next reminder counts from today’s miles.' }
}
