import Link from 'next/link'
import { confirmSignIn } from './actions'

export const metadata = {
  title: 'Sign in — Cruise the Creek',
}

/**
 * Landing page for a sign-in link staff texted from the admin card. The
 * token is only used when the customer taps the button (see actions.ts).
 */
export default async function ConfirmSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; failed?: string }>
}) {
  const { token_hash: tokenHash, failed } = await searchParams
  const usable = !!tokenHash && !failed

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="w-full max-w-sm p-6 rounded-2xl bg-white border border-[#E5E5E5] shadow-sm space-y-4 text-center">
        <h1
          className="uppercase tracking-wide text-3xl text-[#2D4A32]"
          style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.04em' }}
        >
          Cruise the Creek
        </h1>
        {usable ? (
          <>
            <p className="text-sm text-[#4A4A4A]">Tap below to sign in to your rider portal.</p>
            <form action={confirmSignIn}>
              <input type="hidden" name="token_hash" value={tokenHash} />
              <button
                type="submit"
                className="w-full py-3 rounded-lg bg-[#2D4A32] text-white font-bold hover:bg-[#1A2E1C]"
              >
                Sign in
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="text-sm text-[#4A4A4A]">
              That sign-in link has expired or was already used. Enter your email and we&apos;ll send you a new one.
            </p>
            <Link
              href="/auth"
              className="block w-full py-3 rounded-lg bg-[#2D4A32] text-white font-bold hover:bg-[#1A2E1C]"
            >
              Get a new sign-in link
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
