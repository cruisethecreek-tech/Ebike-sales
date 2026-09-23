import { NextResponse } from 'next/server'
import { verifyRegistrationResponse } from '@simplewebauthn/server'
import { createClient } from '@/lib/supabase/server'
import {
  CHALLENGE_COOKIE,
  adminClient,
  deviceLabelFrom,
  redeemChallenge,
  relyingPartyFor,
  toBase64Url,
} from '@/lib/webauthn'

/**
 * Step 2 of adding a passkey: check the signature and keep the public key.
 *
 * This is the step the old implementation did not have at all, which is why
 * "Activate Biometrics" could report success and still leave nothing to sign
 * in with.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Your session expired. Sign in again.' }, { status: 401 })
    }

    const { rpID, origin } = relyingPartyFor(request)
    const body = await request.json()

    const challengeId = request.headers
      .get('cookie')
      ?.split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${CHALLENGE_COOKIE}=`))
      ?.split('=')[1]

    const { challenge, userId: challengeUserId } = await redeemChallenge(challengeId, 'registration')

    // The challenge was issued to one account. If the session changed in
    // between, the key would be filed against the wrong person.
    if (challengeUserId && challengeUserId !== user.id) {
      return NextResponse.json({ error: 'Your session changed. Please try again.' }, { status: 400 })
    }

    const verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    })

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json(
        { error: 'That passkey could not be verified, so it was not saved.' },
        { status: 400 },
      )
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo

    const admin = adminClient()
    const { error } = await admin.from('webauthn_credentials').upsert(
      {
        user_id: user.id,
        credential_id: credential.id,
        public_key: toBase64Url(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports || null,
        device_type: credentialDeviceType,
        backed_up: credentialBackedUp,
        label: deviceLabelFrom(request.headers.get('user-agent')),
      },
      { onConflict: 'credential_id' },
    )

    // Check it. An unchecked upsert is how the previous version managed to
    // celebrate a registration that never happened.
    if (error) throw error

    const response = NextResponse.json({ ok: true, label: deviceLabelFrom(request.headers.get('user-agent')) })
    response.cookies.delete(CHALLENGE_COOKIE)
    return response
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Could not save that passkey.' },
      { status: 400 },
    )
  }
}
