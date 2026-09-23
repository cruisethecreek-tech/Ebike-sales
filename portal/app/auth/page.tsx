'use client'

import { useState, useActionState, useEffect } from 'react'
import { signIn, sendMagicLink } from './actions'
import { createClient } from '@/lib/supabase/client'
import { startAuthentication } from '@simplewebauthn/browser'
import Link from 'next/link'

export default function AuthPage() {
  const [mode, setMode] = useState<'magic' | 'password' | 'biometric'>('biometric')
  const [magicState, magicAction, isMagicPending] = useActionState(sendMagicLink, null)
  const [signInState, signInAction, isSignInPending] = useActionState(signIn, null)
  
  const [emailInput, setEmailInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [bioError, setBioError] = useState<string | null>(null)
  const [bioLoading, setBioLoading] = useState(false)
  const [bioSuccess, setBioSuccess] = useState(false)

  // On page mount, check if there's a referral or prefill email in the URL
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const emailParam = p.get('email');
      if (emailParam) setEmailInput(emailParam);
    } catch (_) {}
  }, [])

  // Sign in with a real passkey.
  //
  // What was here before could not work. It called
  // navigator.credentials.get({ password: true }) — a Chromium-only API that
  // returns a password the browser saved, which iPhones do not implement at
  // all — and then a bare WebAuthn get() whose assertion nothing on the
  // server ever verified. Meanwhile "Activate Biometrics" on the dashboard
  // never stored a key anywhere. So there was no key to find, and nothing
  // that could have checked one.
  //
  // Now: the server issues a challenge, the phone signs it with the key held
  // in its secure element (released by Face ID / Touch ID / fingerprint), and
  // the server verifies that signature against the public key it stored at
  // registration before issuing a session.
  async function handleBiometricLogin() {
    setBioError(null)
    setBioLoading(true)

    try {
      if (typeof window === 'undefined' || !window.PublicKeyCredential) {
        throw new Error(
          'This browser does not support passkeys. Use the Email Link tab to sign in.'
        )
      }

      const optionsRes = await fetch('/api/webauthn/authenticate/options', { method: 'POST' })
      const optionsJson = await optionsRes.json()
      if (!optionsRes.ok) throw new Error(optionsJson.error || 'Could not start passkey sign-in.')

      const assertion = await startAuthentication({ optionsJSON: optionsJson.options })

      const verifyRes = await fetch('/api/webauthn/authenticate/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: assertion }),
      })
      const verifyJson = await verifyRes.json()
      if (!verifyRes.ok || !verifyJson.tokenHash) {
        throw new Error(verifyJson.error || 'Passkey sign-in failed.')
      }

      // Redeem the one-time token the server just issued for this verified
      // passkey. This is what actually puts a session in the browser.
      const supabase = createClient()
      const { data, error } = await supabase.auth.verifyOtp({
        type: 'magiclink',
        token_hash: verifyJson.tokenHash,
      })
      if (error) throw error
      if (!data?.session) throw new Error('Passkey verified, but no session was created.')

      setBioSuccess(true)
      window.location.href = '/dashboard'
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        setBioError('The prompt was dismissed. Tap the button again when you are ready.')
      } else {
        setBioError(err?.message || 'Passkey sign-in failed. Use the Email Link tab instead.')
      }
    } finally {
      setBioLoading(false)
    }
  }

  // Handle client-side password sign in with credential saving for future biometric 1-tap logins
  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!emailInput || !passwordInput) return

    setBioLoading(true)
    setBioError(null)

    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailInput.trim(),
        password: passwordInput,
      })

      if (error) {
        setBioError(error.message)
        setBioLoading(false)
        return
      }

      // Store in Google Password Manager / Apple Keychain for 1-tap biometrics next time
      if (typeof window !== 'undefined' && (window as any).PasswordCredential && navigator.credentials?.store) {
        try {
          const pCred = new (window as any).PasswordCredential({
            id: emailInput.trim(),
            password: passwordInput,
            name: emailInput.trim(),
          })
          await navigator.credentials.store(pCred)
        } catch (_) {}
      }

      if (data?.session) {
        window.location.href = '/dashboard'
      }
    } catch (err: any) {
      setBioError(err?.message || 'Sign in failed')
      setBioLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link href="/" className="inline-block hover:opacity-80 transition-opacity">
          <h1
            className="text-4xl font-bold tracking-wide"
            style={{ fontFamily: "'Bebas Neue', sans-serif", color: '#2D4A32', letterSpacing: '0.04em' }}
          >
            Cruise the Creek 🚲
          </h1>
        </Link>
        <p className="mt-1 text-base font-bold uppercase tracking-wider text-[#2D4A32]" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.06em' }}>
          Creek Ready Customer Portal
        </p>
        <p className="mt-0.5 text-xs text-[#6B8F71]">
          Your Adventure, Electrified
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 sm:px-10 rounded-2xl shadow-sm border" style={{ borderColor: '#e8dfd1' }}>
          
          {/* Tabs */}
          <div className="flex mb-6 rounded-xl overflow-hidden p-1 gap-1" style={{ backgroundColor: '#F5F0E8' }}>
            <button
              onClick={() => { setMode('biometric'); setBioError(null); }}
              className="flex-1 py-2 text-center text-xs font-bold rounded-lg transition-all"
              style={{
                backgroundColor: mode === 'biometric' ? '#2D4A32' : 'transparent',
                color: mode === 'biometric' ? '#fff' : '#4A4A4A',
              }}
            >
              🔐 Biometrics
            </button>
            <button
              onClick={() => { setMode('password'); setBioError(null); }}
              className="flex-1 py-2 text-center text-xs font-bold rounded-lg transition-all"
              style={{
                backgroundColor: mode === 'password' ? '#2D4A32' : 'transparent',
                color: mode === 'password' ? '#fff' : '#4A4A4A',
              }}
            >
              🔒 Password
            </button>
            <button
              onClick={() => { setMode('magic'); setBioError(null); }}
              className="flex-1 py-2 text-center text-xs font-bold rounded-lg transition-all"
              style={{
                backgroundColor: mode === 'magic' ? '#2D4A32' : 'transparent',
                color: mode === 'magic' ? '#fff' : '#4A4A4A',
              }}
            >
              ✉️ Email Link
            </button>
          </div>

          {/* ── Biometric / Face ID / Fingerprint / Passkey ── */}
          {mode === 'biometric' && (
            <div className="space-y-5 text-center">
              {bioError && (
                <div className="p-3 rounded-lg text-xs text-left" style={{ backgroundColor: '#fef2f2', color: '#dc2626' }}>
                  {bioError}
                </div>
              )}

              {bioSuccess && (
                <div className="p-3 rounded-lg text-xs" style={{ backgroundColor: '#f0fdf4', color: '#16a34a' }}>
                  ✅ Biometrics verified! Loading your dashboard…
                </div>
              )}

              <div className="p-6 rounded-2xl bg-[#F5F0E8] space-y-3">
                <span className="text-4xl block">📱 🔐</span>
                <h3 className="font-bold text-base text-[#1A2E1C]">
                  Sign In with Face ID or Fingerprint
                </h3>
                <p className="text-xs text-[#4A4A4A]">
                  Works once you have turned it on for this device. Your fingerprint never leaves
                  your phone — it only unlocks the key stored there.
                </p>
              </div>

              <button
                type="button"
                onClick={handleBiometricLogin}
                disabled={bioLoading || bioSuccess}
                className="btn-primary w-full flex justify-center items-center gap-2 py-3 px-4 font-bold text-sm shadow-md"
              >
                {bioLoading ? 'Waiting for your device…' : '🔐 Use Face ID / Fingerprint'}
              </button>

              <div className="pt-2 space-y-1">
                <p className="text-xs text-[#4A4A4A]">
                  First time on this device? Sign in with the Email Link tab, then open your
                  dashboard and turn on Face ID &amp; Fingerprint Sign-In.
                </p>
                <button
                  type="button"
                  onClick={() => setMode('magic')}
                  className="text-xs text-[#2D4A32] font-semibold underline hover:text-[#C9A96E]"
                >
                  Email me a sign-in link →
                </button>
              </div>
            </div>
          )}

          {/* ── Password Sign In ── */}
          {mode === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-5">
              {bioError && (
                <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: '#fef2f2', color: '#dc2626' }}>
                  {bioError}
                </div>
              )}
              {signInState?.error && (
                <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: '#fef2f2', color: '#dc2626' }}>
                  {signInState.error}
                </div>
              )}
              
              <div>
                <label htmlFor="signin-email" className="block text-sm font-medium mb-1" style={{ color: '#2D4A32' }}>
                  Email address
                </label>
                <input
                  id="signin-email"
                  name="email"
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  autoComplete="username webauthn"
                  required
                  className="input w-full"
                  placeholder="your@email.com"
                />
              </div>

              <div>
                <label htmlFor="signin-password" className="block text-sm font-medium mb-1" style={{ color: '#2D4A32' }}>
                  Password
                </label>
                <input
                  id="signin-password"
                  name="password"
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  autoComplete="current-password webauthn"
                  required
                  className="input w-full"
                />
              </div>

              <div className="p-2.5 rounded-lg bg-[#FAF8F2] border border-[#E5E5E5] text-[11px] text-[#4A4A4A] flex items-center gap-2">
                <span>🔐</span>
                <span>Signing in saves your credentials securely so you can use 1-tap biometric login next time.</span>
              </div>

              <button
                type="submit"
                disabled={bioLoading || isSignInPending}
                className="btn-primary w-full flex justify-center py-2.5 px-4 font-bold shadow-sm"
              >
                {bioLoading || isSignInPending ? 'Signing in...' : 'Sign In & Enable Biometrics'}
              </button>
            </form>
          )}

          {/* ── Magic Link ── */}
          {mode === 'magic' && (
            <form action={magicAction} className="space-y-5">
              {magicState?.error && (
                <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: '#fef2f2', color: '#dc2626' }}>
                  {magicState.error}
                </div>
              )}
              {magicState?.success && (
                <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: '#f0fdf4', color: '#16a34a' }}>
                  ✅ {magicState.success}
                </div>
              )}

              <p className="text-sm text-center" style={{ color: '#4A4A4A' }}>
                Enter your email and we&apos;ll send you a sign-in link — no password needed!
              </p>
              
              <div>
                <label htmlFor="magic-email" className="block text-sm font-medium mb-1" style={{ color: '#2D4A32' }}>
                  Email address
                </label>
                <input
                  id="magic-email"
                  name="email"
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  autoComplete="username webauthn"
                  required
                  className="input w-full"
                  placeholder="your@email.com"
                />
              </div>

              <button
                type="submit"
                disabled={isMagicPending}
                className="btn-primary w-full flex justify-center py-2.5 px-4 font-bold shadow-sm"
              >
                {isMagicPending ? 'Sending...' : '✉️ Send Sign-In Link'}
              </button>
            </form>
          )}

          <p className="mt-6 text-xs text-center" style={{ color: '#6B8F71' }}>
            Don&apos;t have an account? Ask your CTC rep to send you an invite.
          </p>
        </div>
      </div>

      <p className="mt-6 text-center text-xs" style={{ color: '#4A4A4A' }}>
        © {new Date().getFullYear()} Cruise the Creek Adventures · Youngstown, OH
      </p>
    </main>
  )
}
