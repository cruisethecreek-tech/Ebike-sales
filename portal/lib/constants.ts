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
