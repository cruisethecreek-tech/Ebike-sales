'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function registerBike(prevState: any, formData: FormData) {
  const brand = formData.get('brand') as string
  const model = formData.get('model') as string
  const serial_number = formData.get('serial_number') as string || null
  const purchase_date = formData.get('purchase_date') as string || null
  const warranty_expires_at = formData.get('warranty_expires_at') as string || null

  if (!brand || !model) {
    return { error: 'Brand and model are required.' }
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    return { error: 'Unauthorized.' }
  }

  const { error } = await supabase
    .from('bikes')
    .insert({
      customer_id: user.id,
      brand,
      model,
      serial_number,
      purchase_date,
      warranty_expires_at,
    })

  if (error) {
    console.error('Error registering bike:', error)
    return { error: 'Failed to register bike.' }
  }

  revalidatePath('/dashboard/bikes')
  redirect('/dashboard/bikes')
}

export async function deleteBike(formData: FormData) {
  const bikeId = formData.get('bikeId') as string
  if (!bikeId) return

  const supabase = await createClient()
  
  const { error } = await supabase
    .from('bikes')
    .delete()
    .eq('id', bikeId)

  if (error) {
    console.error('Error deleting bike:', error)
    return
  }

  revalidatePath('/dashboard/bikes')
}

export async function updateBikeSerial(prevState: any, formData: FormData) {
  const bikeId = (formData.get('bike_id') as string || '').trim()
  const rawSerial = formData.get('serial_number') as string
  const serial_number = rawSerial && rawSerial.trim() ? rawSerial.trim().toUpperCase() : null

  if (!bikeId) {
    return { error: 'Bike ID is required.' }
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: 'Unauthorized.' }
  }

  const { error } = await supabase
    .from('bikes')
    .update({ serial_number })
    .eq('id', bikeId)
    .eq('customer_id', user.id)

  if (error) {
    console.error('Error updating bike serial number:', error)
    if (error.code === '23505') {
      return { error: 'This serial number is already registered to another bike.' }
    }
    return { error: 'Failed to update serial number. Please try again.' }
  }

  revalidatePath('/dashboard/bikes')
  return { success: true, serial_number }
}
