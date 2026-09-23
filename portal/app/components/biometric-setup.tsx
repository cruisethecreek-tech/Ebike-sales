'use client'

import { useState, useEffect, useCallback } from 'react'
import { startRegistration } from '@simplewebauthn/browser'

interface StoredPasskey {
  id: string
  label: string | null
  created_at: string
  last_used_at: string | null
  backed_up: boolean
}

/**
 * Turn on Face ID / Touch ID / fingerprint sign-in for this device.
 *
 * The version this replaces created a passkey and then threw it away, kept a
 * localStorage flag as the only record, and reported "✅ Device registered!"
 * on almost every failure. Nothing was ever stored, so sign-in had nothing to
 * check against.
 *
 * Here the state shown comes from the server's list of registered keys, which
 * means the card cannot claim a passkey exists unless one really does.
 */
export function BiometricSetup() {
  const [isSupported, setIsSupported] = useState<boolean | null>(null)
  const [passkeys, setPasskeys] = useState<StoredPasskey[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState<{ text: string; isError: boolean } | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/webauthn/credentials')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not read your devices.')
      setPasskeys(json.credentials || [])
    } catch (err: any) {
      setPasskeys([])
      setStatusMsg({ text: err?.message || 'Could not read your devices.', isError: true })
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function check() {
      if (typeof window === 'undefined' || !window.PublicKeyCredential) {
        if (!cancelled) setIsSupported(false)
        return
      }
      try {
        const available =
          await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        if (!cancelled) setIsSupported(available)
      } catch {
        if (!cancelled) setIsSupported(false)
      }
    }

    check()
    refresh()

    // A passkey left over from before this feature worked no longer means
    // anything, and leaving the flag behind would keep other code believing
    // a device is set up when the server says it is not.
    try {
      localStorage.removeItem('ctc_biometric_enabled')
    } catch {}

    return () => {
      cancelled = true
    }
  }, [refresh])

  async function handleEnable() {
    setStatusMsg(null)
    setLoading(true)

    try {
      const optionsRes = await fetch('/api/webauthn/register/options', { method: 'POST' })
      const optionsJson = await optionsRes.json()
      if (!optionsRes.ok) throw new Error(optionsJson.error || 'Could not start passkey setup.')

      // This is where Face ID / Touch ID / the fingerprint sensor actually
      // runs. It throws if the person dismisses it — which is a cancellation,
      // not a success, and is reported as such.
      const attestation = await startRegistration({ optionsJSON: optionsJson.options })

      const verifyRes = await fetch('/api/webauthn/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: attestation }),
      })
      const verifyJson = await verifyRes.json()
      if (!verifyRes.ok || !verifyJson.ok) {
        throw new Error(verifyJson.error || 'That passkey could not be saved.')
      }

      await refresh()
      setStatusMsg({
        text: `✅ Saved. Next time, tap "Use Face ID / Fingerprint" on the sign-in screen — no password, no email.`,
        isError: false,
      })
    } catch (err: any) {
      const name = err?.name
      if (name === 'NotAllowedError') {
        setStatusMsg({
          text: 'The prompt was dismissed, so nothing was saved. Tap the button again when you are ready.',
          isError: true,
        })
      } else if (name === 'InvalidStateError') {
        setStatusMsg({
          text: 'This device already has a passkey for the portal. You can sign in with it now.',
          isError: false,
        })
        await refresh()
      } else {
        setStatusMsg({ text: err?.message || 'Could not set up a passkey.', isError: true })
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleRemove(id: string) {
    setStatusMsg(null)
    try {
      const res = await fetch('/api/webauthn/credentials', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not remove that device.')
      await refresh()
      setStatusMsg({ text: 'Device removed. It can no longer open your account.', isError: false })
    } catch (err: any) {
      setStatusMsg({ text: err?.message || 'Could not remove that device.', isError: true })
    }
  }

  const hasPasskeys = (passkeys?.length ?? 0) > 0

  return (
    <div className="bg-white rounded-2xl p-5 border border-[#E5E5E5] shadow-sm space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <span className="p-2 rounded-xl bg-[#F5F0E8] text-xl">📱 🔐</span>
          <div>
            <h3
              className="uppercase tracking-wide text-lg text-[#1A2E1C]"
              style={{ fontFamily: "'Bebas Neue', sans-serif" }}
            >
              Face ID &amp; Fingerprint Sign-In
            </h3>
            <p className="text-xs text-[#4A4A4A]">
              Set it up once on this device, then sign in with a tap — like your banking app.
            </p>
          </div>
        </div>

        {isSupported !== false && (
          <button
            onClick={handleEnable}
            disabled={loading}
            className="btn-primary text-xs px-4 py-2 font-bold shadow-xs flex items-center gap-1.5 disabled:opacity-60"
          >
            {loading ? 'Waiting for your device…' : hasPasskeys ? '➕ Add This Device' : '⚡ Turn On'}
          </button>
        )}
      </div>

      {isSupported === false && (
        <div className="p-3 rounded-xl text-xs bg-amber-50 text-amber-900 border border-amber-200">
          This browser has no built-in Face ID / Touch ID / fingerprint sensor available, so there is
          nothing to set up here. Open the portal in Safari on iPhone or Chrome on Android and try
          again from there.
        </div>
      )}

      {passkeys === null ? (
        <p className="text-xs text-[#4A4A4A]">Checking this account…</p>
      ) : hasPasskeys ? (
        <ul className="divide-y divide-[#E5E5E5] rounded-xl border border-[#E5E5E5]">
          {passkeys.map((k) => (
            <li key={k.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#1A2E1C] truncate">
                  {k.label || 'Registered device'}
                </div>
                <div className="text-[11px] text-[#4A4A4A]">
                  Added {new Date(k.created_at).toLocaleDateString()}
                  {k.last_used_at
                    ? ` · last used ${new Date(k.last_used_at).toLocaleDateString()}`
                    : ' · not used yet'}
                </div>
              </div>
              <button
                onClick={() => handleRemove(k.id)}
                className="text-xs text-red-600 hover:underline font-semibold shrink-0"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        isSupported !== false && (
          <p className="text-xs text-[#4A4A4A]">
            No devices set up yet. Turning this on saves a passkey to this phone or computer — your
            fingerprint never leaves it.
          </p>
        )
      )}

      {statusMsg && (
        <div
          className={`p-3 rounded-xl text-xs ${
            statusMsg.isError
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-green-50 text-green-800 border border-green-200 font-medium'
          }`}
        >
          {statusMsg.text}
        </div>
      )}
    </div>
  )
}
