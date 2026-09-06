import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const PRIMARY_CHAT_API = 'https://ebike-sales-nu.vercel.app/api/chat'

export async function POST(req: Request) {
  try {
    const { message, history } = await req.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    let custName = 'Cruise Member'
    let custPhone = ''
    let refCode = ''
    let bikeNames = 'Cruise the Creek E-Bike'

    if (user) {
      const { data: customer } = await supabase
        .from('customers')
        .select('first_name, last_name, phone, referral_code')
        .eq('id', user.id)
        .single()

      if (customer) {
        custName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Customer'
        custPhone = customer.phone || ''
        refCode = customer.referral_code || ''
      }

      const { data: bikes } = await supabase
        .from('bikes')
        .select('brand, model, purchase_date')
        .eq('customer_id', user.id)

      if (bikes && bikes.length > 0) {
        bikeNames = bikes.map(b => `${b.brand} ${b.model}`).join(', ')
      }
    }

    // Proxy request to the live Claude Haiku 4.5 Creek Concierge backend
    const pageContext = `https://portal.cruisethecreek.com/support - Logged In Customer: ${custName} | Member Referral Code: ${refCode || 'Active'} | Registered Bikes on File: ${bikeNames}`

    const upstreamPayload = {
      message,
      history: Array.isArray(history) ? history.slice(-10) : [],
      sessionId: `portal-${user?.id || 'guest'}`,
      page: pageContext,
      visitor: {
        name: custName,
        phone: custPhone,
        registeredBikes: bikeNames,
        referralCode: refCode,
        isPortalMember: true,
      },
    }

    try {
      const upstreamRes = await fetch(PRIMARY_CHAT_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://www.cruisethecreek.com',
        },
        body: JSON.stringify(upstreamPayload),
      })

      if (upstreamRes.ok) {
        const data = await upstreamRes.json()
        if (data && data.reply) {
          return NextResponse.json({
            reply: data.reply,
            history: data.history || [],
            customerName: custName,
            bikes: bikeNames,
          })
        }
      }
    } catch (fetchErr) {
      console.error('[portal concierge] upstream fetch failed:', fetchErr)
    }

    // Graceful fallback if upstream is momentarily unreachable
    return NextResponse.json({
      reply: `Hey ${custName}! I see you're riding your ${bikeNames}. I'm having a brief connection blip, but you can text Dru directly at 330-406-9682 or text the rentals desk at 330-406-9686 right away!`,
      history: [...(Array.isArray(history) ? history : []), { role: 'user', content: message }],
      customerName: custName,
      bikes: bikeNames,
    })
  } catch (error: any) {
    console.error('[portal concierge] error:', error)
    return NextResponse.json(
      { error: error?.message || 'Chat error' },
      { status: 500 }
    )
  }
}

