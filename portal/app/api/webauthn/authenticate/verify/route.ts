import { NextResponse } from 'next/server'
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import {
  CHALLENGE_COOKIE,
  adminClient,
  fromBase64Url,
  redeemChallenge,
  relyingPartyFor,
} from '@/lib/webauthn'

/**
 * Step 2 of signing in with a passkey: check the signature, then mint a real
 * Supabase session for whoever that key belongs to.
 *
 * The session is handed over as a single-use magic-link token hash which the
 * browser immediately redeems. `generateLink` only generates — it does not
 * send anything — so nobody is emailed when a rider uses their fingerprint.
 */
export async function POST(request: Request) {
  try {
    const { rpID, origin } = relyingPartyFor(request)
    const body = await request.json()
    const assertion = body.response

    if (!assertion?.id) {
      return NextResponse.json({ error: 'No passkey was offered.' }, { status: 400 })
    }

    const challengeId = request.headers
      .get('cookie')
      ?.split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${CHALLENGE_COOKIE}=`))
      ?.split('=')[1]

    const { challenge } = await redeemChallenge(challengeId, 'authentication')

    const admin = adminClient()
    const { data: stored, error: lookupError } = await admin
      .from('webauthn_credentials')
      .select('id, user_id, credential_id, public_key, counter, transports')
      .eq('credential_id', assertion.id)
      .maybeSingle()

    if (lookupError) throw lookupError
    if (!stored) {
      return NextResponse.json(
        {
          error:
            'This device does not have a passkey for the portal yet. Sign in with your email link once, then turn on Face ID / fingerprint from your dashboard.',
        },
        { status: 404 },
      )
    }

    const verification = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: stored.credential_id,
        publicKey: fromBase64Url(stored.public_key),
        counter: Number(stored.counter) || 0,
        transports: stored.transports || undefined,
      },
    })

    if (!verification.verified) {
      return NextResponse.json({ error: 'That passkey did not verify.' }, { status: 401 })
    }

    const { newCounter } = verification.authenticationInfo

    // A counter that does not advance is what a cloned authenticator looks
    // like. Authenticators that never count report 0 forever, which is
    // allowed, so only a *decrease* from a non-zero value is a refusal.
    const previous = Number(stored.counter) || 0
    if (previous > 0 && newCounter <= previous) {
      return NextResponse.json(
        { error: 'That passkey was refused. Please sign in with your email link.' },
        { status: 401 },
      )
    }

    await admin
      .from('webauthn_credentials')
      .update({ counter: newCounter, last_used_at: new Date().toISOString() })
      .eq('id', stored.id)

    const { data: account, error: accountError } = await admin.auth.admin.getUserById(stored.user_id)
    if (accountError) throw accountError
    const email = account?.user?.email
    if (!email) {
      return NextResponse.json(
        { error: 'That account has no email address, so a session cannot be issued.' },
        { status: 400 },
      )
    }

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })
    if (linkError) throw linkError

    const tokenHash = link?.properties?.hashed_token
    if (!tokenHash) {
      return NextResponse.json({ error: 'Could not issue a session.' }, { status: 500 })
    }

    const response = NextResponse.json({ ok: true, tokenHash })
    response.cookies.delete(CHALLENGE_COOKIE)
    return response
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Passkey sign-in failed.' },
      { status: 400 },
    )
  }
}
