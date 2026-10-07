import { createClient } from '@/lib/supabase/server'
import { calculateBikeWarranties } from '@/lib/warranty'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Free Break-In Tune-Up — Cruise the Creek',
}

// The break-in tune is free, so it has no paid booking product. Riders text
// or call Andrew to set a time instead of landing on the $100 member tune-up.
const ANDREW_PHONE = '3304069682'
const ANDREW_PHONE_DISPLAY = '330-406-9682'

const INCLUDED = [
  'Bolts re-torqued after the first rides',
  'Brakes checked and adjusted',
  'Gears and shifting adjusted',
]

export default async function BreakInTuneUpPage({
  searchParams,
}: {
  searchParams: Promise<{ bikeId?: string }>
}) {
  const { bikeId } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const { data: customer } = await supabase
    .from('customers')
    .select('first_name, last_name')
    .eq('id', user.id)
    .maybeSingle()

  // RLS keeps this to the rider's own bikes; a missing or foreign id simply
  // shows the page without bike details.
  const { data: bike } = bikeId
    ? await supabase
        .from('bikes')
        .select('id, brand, model, purchase_date, warranty_expires_at, delivered_on')
        .eq('id', bikeId)
        .maybeSingle()
    : { data: null }

  const warranty = bike
    ? calculateBikeWarranties(bike.brand, bike.purchase_date, bike.warranty_expires_at, { deliveredOn: bike.delivered_on })
    : null
  const dueDate = warranty?.creekReadyKind === 'break-in' ? warranty.breakInDueDate : null
  const bikeName = bike ? `${bike.brand || ''} ${bike.model || ''}`.trim() : ''
  const riderName = customer ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim() : ''

  const smsBody = [
    `Hi Andrew, this is ${riderName || 'a Cruise the Creek customer'}.`,
    `I'd like to book my free break-in tune-up${bikeName ? ` for my ${bikeName}` : ''}.`,
    'What times work?',
  ].join(' ')
  const smsHref = `sms:${ANDREW_PHONE}?body=${encodeURIComponent(smsBody)}`

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-16">
      <Link href="/dashboard/bikes" className="text-xs font-semibold text-[#2D4A32] underline">
        ← Back to My Bikes
      </Link>

      <div className="rounded-2xl overflow-hidden shadow-sm border border-[#E5E5E5] bg-white">
        <div className="p-6 sm:p-8 text-white" style={{ background: 'linear-gradient(135deg, #2D4A32 0%, #1A2E1C 100%)' }}>
          <span className="inline-block px-3 py-1 rounded-full bg-[#C9A96E] text-[#1A2E1C] text-[11px] font-bold uppercase tracking-wider">
            Included with your bike · Free
          </span>
          <h1
            className="uppercase tracking-wide text-4xl mt-3"
            style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.04em' }}
          >
            🌲 Free Break-In Tune-Up
          </h1>
          <p className="text-sm text-white/85 mt-2">
            New bikes settle in over the first few rides: bolts loosen a little, cables stretch and
            brakes bed in. We tighten everything back up so your bike rides like day one, at no cost.
          </p>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          {(bikeName || dueDate) && (
            <div className="p-4 rounded-xl bg-[#F5F0E8] border border-[#E8DCC4] text-sm text-[#1A2E1C] space-y-1">
              {bikeName && <p><span className="font-bold">Bike:</span> {bikeName}</p>}
              {dueDate && (
                <p>
                  <span className="font-bold">Book by:</span> {dueDate.toLocaleDateString()}
                  {warranty?.breakInFromDelivery ? ' (30 days from delivery)' : ' (40 days from purchase, allowing for shipping)'}
                </p>
              )}
            </div>
          )}

          <div>
            <h2 className="font-bold text-[#1A2E1C] uppercase tracking-wider text-xs mb-2">What we do</h2>
            <ul className="space-y-1.5 text-sm text-[#4A4A4A]">
              {INCLUDED.map(item => (
                <li key={item}>✓ {item}</li>
              ))}
            </ul>
          </div>

          <div className="space-y-3">
            <h2 className="font-bold text-[#1A2E1C] uppercase tracking-wider text-xs">How to book</h2>
            <p className="text-sm text-[#4A4A4A]">
              Reach out to Andrew and he&apos;ll find a time that works for you.
            </p>
            <a
              href={smsHref}
              className="block w-full text-center py-3.5 px-4 rounded-xl bg-[#2D4A32] text-white text-sm font-bold hover:bg-[#1A2E1C] transition-colors shadow-sm"
            >
              💬 Text Andrew to Book
            </a>
            <a
              href={`tel:${ANDREW_PHONE}`}
              className="block w-full text-center py-3 px-4 rounded-xl border border-[#C9A96E] text-[#2D4A32] text-sm font-bold hover:bg-[#FBF7EF] transition-colors"
            >
              📞 Call Andrew · {ANDREW_PHONE_DISPLAY}
            </a>
          </div>

          <p className="text-[11px] text-gray-500">
            After the break-in tune, your bike moves to the annual 28-point Creek Ready service.
          </p>
        </div>
      </div>
    </div>
  )
}
