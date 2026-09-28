'use server'

import { requireAdminUser } from '@/lib/require-admin'
import { syncInvoice } from '@/lib/sync-invoice'
import { revalidatePath } from 'next/cache'

// A 'use server' module may only export async functions, so the result type
// lives next door in import-payload.ts rather than here.

/**
 * Import one Sheet invoice into the portal, as a signed-in member of staff.
 *
 * The Import button used to POST to /api/invoices/sync from the browser. That
 * route is guarded by the shared admin key that invoice.html keeps in
 * localStorage, and the admin pages have no reason to hold it — so the button
 * answered 401 every time it was pressed. The page built to find the missing
 * invoices could not actually put one back, which is why they were still
 * missing after it shipped.
 *
 * A server action is the right shape: the staff session is already the proof
 * of who is asking, and the service-role work never leaves the server.
 */
export async function importSheetInvoice(
  payload: any,
): Promise<{ ok: true; bikeErrors?: string[] } | { ok: false; error: string }> {
  await requireAdminUser()

  // Non-negotiable on this path. Back-filling an August invoice must not email
  // the customer a "set your password" link about a bike they bought weeks ago.
  const { status, payload: result } = await syncInvoice({ ...payload, quiet: true })

  // The sync answers 200 with ok:false when it declines — a no-email invoice,
  // for instance. Reading the status code alone is what made a decline look
  // like a success in the first place.
  if (status >= 400 || result?.ok === false) {
    return { ok: false, error: String(result?.error || result?.message || `HTTP ${status}`) }
  }

  revalidatePath('/admin/invoices/reconcile')
  revalidatePath('/admin/invoices')
  return { ok: true, ...(result?.bikeErrors?.length ? { bikeErrors: result.bikeErrors } : {}) }
}
