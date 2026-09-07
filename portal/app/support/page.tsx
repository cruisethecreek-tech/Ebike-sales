import { createClient } from '@/lib/supabase/server'
import TicketForm from './ticket-form'
import { StatusBadge } from '@/app/components/status-badge'
import { ConciergeChat } from './concierge-chat'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Support & Concierge — Cruise the Creek',
}

export default async function SupportPage() {
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

  const { data: tickets } = await supabase
    .from('service_tickets')
    .select(`
      id,
      ticket_type,
      status,
      description,
      created_at,
      bike_id,
      bikes(brand, model)
    `)
    .eq('customer_id', user.id)
    .order('created_at', { ascending: false })

  const customerName = customer ? `${customer.first_name} ${customer.last_name}` : 'Rider'
  const bikeSummary = (bikes || []).map(b => `${b.brand} ${b.model}`).join(', ')

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
          {/* Creek Ready Tune-Up Highlight Card */}
          <div className="p-5 rounded-2xl bg-[#1A2E1C] text-[#F5F0E8] shadow-sm space-y-3 border border-[#2D4A32]">
            <div className="flex items-center justify-between">
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#C9A96E] text-[#1A2E1C] font-bold uppercase tracking-wider">
                Signature Service · Member Benefit
              </span>
              <div className="text-right">
                <span className="text-xs text-gray-300 line-through mr-1.5">$125</span>
                <span className="text-xl font-bold text-[#C9A96E]">$100.00</span>
                <span className="block text-[10px] text-[#86EFAC] font-bold">20% OFF APPLIED</span>
              </div>
            </div>

            <h3
              className="uppercase tracking-wide text-2xl text-white"
              style={{ fontFamily: "'Bebas Neue', sans-serif" }}
            >
              🌲 Creek Ready Tune-Up
            </h3>

            <ul className="text-xs space-y-1.5 text-gray-300">
              <li>✓ Complete 28-point safety & electrical check</li>
              <li>✓ Hydraulic brake flush & lever adjustment</li>
              <li>✓ Drivetrain clean & electronic shifting tune</li>
              <li>✓ Motor diagnostics & firmware updates</li>
              <li>✓ Battery health check & tire optimization</li>
            </ul>

            <div className="space-y-2 pt-1">
              <a
                href={`https://ebike-sales-nu.vercel.app/repair-intake.html?service=tuneup&discount=20&promo=20OFF&firstName=${encodeURIComponent(customer?.first_name || '')}&lastName=${encodeURIComponent(customer?.last_name || '')}&phone=${encodeURIComponent(customer?.phone || '')}&email=${encodeURIComponent(user?.email || '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary text-xs w-full block text-center py-2.5 font-bold shadow-xs hover:scale-[1.01] transition-transform"
              >
                ⚡ Book Creek Ready Tune-Up ($100.00) ↗
              </a>
              <a
                href="https://ebike-sales-nu.vercel.app/creek-ready.html"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-center block text-[#C9A96E] hover:underline"
              >
                View Full Creek Ready Policy ↗
              </a>
            </div>
          </div>

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
      <div className="space-y-4">
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
          <div className="bg-white rounded-xl shadow-sm border border-[#E5E5E5] overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#F5F0E8] text-[#1A2E1C]">
                <tr>
                  <th className="p-3.5 border-b font-semibold text-xs uppercase tracking-wider">Type</th>
                  <th className="p-3.5 border-b font-semibold text-xs uppercase tracking-wider">Status</th>
                  <th className="p-3.5 border-b font-semibold text-xs uppercase tracking-wider">Bike</th>
                  <th className="p-3.5 border-b font-semibold text-xs uppercase tracking-wider">Description</th>
                  <th className="p-3.5 border-b font-semibold text-xs uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t: any) => (
                  <tr key={t.id} className="border-b last:border-0 hover:bg-[#FBF7EF] text-xs">
                    <td className="p-3.5 font-bold uppercase text-[#1A2E1C]">{t.ticket_type}</td>
                    <td className="p-3.5">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="p-3.5 font-medium text-[#2D4A32]">
                      {t.bikes?.brand ? `${t.bikes.brand} ${t.bikes.model}` : 'General / No bike'}
                    </td>
                    <td className="p-3.5 text-gray-600 max-w-sm truncate">{t.description}</td>
                    <td className="p-3.5 text-gray-400">{new Date(t.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
