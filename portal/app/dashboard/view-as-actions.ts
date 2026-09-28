'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { requireAdminUser } from '@/lib/require-admin'
import { VIEW_AS_COOKIE } from '@/lib/view-as'

/**
 * Start previewing the portal as one customer sees it.
 *
 * Admin-guarded here as well as on every read, because a server action is a
 * POST endpoint anyone can reach — the /admin layout's redirect never runs for
 * it.
 */
export async function startViewingAs(customerId: string): Promise<void> {
  await requireAdminUser()

  const store = await cookies()
  store.set(VIEW_AS_COOKIE, String(customerId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // Deliberately short. A preview left running for a week is a staff member
    // looking at someone else's invoices without meaning to.
    maxAge: 60 * 60,
  })
  redirect('/dashboard')
}

/** Stop previewing and go back to being yourself. */
export async function stopViewingAs(): Promise<void> {
  const store = await cookies()
  store.delete(VIEW_AS_COOKIE)
  redirect('/admin/customers')
}
