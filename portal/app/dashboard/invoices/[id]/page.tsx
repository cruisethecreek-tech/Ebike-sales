import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { fetchSheetInvoice } from '@/lib/sheet-invoices'
import { PrintButton } from './print-button'

export const metadata = {
  title: 'Customer Invoice | Cruise the Creek',
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function CustomerInvoiceDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  // 1. Authenticate user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/auth/login')
  }

  // Check if current user is admin
  const { data: currentCustomer } = await supabase
    .from('customers')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  const isAdmin = Boolean(currentCustomer?.is_admin)

  // 2. Fetch invoice from Supabase
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  let query = supabase
    .from('invoices')
    .select('*, customers(id, first_name, last_name, phone, referral_code)')

  if (isUuid) {
    query = query.eq('id', id)
  } else {
    query = query.eq('invoice_number', id)
  }

  const { data: invoice } = await query.single()

  if (!invoice) {
    notFound()
  }

  // Security: only invoice owner or admin can view
  if (invoice.customer_id !== user.id && !isAdmin) {
    notFound()
  }

  // 3. Fetch sheet invoice line items and details
  const sheet = await fetchSheetInvoice(invoice.invoice_number)

  // Determine Customer Information
  const customerName =
    sheet?.customerName ||
    `${invoice.customers?.first_name || ''} ${invoice.customers?.last_name || ''}`.trim() ||
    'Valued Rider'
  const customerEmail = sheet?.customerEmail || user.email || ''
  const customerPhone = sheet?.customerPhone || invoice.customers?.phone || ''
  const customerAddress = sheet?.customerAddress || ''

  // Determine Line Items
  let lineItems = sheet?.lineItems || []
  const invoiceTotal = Number(sheet?.total || invoice.total_amount || 0)

  if (lineItems.length === 0) {
    // Attempt to pull bike description from customer's bikes
    const { data: bikes } = await supabase
      .from('bikes')
      .select('brand, model')
      .eq('customer_id', invoice.customer_id)
      .limit(1)

    if (bikes && bikes.length > 0) {
      lineItems = [
        {
          description: `${bikes[0].brand} ${bikes[0].model}`.trim(),
          qty: 1,
          price: invoiceTotal > 0 ? Number((invoiceTotal / 1.0575).toFixed(2)) : 0,
          amount: invoiceTotal > 0 ? Number((invoiceTotal / 1.0575).toFixed(2)) : 0,
        },
      ]
    } else {
      lineItems = [
        {
          description: 'E-Bike Sales & Services',
          qty: 1,
          price: invoiceTotal > 0 ? Number((invoiceTotal / 1.0575).toFixed(2)) : 0,
          amount: invoiceTotal > 0 ? Number((invoiceTotal / 1.0575).toFixed(2)) : 0,
        },
      ]
    }
  }

  // Determine Subtotal & Tax
  const subtotal = sheet?.subtotal || lineItems.reduce((acc, it) => acc + (it.amount || it.price * it.qty), 0)
  const tax = sheet?.tax ?? Number((subtotal * 0.0575).toFixed(2))
  const finalTotal = invoiceTotal || (subtotal + tax)
  const isPaid = invoice.status === 'paid' || sheet?.status === 'paid'

  // Format Date
  const rawDate = sheet?.invoiceDate || invoice.issued_at || invoice.created_at
  const formattedDate = rawDate
    ? new Date(rawDate).toLocaleDateString('en-US', {
        month: 'numeric',
        day: 'numeric',
        year: 'numeric',
      })
    : new Date().toLocaleDateString('en-US')

  return (
    <div className="container mx-auto p-4 max-w-3xl space-y-6">
      {/* Top action toolbar (hidden on print) */}
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <Link
          href="/dashboard/invoices"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#2D4A32] hover:text-[#1A2E1C] transition-colors"
        >
          <span>&larr;</span>
          <span>Back to Invoices</span>
        </Link>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <a
              href={`https://ebike-sales-nu.vercel.app/invoice.html?edit=${invoice.invoice_number}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold bg-[#F5F0E8] text-[#2D4A32] hover:bg-[#EAE2D5] transition-colors"
            >
              <span>⚡</span>
              <span>Edit in Generator ↗</span>
            </a>
          )}
          <PrintButton />
        </div>
      </div>

      {/* Invoice Document Box */}
      <div className="bg-white rounded-2xl shadow-md border border-[#E5E5E5] overflow-hidden print:border-none print:shadow-none print:rounded-none">
        {/* Dark Green Brand Header Banner */}
        <div className="bg-[#1A2E1C] px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            {/* Lightning / Wheel Icon */}
            <div className="w-8 h-8 rounded-full border border-[#C9A96E] flex items-center justify-center text-[#C9A96E] font-bold text-sm">
              ⚡
            </div>
            <div>
              <div className="font-extrabold uppercase tracking-widest text-base" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                CRUISE THE CREEK
              </div>
              <div className="text-[10px] tracking-wider text-[#C9A96E] uppercase font-semibold">
                Electric Bike Adventures &amp; Sales
              </div>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs uppercase tracking-wider text-[#A3B899] font-medium block">
              Official Receipt
            </span>
            <span className="text-xs font-bold text-white uppercase">
              {invoice.invoice_number}
            </span>
          </div>
        </div>

        {/* Invoice Body Surface */}
        <div className="p-6 md:p-8 space-y-6">
          {/* Title & Meta Row */}
          <div>
            <h1
              className="text-3xl font-extrabold uppercase tracking-wide text-[#2D4A32]"
              style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.04em' }}
            >
              INVOICE
            </h1>

            <div className="mt-2 space-y-0.5">
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                INVOICE #
              </div>
              <div className="text-lg font-bold text-[#1A1A1A]">
                {invoice.invoice_number}
              </div>
              <div className="text-sm text-gray-600">
                {formattedDate}
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200" />

          {/* Addresses: FROM & BILL TO */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            {/* FROM */}
            <div className="space-y-1">
              <div className="text-xs font-bold uppercase tracking-wider text-[#2D4A32]">
                FROM
              </div>
              <div className="font-bold text-[#1A1A1A]">Cruise the Creek</div>
              <div className="text-gray-600 leading-relaxed">
                6685 Kirk Road<br />
                Canfield, OH 44406
              </div>
              <div className="pt-2 text-gray-600 space-y-0.5">
                <div>Phone: (330) 406-9682</div>
                <div>Email: salesteam@cruisethecreek.com</div>
              </div>
            </div>

            {/* BILL TO */}
            <div className="space-y-1">
              <div className="text-xs font-bold uppercase tracking-wider text-[#2D4A32]">
                BILL TO
              </div>
              <div className="font-bold text-[#1A1A1A]">{customerName}</div>
              {customerAddress ? (
                <div className="text-gray-600 leading-relaxed whitespace-pre-line">
                  {customerAddress}
                </div>
              ) : (
                <div className="text-gray-400 italic">Address on file</div>
              )}
              <div className="pt-2 text-gray-600 space-y-0.5">
                {customerPhone && <div>Phone: {customerPhone}</div>}
                {customerEmail && <div>Email: {customerEmail}</div>}
              </div>
            </div>
          </div>

          {/* Itemized Table with Dark Forest Header */}
          <div className="overflow-x-auto rounded-lg border border-gray-200 mt-4">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-[#2D4A32] text-white text-xs uppercase tracking-wider font-semibold">
                  <th className="p-3.5">DESCRIPTION</th>
                  <th className="p-3.5 text-center">QTY</th>
                  <th className="p-3.5 text-right">UNIT PRICE</th>
                  <th className="p-3.5 text-right">AMOUNT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {lineItems.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50/50">
                    <td className="p-3.5 font-medium text-[#1A1A1A]">
                      {item.description}
                    </td>
                    <td className="p-3.5 text-center text-gray-600">
                      {item.qty}
                    </td>
                    <td className="p-3.5 text-right text-gray-700">
                      ${Number(item.price).toFixed(2)}
                    </td>
                    <td className="p-3.5 text-right font-semibold text-[#1A1A1A]">
                      ${Number(item.amount || item.price * item.qty).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary / Totals Breakdown */}
          <div className="flex flex-col items-end pt-2 space-y-2 text-sm">
            <div className="w-full max-w-xs space-y-2">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span className="font-medium text-[#1A1A1A]">${Number(subtotal).toFixed(2)}</span>
              </div>

              {sheet && sheet.discountAmt > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Discount {sheet.discountPct > 0 ? `(${sheet.discountPct}%)` : ''}</span>
                  <span className="font-medium">-${Number(sheet.discountAmt).toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between text-gray-600">
                <span>Tax (5.75%)</span>
                <span className="font-medium text-[#1A1A1A]">${Number(tax).toFixed(2)}</span>
              </div>

              <div className="border-t-2 border-[#2D4A32] pt-2 flex justify-between items-baseline">
                <span className="font-bold text-base text-[#1A1A1A]">Total Due</span>
                <span className="font-extrabold text-2xl text-[#C9A96E]">
                  ${Number(finalTotal).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Payment Status Stamp / Notice */}
          <div className="pt-4 border-t border-gray-100">
            {isPaid ? (
              <div className="p-4 rounded-xl bg-[#EAF5EC] border border-[#BCE3C2] flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-[#2D4A32] text-white flex items-center justify-center font-bold text-sm">
                    ✓
                  </div>
                  <div>
                    <div className="font-bold text-[#2D4A32] text-sm tracking-wide uppercase">
                      Paid in Full {sheet?.paymentMode === 'paidInFullCash' ? '(Cash / Direct)' : ''}
                    </div>
                    <div className="text-xs text-gray-600">
                      Thank you for your business! Your order has been settled in full.
                    </div>
                  </div>
                </div>
                <div className="text-right text-xs text-gray-500 font-mono">
                  Status: PAID
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="font-bold text-amber-900 text-sm uppercase">
                    Payment Pending
                  </div>
                  <div className="text-xs text-amber-700">
                    {sheet?.dueDate ? `Due date: ${new Date(sheet.dueDate).toLocaleDateString()}` : 'Payment due on receipt.'}
                  </div>
                </div>
                {(sheet?.paymentLink || invoice.pdf_url) && (
                  <a
                    href={sheet?.paymentLink || invoice.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-lg text-xs font-bold bg-[#2D4A32] text-white hover:bg-[#1A2E1C] transition-colors shadow-sm"
                  >
                    💳 Pay Online Now &rarr;
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Footer message */}
          <div className="pt-6 border-t border-gray-100 text-center text-xs text-gray-500">
            <p className="font-medium text-[#2D4A32]">
              Thanks for choosing Cruise the Creek!
            </p>
            <p className="mt-0.5 text-gray-400">
              Mill Creek MetroParks Trailhead &bull; Canfield, Ohio &bull; (330) 406-9682
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
