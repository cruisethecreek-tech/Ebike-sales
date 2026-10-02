/**
 * Link that opens the invoice generator on a new invoice for this customer.
 *
 * The generator reads ?name=, ?email= and ?phone=. These links used to send
 * ?customer= for the name, which the generator never read, so the button
 * opened a blank invoice. The customer's own referral code is deliberately
 * not passed: the generator's ?ref= fills "Referred By", which would credit
 * the customer to themselves and give them the referral discount.
 */
export function newInvoiceUrl(
  storeUrl: string,
  c: { name: string; email?: string | null; phone?: string | null }
): string {
  const params = new URLSearchParams()
  if (c.name) params.set('name', c.name)
  if (c.email) params.set('email', c.email)
  if (c.phone) params.set('phone', c.phone)
  const qs = params.toString()
  return `${storeUrl}/invoice.html${qs ? '?' + qs : ''}`
}
