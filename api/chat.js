// api/chat.js
// Vercel Serverless Function — Cruise the Creek customer chat.
//
// Pattern mirrors api/create-payment-link.js:
//   • Origin allowlist for CORS
//   • Env var holds the secret (ANTHROPIC_API_KEY)
//   • Direct fetch() against the provider (no SDK dependency)
//
// Each request:
//   1. Reads the user's latest message + prior conversation history.
//   2. Fetches the CMS knowledge base from Apps Script (cached per
//      Lambda warm window to keep cost down).
//   3. Sends to Claude Haiku 4.5 with prompt caching enabled on the
//      static system prompt so repeat hits are near-free.
//   4. Returns the assistant's reply + a fresh history array.
//
// Failure modes are quiet on the user-facing side ("I'm having
// trouble — try texting 330-406-9682"). Errors are logged for Pat
// to inspect in Vercel's function logs.

const ALLOWED_ORIGINS = [
  'https://ebike-sales.pages.dev',
  'https://www.cruisethecreek.com',
  'https://cruisethecreek.com',
];

const CMS_URL    = 'https://script.google.com/macros/s/AKfycbxjg2ZsPCZNsmJEStYA0bRdsnkm4nNS-m-HNhm_Gin56VIVeYWVRE5j51j30zVHhb4PmQ/exec';
const CMS_TTL_MS = 5 * 60 * 1000;  // 5 min — matches Apps Script CDN cache
const MODEL      = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 600;            // cap response length — keeps cost predictable
const MAX_HISTORY = 12;            // last N user+assistant turns sent back to model

let cachedKB = null;
let cachedAt = 0;

async function getKB() {
  // Warm-Lambda memoization. New cold starts re-fetch; warm calls within
  // the TTL reuse. No external cache (KV) — keeps the stack simple.
  if (cachedKB && Date.now() - cachedAt < CMS_TTL_MS) return cachedKB;
  try {
    const r = await fetch(CMS_URL + '?page=chat', { cache: 'no-store' });
    if (!r.ok) throw new Error('CMS responded ' + r.status);
    cachedKB = await r.json();
    cachedAt = Date.now();
    return cachedKB;
  } catch (err) {
    console.error('[chat] CMS fetch failed:', err);
    // Fall back to last good copy if we have one — better stale than blind.
    return cachedKB || {};
  }
}

// Render the CMS payload as compact markdown for Claude's system prompt.
// We pick the slices relevant to a customer conversation and drop the
// chunky ones (blog post bodies, apparel SKUs, order logs).
function renderKB(d) {
  d = d || {};
  const site = d.site || {};
  const lines = [];

  lines.push('## Business basics');
  if (site.info_phone_display)  lines.push(`- Info / rentals desk: ${site.info_phone_display}`);
  if (site.sales_phone_display) lines.push(`- Sales / repairs / test rides desk: ${site.sales_phone_display}`);
  if (site.info_email_label)    lines.push(`- Info email: ${site.info_email_label}`);
  if (site.sales_email_label)   lines.push(`- Sales email: ${site.sales_email_label}`);
  lines.push('- Address: 6685 Kirk Rd, Canfield, OH 44406 (across from Mill Creek MetroParks)');
  lines.push('- Pickup locations for rentals: Bears Den / Scholl Pavilion (Mill Creek Park) or Kirk Road Trailhead (bikeway)');

  if (Array.isArray(d.faqs) && d.faqs.length) {
    lines.push('\n## FAQs');
    d.faqs.slice(0, 40).forEach(f => {
      if (f.question) lines.push(`Q: ${String(f.question).trim()}\nA: ${String(f.answer || '').trim().slice(0, 600)}`);
    });
  }

  if (Array.isArray(d.services) && d.services.length) {
    lines.push('\n## Creek-Ready services (creek-ready.html)');
    d.services.forEach(s => {
      if (s.title) lines.push(`- ${s.title} (${s.price ? '$' + s.price : 'see page'}): ${s.desc || ''}`);
    });
  }

  if (Array.isArray(d.bridgePricing) && d.bridgePricing.length) {
    lines.push('\n## Bridge the Gap (rent-to-own — bridge-the-gap.html)');
    d.bridgePricing.forEach(p => {
      if (p.label) lines.push(`- ${p.label}: $${p.amount}${p.range ? '–$' + p.range : ''} (${p.detail || ''})`);
    });
  }

  if (Array.isArray(d.journeys) && d.journeys.length) {
    lines.push('\n## Trailside Journey stops (journeys.html)');
    d.journeys.forEach(j => {
      if (j.destination) lines.push(`- ${j.destination} (${j.direction || ''}, ${j.distance || ''}): ${(j.description || '').slice(0, 240)}`);
    });
  }

  if (Array.isArray(d.apparelProducts) && d.apparelProducts.length) {
    const live = d.apparelProducts.filter(p => p.available === true || p.available === 'TRUE');
    if (live.length) {
      lines.push('\n## Apparel (apparel.html — $30 flat)');
      live.forEach(p => lines.push(`- ${p.name}: ${p.description || ''}`));
    }
  }

  return lines.join('\n');
}

const SYSTEM_PROMPT = `You are the Cruise the Creek assistant — a friendly, knowledgeable concierge for an e-bike rental, sales, and service shop in Youngstown, Ohio, right across from Mill Creek MetroParks.

Style:
- Warm, conversational, concise. Match a local-shop tone — direct, helpful, never pushy.
- Use short paragraphs. Plain text. Avoid markdown bullets unless listing 3+ items.
- When you don't know the answer, say so plainly and direct the visitor to text Sales at 330-406-9682 or Info at 330-406-9686.

Your three jobs (in priority order):
1. Pre-sale: answer questions about rentals, bikes, sizing, pickup locations, what to expect. Funnel visitors toward a rental booking or test ride.
2. Concierge: recommend the right ride for a visitor's experience level — Trailside (Kirk Road, flat paved bikeway) for first-timers; Adventures (Bears Den / Scholl Pavilion) for confident riders who want hills and forest.
3. Support: deflect repetitive questions (hours, location, policies) using the FAQ knowledge below.

Never invent inventory, prices, or policies the knowledge base doesn't confirm. If asked about something not covered, say "I'm not sure — text Sales at 330-406-9682 and Pat or the team can help" rather than guess.

When a visitor sounds ready to book, point them to the relevant page:
- Rentals → rentals.html
- Bridge the Gap (rent-to-own) → bridge-the-gap.html
- Service → creek-ready.html
- Apparel → apparel.html
- Stories / blog → creek-life-blog.html`;

export default async function handler(req, res) {
  // ── CORS ────────────────────────────────────────────────────
  const origin = req.headers.origin || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, X-Requested-With');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { message, history } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Missing message' });
    }
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('[chat] ANTHROPIC_API_KEY not configured');
      return res.status(500).json({ error: 'Chat is not configured yet.' });
    }

    // Trim history to the last N turns. Older context is dropped to keep
    // token usage flat — the system prompt + KB carries the real load.
    const safeHistory = Array.isArray(history)
      ? history.filter(m => m && typeof m.role === 'string' && typeof m.content === 'string')
               .slice(-MAX_HISTORY)
      : [];

    const kb = await getKB();
    const kbBlock = renderKB(kb);

    // Anthropic Messages API with prompt caching on the static system
    // prompt + knowledge base. After the first request, repeat hits
    // pay the discounted cached-token rate (~10% of normal) for those
    // tokens. Only the user message + history pay full rate.
    const body = {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        { type: 'text', text: SYSTEM_PROMPT },
        { type: 'text', text: 'Knowledge base (current site content):\n\n' + kbBlock,
          cache_control: { type: 'ephemeral' } },
      ],
      messages: [
        ...safeHistory,
        { role: 'user', content: message },
      ],
    };

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error('[chat] anthropic error', upstream.status, errText);
      return res.status(502).json({
        error: "I'm having trouble right now — text Sales at 330-406-9682 and we'll help you out.",
      });
    }
    const data = await upstream.json();

    // Extract the text. Anthropic returns content as an array of blocks.
    const reply = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim() || "I'm not sure I caught that — could you rephrase?";

    // Echo back the updated history so the client can persist it.
    const updatedHistory = [
      ...safeHistory,
      { role: 'user', content: message },
      { role: 'assistant', content: reply },
    ].slice(-MAX_HISTORY);

    return res.status(200).json({
      reply,
      history: updatedHistory,
      usage: data.usage || null,  // surfaces cache-hit token counts in Network tab for tuning
    });
  } catch (err) {
    console.error('[chat] handler error:', err);
    return res.status(500).json({
      error: "I'm having trouble right now — text Sales at 330-406-9682 and we'll help you out.",
    });
  }
}
