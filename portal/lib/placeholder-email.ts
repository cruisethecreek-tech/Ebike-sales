/**
 * The shop's own addresses. Staff type one in as a stand-in when a customer
 * has not given an email yet, so on a customer record it means "unknown",
 * never "this is how to reach them".
 */
export function isPlaceholderEmail(email?: string | null): boolean {
  return /@cruisethecreek\.com$/i.test(String(email || '').trim())
}
