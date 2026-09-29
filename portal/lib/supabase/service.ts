import { createClient } from '@supabase/supabase-js'

/**
 * Service-role client. Bypasses every RLS policy, so only ever call it from
 * server code that has already checked who is asking.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}
