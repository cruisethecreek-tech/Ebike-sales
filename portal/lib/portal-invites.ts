/** Days after the last invite before someone who never signed in is due another. */
export const REINVITE_AFTER_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

export interface InviteEmail {
  kind: string
  status: string
  sent_at: string
}

/**
 * When this person was last sent a way into the portal.
 *
 * Supabase only stamps invited_at on accounts it created with an invite.
 * Accounts made by the invoice import get a sign-in link from Send Portal
 * Invite instead, which never sets it, so a sent invite or sign_in_link in
 * the Emails Sent log counts too. The later of the two wins.
 */
export function lastInviteAt(authInvitedAt: string | null | undefined, emails: InviteEmail[]): string | null {
  const dates = [authInvitedAt ?? null]
  for (const e of emails) {
    if ((e.kind === 'invite' || e.kind === 'sign_in_link') && e.status === 'sent') dates.push(e.sent_at)
  }
  return (
    dates
      .filter((d): d is string => !!d && !Number.isNaN(Date.parse(d)))
      .sort((a, b) => Date.parse(a) - Date.parse(b))
      .at(-1) ?? null
  )
}

export type SignupState = 'signed_in' | 'invited' | 'reinvite_due' | 'never_invited' | 'no_email'

export interface SignupPerson {
  email: string | null
  registered: boolean
  invitedAt: string | null
}

/** Where one customer stands on getting into the portal, as of `now`. */
export function signupState(p: SignupPerson, now: number = Date.now()): SignupState {
  if (p.registered) return 'signed_in'
  // Shop placeholder addresses (see lib/placeholder-email.ts) reach nobody.
  if (!p.email || /@cruisethecreek\.com$/i.test(p.email.trim())) return 'no_email'
  if (!p.invitedAt) return 'never_invited'
  return daysSince(p.invitedAt, now) >= REINVITE_AFTER_DAYS ? 'reinvite_due' : 'invited'
}

export function daysSince(iso: string, now: number = Date.now()): number {
  return Math.floor((now - Date.parse(iso)) / DAY_MS)
}
