'use client'

import { useEffect } from 'react'

/**
 * Tell the Now Viewing dock which customer this page is actually about.
 *
 * The dock's label said "Now Viewing" but its value only ever changed when
 * someone picked a customer inside the dock itself, and that pick was stored
 * in localStorage indefinitely. So opening Allan Zinz's invoice while Kelly
 * Hartner had been selected days earlier left the bar reading "Now Viewing
 * Kelly Hartner" over Allan's record — a label stating something the app had
 * never checked.
 *
 * Mounting this on a page that concerns one customer makes the claim true for
 * as long as that page is open. It is deliberately NOT persisted: a page
 * context lasts exactly as long as the page, and unmounting hands the dock
 * back to whatever the user had pinned.
 */
export function SyncNowViewing({ customerId }: { customerId?: string | null }) {
  useEffect(() => {
    if (!customerId) return
    window.dispatchEvent(
      new CustomEvent('ctc-page-customer', { detail: { id: customerId } })
    )
    return () => {
      window.dispatchEvent(new CustomEvent('ctc-page-customer', { detail: { id: null } }))
    }
  }, [customerId])

  return null
}
