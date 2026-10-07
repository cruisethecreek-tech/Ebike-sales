import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isEmailToken } from '@/lib/email-tracking'

// The 1x1 image in customer emails. Loading it marks the email opened in
// customer_email_log. Public on purpose (mail apps carry no session); all it can do is
// bump the open count on the row whose random token it carries.

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('t')
  if (isEmailToken(token)) {
    const { error } = await createServiceClient().rpc('customer_email_log_hit', { p_token: token, p_what: 'open' })
    if (error) console.warn(`email open: ${error.message}`)
  }
  return new NextResponse(GIF, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    },
  })
}
