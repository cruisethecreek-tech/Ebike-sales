import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { STORE_URL } from '@/lib/constants'

/**
 * Guard for the admin API routes that invoice.html calls.
 *
 * These routes run with SUPABASE_SERVICE_ROLE_KEY, which bypasses every RLS
 * policy, and they return or write customer records. They previously had no
 * authentication at all: a plain GET to /api/customers returned every
 * customer's name, email, phone and home address to anyone on the internet.
 *
 * They cannot use the Supabase session the way /api/concierge does —
 * invoice.html is a static page on the storefront origin with no portal
 * session — so they authenticate with a shared secret instead.
 *
 * FAILS CLOSED. If ADMIN_API_KEY is unset or blank, every request is rejected.
 * An unconfigured deployment must not silently serve customer data.
 */

const HEADER = 'x-ctc-admin-key'

/** Origins allowed to call these routes from a browser. */
function allowedOrigins(): string[] {
  const store = STORE_URL.replace(/\/$/, '')
  const out = new Set<string>([store])
  // The storefront is reachable with and without the www host.
  try {
    const u = new URL(store)
    const bare = u.host.replace(/^www\./, '')
    out.add(`${u.protocol}//${bare}`)
    out.add(`${u.protocol}//www.${bare}`)
  } catch {
    /* STORE_URL misconfigured — fall back to the literal value above */
  }
  return [...out]
}

/**
 * CORS headers echoing the caller's origin when it is allowed.
 * Not a security control on its own — curl ignores CORS entirely — but it
 * stops other sites driving these routes from a logged-in staff browser.
 */
export function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || ''
  const allowed = allowedOrigins()
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': `Content-Type, Authorization, ${HEADER}`,
    'Vary': 'Origin',
  }
}

/** Constant-time compare that does not leak length through early return. */
function secretsMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ab.length !== bb.length) {
    // Still burn a comparison so timing does not distinguish wrong-length
    // from wrong-value, then reject.
    try { timingSafeEqual(ab, ab) } catch { /* ignore */ }
    return false
  }
  return timingSafeEqual(ab, bb)
}

/**
 * Returns null when the request is authorised, or the 401/503 response to
 * return immediately when it is not.
 */
export function requireAdminKey(req: Request): NextResponse | null {
  const cors = corsFor(req)
  const expected = (process.env.ADMIN_API_KEY || '').trim()

  if (!expected) {
    console.error('[api-auth] ADMIN_API_KEY is not set — refusing the request')
    return NextResponse.json(
      { ok: false, error: 'Admin API is not configured.' },
      { status: 503, headers: cors },
    )
  }

  const supplied = (req.headers.get(HEADER) || '').trim()
  if (!supplied || !secretsMatch(supplied, expected)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized.' },
      { status: 401, headers: cors },
    )
  }
  return null
}
