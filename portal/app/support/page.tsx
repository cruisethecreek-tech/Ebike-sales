import { createClient } from '@/lib/supabase/server'
import TicketForm from './ticket-form'
import { StatusBadge } from '@/app/components/status-badge'
import { ConciergeChat } from './concierge-chat'
import { TuneUpCard } from './tune-up-card'
import { STORE_URL } from '@/lib/constants'
import { redirect } from 'next/navigation'
import { TicketThread, messagesByTicket, shopTime, type TicketMessage } from '@/app/components/ticket-thread'
import { MarkRepliesRead, TicketReplyBox } from './ticket-reply'

export const metadata = {
  title: 'Support & Concierge — Cruise the Creek',
}

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ bikeId?: string }>
}) {
  const { bikeId } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth')
  }

  const { data: customer } = await supabase
    .from('customers')
    .select('first_name, last_name, phone')
    .eq('id', user.id)
    .single()

  const { data: bikes } = await supabase
    .from('bikes')
    .select('id, brand, model, purchase_date')
    .eq('customer_id', user.id)

  // The bike is named by its foreign key: service_tickets has two keys to
  // bikes (bike_id alone, and bike_id + customer_id), so a bare bikes(...)
  // was ambiguous, the query errored, and every customer saw zero tickets.
  const { data: tickets } = await supabase
    .from('service_tickets')
    .select(`
      id,
      ticket_type,
      status,
      description,
      created_at,
      bike_id,
      customer_unread,
      bikes!service_tickets_bike_id_fkey(brand, model)
    `)
    .eq('customer_id', user.id)
    .order('created_at', { ascending: false })

  const { data: messageRows } = tickets?.length
    ? await supabase
        .from('ticket_messages')
        .select('id, ticket_id, from_staff, body, created_at')
        .in('ticket_id', tickets.map((t) => t.id))
        .order('created_at', { ascending: true })
    : { data: [] as TicketMessage[] }
  const threads = messagesByTicket(messageRows as TicketMessage[] | null)
  const hasUnread = (tickets || []).some((t: any) => t.customer_unread)

  const customerName = customer ? `${customer.first_name} ${customer.last_name}` : 'Rider'
  const bikeSummary = (bikes || []).map(b => `${b.brand} ${b.model}`).join(', ')

  // The bike card's Book button passes ?bikeId=; a rider with one bike
  // needs no pick. Either way the intake form opens with that bike filled
  // in instead of asking for what we already have on file.
  const bookBike = (bikes || []).find(b => b.id === bikeId) || (bikes?.length === 1 ? bikes[0] : null)
  const bikeParams = bookBike
    ? `&brand=${encodeURIComponent(bookBike.brand || '')}&model=${encodeURIComponent(bookBike.model || '')}`
    : ''

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-16">
      <div>
        <h1
          className="uppercase tracking-wide text-4xl text-[#2D4A32] mb-1"
          style={{ fontFamily: "'Bebas Neue', sans-serif" }}
        >
          🛠️ Support & Creek Concierge
        </h1>
        <p className="text-sm text-[#4A4A4A]">
          Direct help from Pat & Dru, Creek Ready Tune-Up booking, policies, and your 24/7 AI Concierge.
        </p>
      </div>

      {/* ── Top Grid: Concierge Chat & Creek Ready Policies ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Personalized Concierge Chat */}
        <div className="lg:col-span-7">
          <ConciergeChat
            customerName={customerName}
            bikeSummary={bikeSummary}
          />
        </div>

        {/* Creek Ready & Quick Policy Hub */}
        <div className="lg:col-span-5 space-y-4">
          {/* Creek Ready Tune-Up Highlight Card — a client component so it
              can follow the seasonal theme; see tune-up-card.tsx */}
          <TuneUpCard
            bookHref={`${STORE_URL}/repair-intake.html?service=tuneup&discount=20&promo=20OFF&firstName=${encodeURIComponent(customer?.first_name || '')}&lastName=${encodeURIComponent(customer?.last_name || '')}&phone=${encodeURIComponent(customer?.phone || '')}&email=${encodeURIComponent(user?.email || '')}${bikeParams}`}
            policyHref={`${STORE_URL}/creek-ready.html`}
          />

          {/* Quick Knowledge & Rules */}
          <div className="p-4 rounded-xl bg-white border border-[#E5E5E5] space-y-2 text-xs">
            <h4 className="font-bold text-[#1A2E1C] uppercase tracking-wider text-[11px]">
              📋 Essential Trail & Riding Guidelines
            </h4>
            <div className="space-y-1.5 text-[#4A4A4A]">
              <p>
                <strong>🌲 15 MPH Trail Limit:</strong> Respect pedestrians on Mill Creek MetroParks trails.
              </p>
              <p>
                <strong>🔋 Battery Storage:</strong> Keep battery above 50% indoors during winter.
              </p>
              <p>
                <strong>📞 Direct Line:</strong> Call or text Dru at{' '}
                <a href="tel:3304069682" className="text-[#2D4A32] font-bold underline">
                  (330) 406-9682
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Open a Service / Support Ticket ── */}
      <div className="bg-[#FBF7EF] p-6 rounded-2xl border border-[#E5E5E5] shadow-xs space-y-4">
        <div>
          <h2
            className="uppercase tracking-wide text-2xl text-[#2D4A32]"
            style={{ fontFamily: "'Bebas Neue', sans-serif" }}
          >
            ✉️ Open an Official Service Ticket
          </h2>
          <p className="text-xs text-[#4A4A4A]">
            Direct message sent to both Pat & Dru&apos;s admin dashboards for fast resolution.
          </p>
        </div>

        <TicketForm bikes={bikes || []} />
      </div>

      {/* ── Your Past Tickets ── */}
      <div id="tickets" className="space-y-4 scroll-mt-20">
        <h2
          className="uppercase tracking-wide text-2xl text-[#1A2E1C]"
          style={{ fontFamily: "'Bebas Neue', sans-serif" }}
        >
          Your Support History ({(tickets || []).length})
        </h2>

        {!tickets || tickets.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-xl border border-[#E5E5E5] text-xs text-gray-500">
            No past tickets on file. Open one above whenever you need service or advice!
          </div>
        ) : (
          <div className="space-y-3">
            {hasUnread && <MarkRepliesRead />}
            {tickets.map((t: any) => (
              <div
                key={t.id}
                className={`p-4 rounded-xl bg-white border shadow-sm space-y-3 ${t.customer_unread ? 'border-[#6B8F71]' : 'border-[#E5E5E5]'}`}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="font-bold uppercase text-[#1A2E1C]">{t.ticket_type}</span>
                  <StatusBadge status={t.status} />
                  {t.customer_unread && (
                    <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#2D4A32] text-white">
                      New reply
                    </span>
                  )}
                  <span className="font-medium text-[#2D4A32]">
                    {t.bikes?.brand ? `${t.bikes.brand} ${t.bikes.model}` : 'General / No bike'}
                  </span>
                  <span className="text-gray-400">{shopTime(t.created_at)}</span>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{t.description}</p>
                <TicketThread messages={threads.get(t.id) || []} viewer="customer" />
                <TicketReplyBox ticketId={t.id} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
