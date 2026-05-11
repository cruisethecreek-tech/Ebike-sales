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

  // Peek booking-flow stuck points + answers. The bot pattern-matches
  // a visitor's "I'm stuck" message against the situation column and
  // quotes the answer. Edited by Pat in the Booking_Troubleshooting
  // tab as he sees new friction in the wild.
  if (Array.isArray(d.bookingTroubleshooting) && d.bookingTroubleshooting.length) {
    lines.push('\n## Booking-flow troubleshooting (Peek)');
    lines.push('When a visitor describes one of these symptoms, respond with the matching answer. Adapt the wording to the conversation, but keep the specific instructions intact.');
    d.bookingTroubleshooting.forEach(t => {
      if (t.situation && t.answer) {
        lines.push(`- "${String(t.situation).trim()}" → ${String(t.answer).trim()}`);
      }
    });
  }

  // Booking URLs for each product. The bot quotes the matching URL to
  // the customer after submit_booking_lead succeeds so they can self-
  // serve the date/time/payment on Peek.
  if (Array.isArray(d.bookingLinks) && d.bookingLinks.length) {
    const usable = d.bookingLinks.filter(l => l.product && l.peek_url);
    if (usable.length) {
      lines.push('\n## Peek booking URLs (share with customer AFTER submit_booking_lead succeeds)');
      usable.forEach(l => lines.push(`- ${l.product}: ${l.peek_url}`));
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

==== BOOKING FLOW (use the submit_booking_lead tool) ====
When a visitor signals they want to book a rental — phrases like "I want to rent", "can I book", "do you have bikes Saturday", "how do I reserve", etc. — DON'T just send them to rentals.html. Walk them through a quick intake first, then call the submit_booking_lead tool to capture the lead. The tool delivers it to Pat's sales team.

Intake order (don't ask all at once — one or two at a time, conversational):
1. **Product fit**: ask about experience level + group, then recommend Trailside (first-timers, families, casual) or Adventures (confident riders who want hills/forest). If they're cost-curious about ownership, mention Bridge the Gap.
2. **Date + time**: when do they want to ride? Most rentals are 4-hour blocks; they can pick morning or afternoon.
3. **Group size**: how many bikes? (Fleet has 11 e-bikes — All-Purpose, High-Step, Cruiser, Cargo, E-Trike. Don't promise specific bikes — just collect the count.)
4. **Contact**: name + best phone OR email. Need at least one.

Once you have name + (email OR phone) + product + date + qty + pickup, CALL THE TOOL. Don't ask 10 questions before submitting — if the customer is brief, submit with what you have and put unanswered things in the "notes" field for Pat to follow up on.

If a Peek booking URL is available for the chosen product in the knowledge base ("Peek booking URLs" section), include it in the tool call's "peek_link" argument so the Sheet captures which link the customer got.

After the tool returns success, do TWO things in your confirmation:
  1. Confirm Pat will text/email to lock in time + send a payment link.
  2. If a Peek URL exists for their product, share it as a faster self-serve option: "Or jump straight to the calendar to lock in your time: <URL>".

Example: "Got it — Pat or the team will text within the hour to confirm. If you want to lock the time in faster, jump straight to the calendar here: https://book.peek.com/... Anything else I can help with?"

Don't repeat the booking ID unless asked. Don't share a Peek URL if the knowledge base doesn't have one for that product (e.g., Bridge the Gap uses an application form on bridge-the-gap.html instead).

If the customer just wants to self-serve without an intake, share the matching Peek URL from the knowledge base directly without calling the tool.

==== BOOKING SUPPORT (stuck on Peek) ====
If a visitor describes a problem partway through booking on Peek — "the calendar isn't loading", "I can't see any times", "it won't accept my card", "I'm stuck on the guest count step", etc. — check the "Booking-flow troubleshooting (Peek)" section in the knowledge base. If you find a matching situation, give the specific instruction from the answer. Don't paraphrase the exact button names or steps — those are calibrated.

If the visitor's symptom doesn't match any troubleshooting entry, say "I'm not sure what's happening on that screen — text Sales at 330-406-9682 with a quick description (or screenshot) and we'll walk you through it in real time." Don't guess.

==== OTHER PAGES (link, don't intake) ====
- Service → creek-ready.html
- Apparel → apparel.html
- Stories / blog → creek-life-blog.html
- Bridge the Gap (rent-to-own) → bridge-the-gap.html`;

// Tool definition handed to Claude. When the model decides to call this,
// it returns a tool_use block with the structured fields below; we
// execute it (POST to Apps Script) and feed the result back as a
// tool_result message so Claude can compose its final reply.
const TOOLS = [
  {
    name: 'submit_booking_lead',
    description: 'Submit a rental booking lead to the Cruise the Creek sales team. Call this when the visitor has shared at least their name, a contact (email or phone), product (Trailside / Adventures / Bridge the Gap / Other), date, and quantity. The team gets an email immediately and will follow up to confirm + send a payment link. Do NOT call this for general questions — only when the visitor is actively trying to book.',
    input_schema: {
      type: 'object',
      properties: {
        name:       { type: 'string', description: "Visitor's name." },
        email:      { type: 'string', description: 'Email address. Optional if phone provided.' },
        phone:      { type: 'string', description: 'Phone number. Optional if email provided.' },
        product:    { type: 'string', enum: ['Trailside', 'Adventures', 'Bridge the Gap', 'Other'],
                      description: 'Which Cruise the Creek product. Trailside = Kirk Road bikeway pickup. Adventures = Bears Den / Scholl Pavilion pickup in Mill Creek Park. Bridge the Gap = rent-to-own. Other = anything else.' },
        date:       { type: 'string', description: 'Requested date in plain language as the visitor said it (e.g., "Saturday May 18", "next Friday", "this weekend"). Don\'t reformat.' },
        time:       { type: 'string', description: 'Time of day or block (e.g., "morning", "1pm", "4-hour afternoon block"). Optional.' },
        qty:        { type: 'string', description: 'Number of bikes requested (e.g., "2", "4 plus a child seat").' },
        pickup:     { type: 'string', description: 'Pickup location — usually "Kirk Road Trailhead" for Trailside or "Bears Den / Scholl Pavilion" for Adventures. Use what the visitor said if they specified.' },
        experience: { type: 'string', enum: ['first-time', 'casual', 'confident', ''],
                      description: "Visitor's e-bike experience level. Empty string if not discussed." },
        notes:      { type: 'string', description: 'Anything else worth Pat knowing — special requests, group composition, accessibility, questions the bot couldn\'t answer, etc.' },
      },
      required: ['name', 'product', 'date', 'qty'],
    },
  },
];

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxjg2ZsPCZNsmJEStYA0bRdsnkm4nNS-m-HNhm_Gin56VIVeYWVRE5j51j30zVHhb4PmQ/exec';

// Server-side execution of the submit_booking_lead tool. Posts to the
// Apps Script endpoint which appends the row + emails the sales team.
async function execTool(name, input) {
  if (name !== 'submit_booking_lead') {
    return { ok: false, error: 'Unknown tool: ' + name };
  }
  try {
    const params = new URLSearchParams({ action: 'bookingLead' });
    Object.keys(input || {}).forEach(k => {
      if (input[k] != null) params.append(k, String(input[k]));
    });
    const r = await fetch(APPS_SCRIPT_URL + '?' + params.toString(), {
      method: 'GET', redirect: 'follow',
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { data = { ok: r.ok }; }
    return data;
  } catch (err) {
    console.error('[chat] tool exec failed:', err);
    return { ok: false, error: String(err) };
  }
}

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

    // Build the running message stack. Tool-use turns get pushed onto
    // this list inside the loop below — they're invisible to the user
    // but Claude needs to see them to compose a final reply.
    const messages = [
      ...safeHistory,
      { role: 'user', content: message },
    ];

    // The Anthropic Messages API tool-use loop. Up to 4 iterations:
    //   1. POST messages → model returns either text (done) or
    //      tool_use blocks (we have to execute + return results).
    //   2. If tool_use, append the assistant turn (with tool_use blocks)
    //      AND a user turn with matching tool_result blocks. POST again.
    //   3. Stop when stop_reason !== 'tool_use', or after the cap.
    // 4 iterations is plenty for our single-tool case but bounds runaway.
    let final = null;
    let toolUses = []; // for surfacing in response (debug + future tracking)
    for (let iter = 0; iter < 4; iter++) {
      const body = {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        tools: TOOLS,
        system: [
          { type: 'text', text: SYSTEM_PROMPT },
          { type: 'text', text: 'Knowledge base (current site content):\n\n' + kbBlock,
            cache_control: { type: 'ephemeral' } },
        ],
        messages: messages,
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
      final = data;

      const blocks    = data.content || [];
      const toolCalls = blocks.filter(b => b.type === 'tool_use');

      if (data.stop_reason !== 'tool_use' || toolCalls.length === 0) {
        // Final text reply ready.
        break;
      }

      // Execute each tool call in parallel and prep the tool_result
      // user turn that goes back to Claude for synthesis.
      const results = await Promise.all(toolCalls.map(async tc => {
        const out = await execTool(tc.name, tc.input || {});
        toolUses.push({ name: tc.name, input: tc.input, result: out });
        return {
          type: 'tool_result',
          tool_use_id: tc.id,
          content: JSON.stringify(out),
        };
      }));

      messages.push({ role: 'assistant', content: blocks });
      messages.push({ role: 'user',      content: results });
    }

    const reply = (final && final.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim() || "I'm not sure I caught that — could you rephrase?";

    // Echo back the updated user-visible history so the client can
    // persist it. Tool-use turns are NOT included — only the original
    // user message and the assistant's final text reply.
    const updatedHistory = [
      ...safeHistory,
      { role: 'user', content: message },
      { role: 'assistant', content: reply },
    ].slice(-MAX_HISTORY);

    return res.status(200).json({
      reply,
      history: updatedHistory,
      usage: (final && final.usage) || null,
      tools: toolUses.length ? toolUses : undefined, // present only when a tool fired
    });
  } catch (err) {
    console.error('[chat] handler error:', err);
    return res.status(500).json({
      error: "I'm having trouble right now — text Sales at 330-406-9682 and we'll help you out.",
    });
  }
}
