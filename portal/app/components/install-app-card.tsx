'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'

// Chrome's install prompt event; not in the DOM typings.
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

const DISMISSED_KEY = 'ctc_install_card_dismissed'

// What this device is, read once on the client. 'server' during SSR, so the
// card renders nothing until the browser can say.
function detectDevice(): 'server' | 'installed' | 'dismissed' | 'ios' | 'other' {
  if (typeof window === 'undefined') return 'server'
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  if (standalone) return 'installed'
  try {
    if (localStorage.getItem(DISMISSED_KEY) === '1') return 'dismissed'
  } catch {}
  const ua = navigator.userAgent
  const isIos = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  return isIos ? 'ios' : 'other'
}

const noSubscribe = () => () => {}

// Chrome can fire beforeinstallprompt before React hydrates and the card's
// effect starts listening, so catch it as soon as this module loads.
let earlyPrompt: InstallPromptEvent | null = null
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    earlyPrompt = e as InstallPromptEvent
  })
}

/**
 * "Add the portal to your home screen" card for the dashboard.
 *
 * Android/Chrome fires beforeinstallprompt, so it gets a real Install button.
 * iPhone has no such event (Apple only allows Share > Add to Home Screen), so
 * it gets the two steps instead. Anywhere else, and once the portal is opened
 * from the home screen icon, the card stays hidden.
 */
export function InstallAppCard() {
  const device = useSyncExternalStore(noSubscribe, detectDevice, () => 'server' as const)
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(() => earlyPrompt)
  const [closed, setClosed] = useState(false)

  useEffect(() => {
    if (device !== 'other') return
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setPromptEvent(e as InstallPromptEvent)
    }
    const onInstalled = () => setClosed(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [device])

  const mode: 'hidden' | 'android' | 'ios' = closed
    ? 'hidden'
    : device === 'ios'
      ? 'ios'
      : device === 'other' && promptEvent
        ? 'android'
        : 'hidden'

  if (mode === 'hidden') return null

  const dismiss = () => {
    try { localStorage.setItem(DISMISSED_KEY, '1') } catch {}
    setClosed(true)
  }

  const install = async () => {
    if (!promptEvent) return
    await promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice
    setPromptEvent(null)
    if (outcome === 'accepted') setClosed(true)
  }

  return (
    <div className="flex items-start gap-4 p-4 sm:p-5 rounded-2xl bg-white border border-[#E5E5E5] shadow-xs">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon-192.png" alt="" width={48} height={48} className="w-12 h-12 rounded-xl shrink-0" />
      <div className="flex-1 min-w-0">
        <h3 className="font-bold text-base text-[#1A2E1C]">Put the Creek Ready portal on your home screen</h3>
        <p className="text-xs text-[#4A4A4A] mt-0.5">
          One tap to your bikes, GPS, tune-ups and messages from Pat &amp; Dru, just like an app.
        </p>

        {mode === 'android' && (
          <button
            type="button"
            onClick={install}
            className="btn-primary text-xs px-4 py-2 font-bold inline-block shadow-xs mt-3"
          >
            📲 Install the App
          </button>
        )}

        {mode === 'ios' && (
          <ol className="text-xs text-[#1A2E1C] mt-2 space-y-1 list-decimal list-inside">
            <li>Tap the <strong>Share</strong> button <span aria-hidden>(the square with an arrow ⬆️)</span> in Safari.</li>
            <li>Scroll down and tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
          </ol>
        )}

        <button type="button" onClick={dismiss} className="block text-[11px] text-gray-500 underline mt-2">
          Not now
        </button>
      </div>
    </div>
  )
}
