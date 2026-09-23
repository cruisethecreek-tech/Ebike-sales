import { NextResponse } from 'next/server'
import { generateAuthenticationOptions } from '@simplewebauthn/server'
import {
  CHALLENGE_COOKIE,
  CHALLENGE_TTL_MS,
  relyingPartyFor,
  storeChallenge,
} from '@/lib/webauthn'

/**
 * Step 1 of signing in with a passkey.
 *
 * No email is asked for and no session is required. The keys are
 * discoverable (residentKey: 'required' at registration), so the phone itself
 * knows which accounts it holds for this site and offers them — the same
 * flow a banking app uses.
 *
 * Deliberately no allowCredentials list: that would mean naming which keys
 * exist before anyone has proved who they are, which leaks whether a given
 * person has an account here.
 */
export async function POST(request: Request) {
  try {
    const { rpID } = relyingPartyFor(request)

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'required',
    })

    const challengeId = await storeChallenge('authentication', options.challenge, null)

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
      { error: err?.message || 'Could not start passkey sign-in.' },
      { status: 400 },
    )
  }
}
