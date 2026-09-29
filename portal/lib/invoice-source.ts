/**
 * Where an invoice can be edited.
 *
 * The invoice generator opens invoices from the Google Sheet. Orders imported
 * from the old Wix shop (WIX-…) only exist in the portal: they were paid at
 * checkout and have no Sheet row. Sending one to the generator used to open a
 * blank new invoice instead, which looked like the order had been lost.
 */
export function isWixOrder(invoiceNumber?: string | null): boolean {
  return /^WIX-/i.test(String(invoiceNumber || '').trim())
}
