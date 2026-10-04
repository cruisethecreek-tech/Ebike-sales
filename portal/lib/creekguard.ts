import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * CreekGuard is the name customers see for GPS tracking and theft alerts.
 * A bike has CreekGuard when an active tracker is fitted to it; there is no
 * separate subscription flag yet.
 */
export async function creekGuardBikeIds(supabase: SupabaseClient, bikeIds: string[]): Promise<Set<string>> {
  if (bikeIds.length === 0) return new Set()
  const { data, error } = await supabase
    .from('trackers')
    .select('bike_id')
    .eq('active', true)
    .in('bike_id', bikeIds)
  if (error) {
    console.error('Error fetching CreekGuard trackers:', error.message)
    return new Set()
  }
  return new Set((data ?? []).map((t) => t.bike_id as string))
}
