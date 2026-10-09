import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { TicketStatusPicker } from './status-picker'
import { TicketActions } from './ticket-actions'
import { TicketThread, messagesByTicket, shopTime, type TicketMessage } from '@/app/components/ticket-thread'

export const dynamic = 'force-dynamic'

type TicketRow = {
  id: string
  customer_id: string
  ticket_type: string
  status: string
  description: string
  created_at: string
  resolved_at: string | null
  needs_reply: boolean
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
      'id, customer_id, ticket_type, status, description, created_at, resolved_at, needs_reply, ' +
        'customers(first_name, last_name, phone), bikes!service_tickets_bike_id_fkey(brand, model)',
    )
    .order('created_at', { ascending: false })
    .limit(200)

  const tickets = (data || []) as unknown as TicketRow[]
  // Waiting on the shop first, then by status; newest first within each.
  const order = (t: TicketRow) => (t.needs_reply ? 0 : 1) * 10 + (t.status === 'open' ? 0 : t.status === 'in progress' ? 1 : 2)
  tickets.sort((a, b) => order(a) - order(b))
  const openCount = tickets.filter((t) => t.status !== 'resolved').length
  const replyCount = tickets.filter((t) => t.needs_reply).length

  const { data: messageRows } = tickets.length
    ? await supabase
        .from('ticket_messages')
        .select('id, ticket_id, from_staff, body, created_at')
        .in('ticket_id', tickets.map((t) => t.id))
        .order('created_at', { ascending: true })
    : { data: [] as TicketMessage[] }
  const threads = messagesByTicket(messageRows as TicketMessage[] | null)

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
          Tickets customers open on the portal&apos;s Support page. Replies you send here are emailed to the
          customer and show on their Support page.
        </p>
        {replyCount > 0 && (
          <p className="mt-2 inline-block text-xs font-bold px-2.5 py-1 rounded-full bg-[#FDECEA] text-[#B23B2E]">
            {replyCount} waiting on a reply
          </p>
        )}
      </div>

      {error && (
        <p className="p-3 rounded-lg bg-[#FDECEA] text-[#B23B2E] text-sm">Could not load tickets: {error.message}</p>
      )}

      {!error && tickets.length === 0 && (
        <p className="p-6 rounded-xl bg-white border border-[#E5E5E5] text-sm text-[#4A4A4A]">No tickets yet.</p>
      )}

      <div className="space-y-3">
        {tickets.map((t) => (
          <div
            key={t.id}
            className={`p-4 rounded-xl bg-white border shadow-sm space-y-2 ${t.needs_reply ? 'border-[#E8A99F]' : 'border-[#E5E5E5]'}`}
          >
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
              {t.needs_reply && (
                <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#B23B2E] text-white">
                  Needs reply
                </span>
              )}
              <span className="text-xs text-gray-500">{shopTime(t.created_at)}</span>
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
            <p id={`ticket-${t.id}`} className="text-sm text-[#1A2E1C] whitespace-pre-wrap break-words">{t.description}</p>
            <TicketThread messages={threads.get(t.id) || []} viewer="staff" />
            <TicketActions ticketId={t.id} needsReply={t.needs_reply} />
            <TicketStatusPicker ticketId={t.id} status={t.status} />
          </div>
        ))}
      </div>
    </div>
  )
}
