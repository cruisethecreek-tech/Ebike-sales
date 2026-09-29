/**
 * Ride photos customers share, and the marketing consent that goes with them.
 *
 * The consent wording is stored with every photo exactly as the customer saw
 * it, so a later change to this text never changes what someone agreed to.
 * Change CONSENT_TEXT and bump CONSENT_VERSION together.
 */
export const RIDE_PHOTOS_BUCKET = 'ride-photos'

export const CONSENT_VERSION = '2026-09-29'

export const CONSENT_TEXT =
  'I took this photo, or everyone in it has agreed to share it. I give Cruise the Creek Adventures LLC ' +
  'permission to use this photo, my caption and my first name on its social media, website, emails and ' +
  'ads, without payment. I can withdraw this any time from My Photos in the portal; that stops new uses, ' +
  'but posts already published may stay up.'

export function consentRecord(): string {
  return `[${CONSENT_VERSION}] ${CONSENT_TEXT}`
}

/** Largest upload accepted. The form shrinks photos far below this first. */
export const MAX_PHOTO_BYTES = 3_800_000

export const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** Signed links last long enough to view or download, and no longer. */
export const SIGNED_URL_SECONDS = 60 * 60
