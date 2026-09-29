/**
 * Checking a customer's details before an admin saves them.
 *
 * No app imports, so its test runs under plain node.
 */
export type CustomerDetailsInput = {
  firstName: string
  lastName: string
  email: string
  phone: string
  preferredContact: string
}

export type CleanDetails = {
  firstName: string
  lastName: string
  email: string
  phone: string | null
  preferredContact: 'text' | 'email' | 'phone'
}

const CONTACT = ['text', 'email', 'phone'] as const

export function cleanCustomerDetails(
  input: CustomerDetailsInput,
): { ok: true; value: CleanDetails } | { ok: false; message: string } {
  const squash = (s: string) => String(s || '').trim().replace(/\s+/g, ' ')
  const firstName = squash(input.firstName)
  const lastName = squash(input.lastName)
  const email = String(input.email || '').trim().toLowerCase()
  const phoneRaw = String(input.phone || '').trim()
  const contact = String(input.preferredContact || '').trim()

  if (!firstName) return { ok: false, message: 'First name is required.' }
  // The database refuses a blank last name, so say so here rather than
  // letting the save fail with a constraint name.
  if (!lastName) return { ok: false, message: 'Last name is required.' }
  if (firstName.length > 80 || lastName.length > 80) return { ok: false, message: 'That name is too long.' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { ok: false, message: 'That email address does not look right.' }
  }

  let phone: string | null = null
  if (phoneRaw) {
    const digits = phoneRaw.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
    // US numbers are ten digits. A nine-digit one (Edgar's, from Wix) is a
    // typo, and saving it would only move the problem.
    if (digits.length !== 10) return { ok: false, message: 'A phone number needs 10 digits.' }
    phone = digits
  }

  const preferredContact = (CONTACT as readonly string[]).includes(contact)
    ? (contact as CleanDetails['preferredContact'])
    : 'text'

  return { ok: true, value: { firstName, lastName, email, phone, preferredContact } }
}
