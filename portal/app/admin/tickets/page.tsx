import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { TicketStatusPicker } from './status-picker'

export const dynamic = 'force-dynamic'

type TicketRow = {
  id: string
  customer_id: string
  ticket_type: string
  status: string
  description: string
  created_at: string
  resolved_at: string | null
  customers: { first_name: string | null; last_name: string | null; phone: string | null } | null
  bikes: { brand: string | null; model: string | null } | null
}

function personName(c: TicketRow['customers']): string {
  if (!c) return 'Unknown customer'
  return `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Customer'
}

const STATUS_STYLE: Record<string, string> = {
  open: 'bg-[#FDECEA] text-[#B23B2E]',
  'in progress': 'bg-[#FFF4DC] text-[#8A6A1F]',
  resolved: 'bg-[#E8F3EA] text-[#2D4A32]',
}

/**
 * Every service ticket customers open from the portal's Support page,
 * open ones first. Before this page the tickets were saved but nothing in
 * the admin showed them.
 */
export default async function AdminTickets() {
  const supabase = await createClient()
  // Admins read every ticket through the "admin: read all tickets" policy.
  // The bike is named by its single-column key; see app/support/page.tsx.
  const { data, error } = await supabase
    .from('service_tickets')
    .select(
      'id, customer_id, ticket_type, status, description, created_at, resolved_at, ' +
        'customers(first_name, last_name, phone), bikes!service_tickets_bike_id_fkey(brand, model)',
    )
    .order('created_at', { ascending: false })
    .limit(200)

  const tickets = (data || []) as unknown as TicketRow[]
  const order = (s: string) => (s === 'open' ? 0 : s === 'in progress' ? 1 : 2)
  tickets.sort((a, b) => order(a.status) - order(b.status))
  const openCount = tickets.filter((t) => t.status !== 'resolved').length

  return (
    <div className="space-y-6 w-full max-w-full">
      <div>
        <h1
          className="uppercase tracking-wide text-3xl text-[#1A2E1C]"
          style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.04em' }}
        >
          🎫 Service Tickets ({openCount} open)
        </h1>
        <p className="text-xs text-[#4A4A4A]">
          Tickets customers open on the portal&apos;s Support page. The shop is emailed when one comes in.
        </p>
      </div>

      {error && (
        <p className="p-3 rounded-lg bg-[#FDECEA] text-[#B23B2E] text-sm">Could not load tickets: {error.message}</p>
      )}

      {!error && tickets.length === 0 && (
        <p className="p-6 rounded-xl bg-white border border-[#E5E5E5] text-sm text-[#4A4A4A]">No tickets yet.</p>
      )}

      <div className="space-y-3">
        {tickets.map((t) => (
          <div key={t.id} className="p-4 rounded-xl bg-white border border-[#E5E5E5] shadow-sm space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Link
                href={`/admin/customers?customer=${encodeURIComponent(t.customer_id)}`}
                className="font-bold text-[#1A2E1C] underline"
              >
                {personName(t.customers)}
              </Link>
              <span className="text-xs font-bold uppercase text-[#4A4A4A]">{t.ticket_type}</span>
              <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded-full ${STATUS_STYLE[t.status] || ''}`}>
                {t.status}
              </span>
              <span className="text-xs text-gray-500">{new Date(t.created_at).toLocaleString()}</span>
            </div>
            <p className="text-xs text-[#4A4A4A]">
              {t.bikes ? `${t.bikes.brand || ''} ${t.bikes.model || ''}`.trim() : 'No bike chosen'}
              {t.customers?.phone ? (
                <>
                  {' · '}
                  <a href={`tel:${t.customers.phone}`} className="underline">{t.customers.phone}</a>
                </>
              ) : null}
            </p>
            <p className="text-sm text-[#1A2E1C] whitespace-pre-wrap break-words">{t.description}</p>
            <TicketStatusPicker ticketId={t.id} status={t.status} />
          </div>
        ))}
      </div>
    </div>
  )
}
