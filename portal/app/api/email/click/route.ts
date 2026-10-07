import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isEmailToken, trackableUrl } from '@/lib/email-tracking'

// Links in customer emails go through here so customer_email_log knows they were
// clicked, then straight on to where the link pointed. Only the shop's sites
// and Stripe are allowed as destinations (trackableUrl); anything else lands
// on the home page.

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const target = trackableUrl(params.get('u'))
  const token = params.get('t')
  if (target && isEmailToken(token)) {
    const { error } = await createServiceClient().rpc('customer_email_log_hit', { p_token: token, p_what: 'click' })
    if (error) console.warn(`email click: ${error.message}`)
  }
  return NextResponse.redirect(target ? target.toString() : 'https://cruisethecreek.com/', 302)
}
