import { NextResponse } from 'next/server'
import { generateRegistrationOptions } from '@simplewebauthn/server'
import { createClient } from '@/lib/supabase/server'
import {
  CHALLENGE_COOKIE,
  CHALLENGE_TTL_MS,
  RP_NAME,
  adminClient,
  relyingPartyFor,
  storeChallenge,
} from '@/lib/webauthn'

/**
 * Step 1 of adding a passkey: hand the browser a challenge to sign.
 *
 * Requires a signed-in session — a passkey is proof that a device belongs to
 * an account, so the account has to be established some other way first
 * (email link or password). That is once, not every time.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Sign in with your email link or password first, then add a passkey.' },
        { status: 401 },
      )
    }

    const { rpID } = relyingPartyFor(request)

    // Existing keys go in excludeCredentials so the phone says "you already
    // have a passkey here" instead of quietly making a second one, which
    // would leave the rider with a device list full of duplicates.
    const admin = adminClient()
    const { data: existing, error: existingError } = await admin
      .from('webauthn_credentials')
      .select('credential_id, transports')
      .eq('user_id', user.id)

    if (existingError) throw existingError

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userName: user.email || 'rider',
      userDisplayName:
        [user.user_metadata?.first_name, user.user_metadata?.last_name]
          .filter(Boolean)
          .join(' ') || user.email || 'Rider',
      // Stable per account, so re-registering on the same phone replaces the
      // old key rather than stacking another one beside it.
      userID: new Uint8Array(Buffer.from(user.id, 'utf8')),
      attestationType: 'none',
      excludeCredentials: (existing || []).map((c: any) => ({
        id: c.credential_id,
        transports: c.transports || undefined,
      })),
      authenticatorSelection: {
        // The built-in sensor, not a USB key — this is the Face ID / Touch ID
        // / fingerprint feature the shop actually asked for.
        authenticatorAttachment: 'platform',
        // Discoverable, so sign-in can start with no email typed in.
        residentKey: 'required',
        userVerification: 'required',
      },
    })

    const challengeId = await storeChallenge('registration', options.challenge, user.id)

    const response = NextResponse.json({ options })
    response.cookies.set(CHALLENGE_COOKIE, challengeId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor(CHALLENGE_TTL_MS / 1000),
    })
    return response
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Could not start passkey setup.' },
      { status: 400 },
    )
  }
}
