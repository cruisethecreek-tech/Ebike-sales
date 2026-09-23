import { createClient } from '@supabase/supabase-js'

/**
 * Server-side plumbing for passkeys.
 *
 * Two things here are security-load-bearing and are written to fail closed:
 *
 *  1. The relying-party ID and expected origin. WebAuthn's whole guarantee is
 *     that a signature is bound to one origin, so an assertion produced on
 *     evil.example can never be replayed against this site. That guarantee
 *     evaporates if we accept whatever origin the request claims, so the host
 *     is checked against an allowlist before it is trusted.
 *
 *  2. Challenges. They are stored server-side and deleted on redemption, so a
 *     captured assertion cannot be sent twice.
 */

export const RP_NAME = 'Cruise the Creek'

/** Five minutes is longer than any real Face ID prompt takes. */
export const CHALLENGE_TTL_MS = 5 * 60 * 1000

/** Cookie holding the id of the pending challenge row — never the challenge. */
export const CHALLENGE_COOKIE = 'ctc_webauthn_challenge'

/**
 * Hosts allowed to act as a relying party.
 *
 * Preview deployments get their own rpID, so a passkey registered on a
 * preview will not work on production. That is inherent to WebAuthn, not a
 * bug: the key is bound to the domain it was created for.
 */
function isAllowedHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h === '127.0.0.1') return true
  if (h === 'cruisethecreek.com' || h.endsWith('.cruisethecreek.com')) return true
  if (h.endsWith('.vercel.app')) return true
  return false
}

export interface RelyingParty {
  rpID: string
  origin: string
}

/**
 * Resolve the relying party for this request, or throw.
 *
 * WEBAUTHN_RP_ID overrides the derived host — needed if the portal is ever
 * served from a subdomain but should issue keys for the apex.
 */
export function relyingPartyFor(request: Request): RelyingParty {
  const header = request.headers.get('origin')
  const origin = header || new URL(request.url).origin

  let hostname: string
  try {
    hostname = new URL(origin).hostname
  } catch {
    throw new Error('Could not read the request origin.')
  }

  if (!isAllowedHost(hostname)) {
    throw new Error(`Passkeys are not enabled for ${hostname}.`)
  }

  const rpID = process.env.WEBAUTHN_RP_ID || hostname

  // An explicit override that does not cover the host we are actually serving
  // would produce assertions this server then rejects, which looks to the
  // rider exactly like a broken fingerprint reader. Catch it here instead.
  if (rpID !== hostname && !hostname.endsWith(`.${rpID}`)) {
    throw new Error(`WEBAUTHN_RP_ID (${rpID}) does not cover ${hostname}.`)
  }

  return { rpID, origin }
}

/**
 * Service-role client. Registration writes and the sign-in lookup both need
 * to bypass RLS — the whole point is that the rider has no session yet.
 */
export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase service-role credentials are not configured.')
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Store a challenge and return the id to hand back in the cookie. */
export async function storeChallenge(
  kind: 'registration' | 'authentication',
  challenge: string,
  userId: string | null,
): Promise<string> {
  const supabase = adminClient()
  const { data, error } = await supabase
    .from('webauthn_challenges')
    .insert({
      kind,
      challenge,
      user_id: userId,
      expires_at: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
    })
    .select('id')
    .single()

  if (error) throw error
  return data.id as string
}

export interface RedeemedChallenge {
  challenge: string
  userId: string | null
}

/**
 * Redeem a challenge: read it, delete it, and refuse it if it has expired.
 *
 * The delete happens whether or not the challenge turns out to be usable, so
 * a failed attempt cannot be retried against the same nonce. Expired rows are
 * swept at the same time, which is why there is no cron job for the table.
 */
export async function redeemChallenge(
  id: string | undefined,
  kind: 'registration' | 'authentication',
): Promise<RedeemedChallenge> {
  if (!id) throw new Error('This sign-in attempt has expired. Please try again.')

  const supabase = adminClient()

  const { data, error } = await supabase
    .from('webauthn_challenges')
    .delete()
    .eq('id', id)
    .select('challenge, kind, user_id, expires_at')
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('This sign-in attempt has expired. Please try again.')
  if (data.kind !== kind) throw new Error('This sign-in attempt has expired. Please try again.')
  if (new Date(data.expires_at).getTime() < Date.now()) {
    throw new Error('This sign-in attempt has expired. Please try again.')
  }

  // Opportunistic sweep — cheap, and keeps the table from growing on
  // abandoned prompts, which are common (people dismiss Face ID all the time).
  void supabase
    .from('webauthn_challenges')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .then(() => undefined)

  return { challenge: data.challenge as string, userId: (data.user_id as string) || null }
}

/** base64url <-> bytes, without pulling in a dependency for four lines. */
export function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url')
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const buf = Buffer.from(value, 'base64url')
  const out = new Uint8Array(new ArrayBuffer(buf.length))
  out.set(buf)
  return out
}

/**
 * A readable name for the device that just registered, derived from the
 * user agent. Only ever cosmetic — it labels a row in the rider's device
 * list so they can tell which phone to remove.
 */
export function deviceLabelFrom(userAgent: string | null): string {
  const ua = userAgent || ''
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  if (/Android/i.test(ua)) return 'Android phone'
  if (/Macintosh/i.test(ua)) return 'Mac'
  if (/Windows/i.test(ua)) return 'Windows PC'
  return 'This device'
}
