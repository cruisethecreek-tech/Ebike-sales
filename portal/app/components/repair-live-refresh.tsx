'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Re-renders the page when the shop moves a bike to a new repair stage, so
 * a customer watching their dashboard sees "Ready for pickup" without
 * reloading. Realtime applies the select policies, so customers only hear
 * about their own tickets. Only mounted while a repair is active.
 */
export function RepairLiveRefresh() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let timer: ReturnType<typeof setTimeout> | null = null
    const refresh = () => {
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        router.refresh()
      }, 1000)
    }

    const channel = supabase
      .channel('repair-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'repair_stage_events' }, refresh)
      .subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [router])

  return null
}
