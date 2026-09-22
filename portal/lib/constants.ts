export const STORE_URL = (
  process.env.NEXT_PUBLIC_STORE_URL || 'https://cruisethecreek.com'
).replace(/\/$/, '')

/**
 * Where the Concierge chat function actually lives.
 *
 * NOT `${STORE_URL}/api/chat`. cruisethecreek.com is served by Cloudflare
 * Pages, which hosts the static storefront and nothing else — there is no
 * functions/ directory in that repo, so /api/* 404s there. The chat handler
 * is a Vercel serverless function on the ebike-sales project, which is why
 * the storefront's own widget (chatbot.js:19) hardcodes this same host
 * rather than calling a relative path.
 *
 * Pointing this at STORE_URL made every portal chat 404 and fall through to
 * the "I'm having a brief connection blip" fallback.
 */
export const CHAT_API_URL = (
  process.env.NEXT_PUBLIC_CHAT_API_URL || 'https://ebike-sales-nu.vercel.app/api/chat'
).replace(/\/$/, '')

/**
 * The CMS Apps Script deployment — the system of record for invoicing.
 *
 * The Google Sheet, not Supabase, is what the shop actually bills from:
 * invoice.html and balance.html read and write it, and the portal's copy is
 * a mirror. So marking an invoice paid in the portal without telling the
 * Sheet changes nothing real — it only repaints a badge.
 *
 * Not a secret: this exact URL is embedded in 37 public pages of the
 * storefront. It lives here rather than in an env var so that a missing
 * Vercel setting cannot silently turn Sheet writes back into cosmetic ones —
 * which is the failure this whole feature exists to remove. The env var still
 * overrides it if the deployment ever moves.
 *
 * This is the CMS project (…6xM0tEDAhcJA), which owns setInvoiceStatus. The
 * inventory project (…8Nd_gFLobsBE) is a different script and does not.
 */
export const APPS_SCRIPT_CMS_URL = (
  process.env.APPS_SCRIPT_CMS_URL ||
  'https://script.google.com/macros/s/AKfycbwXv6r6Me-mdp9WFjCHQYDHcgEKbny-9_K8TX-yGgW40yTONhz6kAs3H96xM0tEDAhcJA/exec'
).replace(/\/$/, '')
