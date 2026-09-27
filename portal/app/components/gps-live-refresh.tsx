'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Re-renders the page's server components when a new position or alert
 * arrives. Realtime applies the table's select policies, so a customer only
 * hears about their own bikes. Refreshes are throttled because a tracker
 * uploads a small batch of points at once.
 */
export function GpsLiveRefresh() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let timer: ReturnType<typeof setTimeout> | null = null
    const refresh = () => {
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        router.refresh()
      }, 2000)
    }

    const channel = supabase
      .channel('gps-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'positions' }, refresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tracker_alerts' }, refresh)
      .subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [router])

  return null
}
