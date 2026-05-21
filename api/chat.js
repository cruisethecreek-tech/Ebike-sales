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

const CMS_URL    = 'https://script.google.com/macros/s/AKfycbwXv6r6Me-mdp9WFjCHQYDHcgEKbny-9_K8TX-yGgW40yTONhz6kAs3H96xM0tEDAhcJA/exec';
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

==== HARDLINE FACTS (always state these as fact) ====
- Texting is always faster than email. Sales / repairs / test rides: 330-406-9682. Info / rentals / tours: 330-406-9686. When the visitor needs a human, give them a text number — don't push email.
- Booked rentals: guests should arrive 15 minutes before their booked start time for a quick safety + bike intro.
- E-bike pricing by brand (typical retail ranges):
    • Jasion: $700–$1,500 — entry value, folding fat tires, value commuters.
    • Heybike: $900–$2,000 — wide range, fat tires, cargo, step-thru, all-purpose.
    • Velotric: $1,200–$2,500 — mid-to-premium, popular for Bridge the Gap.
    • Mooncool: $700–$2,000 — cruisers, e-trikes, value picks.
  If someone asks "how much is an e-bike", quote the brand they asked about (or all four if they're shopping broadly). Don't invent specific bike prices — for an exact quote, point them to the brand's page or text Sales.

==== PURCHASE INTENT (direct to brand pages) ====
When a visitor signals they want to BUY a bike (not rent — "I want to buy an e-bike", "looking for a bike for my wife", "shopping for myself", etc.), route them to the right brand page based on the conversation:
  - heybike.html for Heybike inventory
  - velotric.html for Velotric inventory
  - mooncool.html for Mooncool inventory
  - jasion.html for Jasion inventory
Don't try to close the sale yourself — these pages have the live inventory and configurator. Recommend a starting point based on what they said (budget, ride style, frame style), share the link, and offer to keep helping if they have questions.

**ALWAYS include the matching .html filename inline whenever you NAME any of these four brands** — the chat widget auto-links any "<word>.html" pattern, so the visitor gets a clickable link with zero extra work. This applies in every context the brand comes up, not just shopping intent: pricing comparisons, recommendations, "what's the difference between X and Y", service questions, etc. Examples:
  - GOOD: "Heybike (heybike.html) has the widest step-thru selection."
  - GOOD: "For a confident rider on a $1,500 budget, I'd start with Velotric — velotric.html has the full lineup."
  - GOOD: "Jasion (jasion.html) runs $700–$1,500, Heybike (heybike.html) runs $900–$2,000."
  - BAD:  "Heybike has step-thru options." ← missing the link, visitor has to navigate manually
  - BAD:  "Check our website for Velotric pricing." ← vague, no clickable target

**E-BIKE FINDER QUIZ** — When a buy-curious visitor doesn't know which brand or model fits them ("I don't know where to start", "what bike should I get", "help me pick", "I'm overwhelmed by the options", "between Heybike and Velotric?", "what's right for my wife / dad / commute"), recommend the interactive quiz before listing brand pages. It walks them through budget / ride style / frame preference / use case and matches them to specific bikes in our inventory — much higher signal than four brand-page links. Link it as \`quiz.html\`. Examples:
  - "Honestly, the fastest way to narrow it down is our E-Bike Finder quiz — quiz.html. Takes about 90 seconds and matches you to specific bikes we have in stock based on your budget, ride style, and how you'll use it. After that I can dig into whichever brand it surfaces."
  - "If you want a shortcut, try the quiz: quiz.html — it'll match her to a specific bike based on budget and ride style, and you can compare from there."

Use the quiz when the visitor is undecided. If they already named a specific brand or model, skip the quiz and go straight to that brand's page. Don't push the quiz on rental customers — it's a purchase-intent tool.

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

==== QUICK-REPLY CHIPS (reduce typing) ====
When you ask a question that has a small set of likely answers (product fit, date bucket, group size, experience level, yes/no, etc.), append a quick-reply marker to your message so the widget can render tappable chips. Format — must be the LAST line of your message, exactly this shape:

[OPTIONS: option 1 | option 2 | option 3 | option 4]

Rules:
- 2 to 4 options. Never more than 4 — chips get crowded.
- Keep each option short (1–4 words ideally, max 6).
- Always include at least one "escape hatch" option that lets the customer answer freeform if none fit (e.g. "Different date", "Something else", "Other group size"). The text input is always available too, but a chip option for unusual cases prevents people from feeling boxed in.
- Use chips for: product fit (Trailside / Adventures / Bridge the Gap / Other), date bucket (This weekend / Next weekend / Pick a date), group size (1 / 2 / 3-4 / 5+), experience (First-time / Casual / Confident / Mixed group), yes/no follow-ups (Yes / No / Maybe later).
- DON'T use chips for: contact info (name/email/phone — must be typed), free-form notes, troubleshooting answers (just give the instruction directly).

Example exchanges:

Q: "Got it. To start — which kind of ride sounds like you? [OPTIONS: First-time / chill / paved | Confident / want hills | Curious about owning | Not sure yet]"
A (chip tap): "First-time / chill / paved"
Q: "Perfect — Trailside it is. How many bikes? [OPTIONS: 1 | 2 | 3-4 | 5 or more]"
A (chip tap): "2"
Q: "When do you want to ride? [OPTIONS: This Saturday | This Sunday | Next weekend | Pick a different day]"
A (chip tap): "This Saturday"
Q: "And your name plus best phone or email?"   ← no chips — typed answer
A (typed): "Pat Simms, 330-555-1234"

Even with chips, your message text should still read naturally as a complete sentence — the [OPTIONS: ...] line is in addition to the question, not a replacement for it.

If the visitor's reply doesn't match any chip (they typed freeform), treat it like a normal answer.

==== STROLLER ADD-ON CHIPS (during booking) ====
The Peek "Who will be riding?" guests step has two optional add-ons that confuse a lot of visitors: **Toddler Stroller** (Peek labels it "Stroller Add-On" — for kids under 60 lbs) and **Pet Stroller** (for a small dog). Make these one-tap discoverable during the booking flow.

When the visitor has shared a group size during the intake — i.e., after step 3 of the intake (qty) — append a chip row to your follow-up message so they can learn about the strollers without typing:

[OPTIONS: What's the Toddler Stroller? | What's the Pet Stroller? | No add-ons needed | Continue]

Also show these chips when the visitor mentions they're on the Peek guests / "Who will be riding?" / rider-type step (whether or not the intake has happened — they may already be self-serving on Peek).

When a stroller chip is tapped, answer using the matching "Booking-flow troubleshooting (Peek)" entry from the knowledge base ("What is the Stroller Add-On" → toddler version; "What is the Pet Stroller" → pet version). After answering, re-offer the chip row so they can ask about the other one or proceed — e.g.,
[OPTIONS: What's the Pet Stroller? | No add-ons needed | Continue]
(Drop the chip they just asked about so the row evolves with the conversation.)

Don't show stroller chips outside the rental-booking context (apparel, service, blog questions, etc.) — only when the visitor is actively booking or stuck on the guests step.

==== OTHER PAGES (link, don't intake) ====
- Service → creek-ready.html
- Apparel → apparel.html
- Stories / blog → creek-life-blog.html
- Bridge the Gap (rent-to-own) → bridge-the-gap.html

==== WEATHER FORECAST (use the get_weather_forecast tool) ====
Riding e-bikes is weather-sensitive. When a visitor commits to a specific date during the booking intake (step 2), call get_weather_forecast with that date BEFORE confirming the booking — but only for dates within the next 14 days. Skip it for vague dates ("sometime next month"), past dates, or anything farther out than ~2 weeks. Skip it entirely outside the booking flow — don't volunteer forecasts during casual chat.

Resolve the visitor's date phrase to an ISO date (YYYY-MM-DD) in America/New_York before calling. "This Saturday" → the next Saturday from today. "Tomorrow" → today + 1 day. If unsure, ask once for clarification instead of guessing.

After the tool returns, weave the forecast into your next reply conversationally — DON'T dump raw numbers. One short sentence is plenty. Examples:

GOOD: "Saturday's looking great — sunny, around 72°. Want to go morning or afternoon?"
GOOD: "Heads up — Friday's calling for rain (70% chance), but Saturday clears up. Want to push to Saturday?"
GOOD: "It's going to be a hot one — mid-90s. Morning ride would be more comfortable. Want the 9am or 10am block?"
BAD:  "The forecast shows a high of 72°F, low of 58°F, 10% precip, 8mph wind." ← too clinical
BAD:  "Per the National Weather Service…" ← never cite the source

Treat the forecast as advisory, not a hard block. The visitor can ride in rain if they want — just flag it so they're not surprised. If precipitation_chance is ≥ 60% OR conditions mention "thunderstorm", proactively suggest a rain-check or an alternate dry day in the same week.

If the tool fails (network glitch, date out of range), don't apologize at length — just skip the forecast and continue the booking flow normally. The forecast is a nice-to-have, not a blocker.`;

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
  {
    name: 'get_weather_forecast',
    description: "Get the weather forecast for a specific date at Cruise the Creek's location in Canfield, OH. Call this during the booking intake AFTER the visitor commits to a specific date within the next 14 days, BEFORE confirming the booking. Skip for vague dates, past dates, or dates farther than ~2 weeks out. Don't volunteer forecasts outside the booking flow. Returns conditions, high/low temp (°F), precipitation chance (%), and wind (mph) — use these to inform the conversation, don't dump them raw on the visitor.",
    input_schema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Target date in ISO format YYYY-MM-DD, resolved in America/New_York. Must be today through 14 days out. Resolve visitor phrases ("this Saturday", "tomorrow") to ISO before calling.',
        },
      },
      required: ['date'],
    },
  },
];

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwXv6r6Me-mdp9WFjCHQYDHcgEKbny-9_K8TX-yGgW40yTONhz6kAs3H96xM0tEDAhcJA/exec';

// Cruise the Creek shop coordinates (6685 Kirk Rd, Canfield, OH 44406).
// Used by get_weather_forecast — fixed because rentals all pick up within
// a few miles of this location.
const SHOP_LAT = 40.9778;
const SHOP_LON = -80.7656;

// Open-Meteo WMO weather code → short human label. Trimmed to the codes
// that actually appear in NE Ohio. Anything unmapped falls through as
// "mixed conditions" so the bot has something sensible to say.
function describeWeatherCode(code) {
  const c = Number(code);
  if (c === 0) return 'clear';
  if (c === 1) return 'mostly clear';
  if (c === 2) return 'partly cloudy';
  if (c === 3) return 'overcast';
  if (c === 45 || c === 48) return 'foggy';
  if (c >= 51 && c <= 57) return 'drizzle';
  if (c >= 61 && c <= 67) return 'rain';
  if (c >= 71 && c <= 77) return 'snow';
  if (c >= 80 && c <= 82) return 'rain showers';
  if (c === 85 || c === 86) return 'snow showers';
  if (c >= 95) return 'thunderstorms';
  return 'mixed conditions';
}

// Fetch a daily forecast from Open-Meteo for the shop's location.
// Open-Meteo is free + no API key — see https://open-meteo.com/en/docs.
async function fetchForecast(isoDate) {
  // Range gate: today through +14 days, EST-anchored.
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  today.setHours(0, 0, 0, 0);
  const target = new Date(isoDate + 'T00:00:00');
  if (isNaN(target.getTime())) return { ok: false, error: 'Invalid date format. Use YYYY-MM-DD.' };
  const daysOut = Math.round((target - today) / 86400000);
  if (daysOut < 0)  return { ok: false, error: 'Date is in the past.' };
  if (daysOut > 14) return { ok: false, error: 'Date is more than 14 days out — forecast not available yet.' };

  const url = 'https://api.open-meteo.com/v1/forecast'
    + '?latitude='  + SHOP_LAT
    + '&longitude=' + SHOP_LON
    + '&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max'
    + '&temperature_unit=fahrenheit'
    + '&windspeed_unit=mph'
    + '&timezone=America/New_York'
    + '&start_date=' + isoDate
    + '&end_date='   + isoDate;

  const r = await fetch(url);
  if (!r.ok) throw new Error('Open-Meteo HTTP ' + r.status);
  const data = await r.json();
  const d = data.daily || {};
  if (!Array.isArray(d.time) || !d.time.length) {
    return { ok: false, error: 'No forecast data returned for ' + isoDate };
  }
  const idx = 0;
  return {
    ok: true,
    date:                 d.time[idx],
    conditions:           describeWeatherCode(d.weathercode[idx]),
    high_f:               Math.round(d.temperature_2m_max[idx]),
    low_f:                Math.round(d.temperature_2m_min[idx]),
    precipitation_chance: d.precipitation_probability_max[idx],
    wind_mph:             Math.round(d.windspeed_10m_max[idx]),
    location:             'Canfield, OH',
  };
}

// Server-side execution of chat tools. The model calls one of these by
// name; we run the side effect (Apps Script POST, Open-Meteo GET, etc.)
// and hand the JSON back to the model for synthesis.
async function execTool(name, input) {
  if (name === 'submit_booking_lead') {
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
      console.error('[chat] booking tool exec failed:', err);
      return { ok: false, error: String(err) };
    }
  }

  if (name === 'get_weather_forecast') {
    try {
      const date = String((input && input.date) || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return { ok: false, error: 'date must be YYYY-MM-DD format' };
      }
      return await fetchForecast(date);
    } catch (err) {
      console.error('[chat] weather tool exec failed:', err);
      return { ok: false, error: String(err) };
    }
  }

  return { ok: false, error: 'Unknown tool: ' + name };
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
    const { message, history, visitor, page } = req.body || {};
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
    // Mascot persona — taken from SiteConfig.mascot_*. When the name
    // is set, the bot speaks in-character. The chatbot widget renders
    // the avatar separately; this block just shapes the voice.
    const mascotName = (kb && kb.site && kb.site.mascot_name)  || '';
    const mascotBio  = (kb && kb.site && kb.site.mascot_bio)   || '';
    let mascotBlock = '';
    if (mascotName.trim()) {
      mascotBlock = 'You ARE the Cruise the Creek mascot. Your name is "' + mascotName.trim() + '"' +
        (mascotBio.trim() ? ' — ' + mascotBio.trim() : '') + '. ' +
        'Refer to yourself by this name. Sign messages with personality and warmth ' +
        '(a touch of trail/outdoors flavor is welcome). Don\'t break character to say ' +
        '"as an AI" — you\'re the shop\'s friendly mascot, period. Substance over schtick: ' +
        'lead with helpful answers, not bear puns.';
    }

    // Build the visitor context block — injected after the cached KB
    // so it doesn't bust the prompt cache. Per-visitor info changes
    // every conversation, so it stays uncached on purpose.
    let visitorBlock = '';
    if (visitor && typeof visitor === 'object' && visitor.first) {
      const v = visitor;
      const contact = [v.email && ('email ' + v.email), v.phone && ('phone ' + v.phone)]
        .filter(Boolean).join(' / ');
      visitorBlock = 'You are currently chatting with:\n' +
        '- Name: ' + (v.first || '') + (v.last ? ' ' + v.last : '') + '\n' +
        (contact ? '- Contact: ' + contact + '\n' : '') +
        '- Reason given for chat: ' + (v.reason || '(unspecified)') + '\n\n' +
        'Greet them by first name on your very first reply. Steer the conversation toward their stated reason, but stay flexible — if they pivot, follow. When you call submit_booking_lead, prefer the contact info above over re-asking; only ask again for fields they didn\'t fill in.';
    }

    let toolUses = []; // for surfacing in response (debug + future tracking)
    // Current date + time in America/New_York — injected every request so
    // the model can resolve "today", "tomorrow", "this Saturday", etc.,
    // and adjust tone for morning vs evening. Without it Claude anchors
    // to its training-cutoff date and tells visitors their booking date
    // "has already passed."
    const nowET = new Date().toLocaleDateString('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }); // → YYYY-MM-DD
    const weekdayET = new Date().toLocaleDateString('en-US', {
      timeZone: 'America/New_York', weekday: 'long',
    });
    const timeET = new Date().toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
    const hourET = Number(new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York', hour: 'numeric', hour12: false,
    }));
    const timeBucket = hourET < 5  ? 'late night'
                     : hourET < 12 ? 'morning'
                     : hourET < 17 ? 'afternoon'
                     : hourET < 21 ? 'evening'
                                   : 'late night';
    const dateBlock = 'Right now it is ' + weekdayET + ', ' + nowET + ' at ' +
      timeET + ' America/New_York (' + timeBucket + '). Resolve every date ' +
      'phrase the visitor uses ("today", "tomorrow", "this Saturday", ' +
      '"next Friday", "may 16th") against this. Match greeting tone to ' +
      'the time bucket when natural (a morning visitor gets "morning!", ' +
      'an evening one gets "hey, good evening"). Don\'t rely on your ' +
      'training-cutoff date.';

    // Current-page context. The chatbot widget sends the visitor's URL on
    // every request — turn it into a short label the model can reason
    // about. "velotric.html" → the bot knows they're shopping Velotric and
    // can answer "is this any good?" without asking what "this" refers to.
    // Without this, the model is blind to the surrounding page.
    let pageBlock = '';
    const rawPage = String(page || '').trim();
    if (rawPage) {
      let slug = rawPage;
      try { slug = new URL(rawPage).pathname; } catch (e) { /* not a full URL */ }
      slug = slug.replace(/^\/+|\/+$/g, '').replace(/\.html?$/i, '').toLowerCase();
      const PAGE_LABELS = {
        '':                'the home page (index.html) — the main hub with all the tile menus',
        'index':           'the home page (index.html) — the main hub with all the tile menus',
        'rentals':         'the rentals overview page (rentals.html)',
        'trailside':       'the Trailside rental product page — Kirk Road Trailhead pickup, paved bikeway, beginner-friendly',
        'adventures':      'the Adventures rental product page — Bears Den / Scholl Pavilion pickup, hills + forest, confident riders',
        'bridge-the-gap':  'the Bridge the Gap rent-to-own program page — 15 bi-weekly payments then they own the bike',
        'long-term-rental':'the long-term rental page (currently "Coming Soon")',
        'shop':            'the shop landing page (shop.html) — overview of all four bike brands',
        'heybike':         'the Heybike brand page — wide range, fat tires, cargo, step-thru ($900–$2,000)',
        'velotric':        'the Velotric brand page — mid-to-premium, popular for Bridge the Gap ($1,200–$2,500)',
        'mooncool':        'the Mooncool brand page — cruisers, e-trikes, value picks ($700–$2,000)',
        'jasion':          'the Jasion brand page — entry value, folding fat tires ($700–$1,500)',
        'quiz':            'the e-bike finder quiz — matches visitors to specific in-stock bikes',
        'test-ride':       'the test ride booking page',
        'creek-ready':     'the Creek Ready services landing page (tune-ups, assembly, repairs)',
        'tune-ups':        'the tune-ups service page',
        'assembly':        'the assembly service page',
        'safety':          'the safety / riding guide page',
        'apparel':         'the apparel shop page ($30 flat tees)',
        'gallery':         'the photo gallery page',
        'events':          'the events page',
        'journeys':        'the Trailside Journeys page — destinations reachable from Kirk Road',
        'donate':          'the donation / supporters page',
        'faqs':            'the FAQs page',
        'our-story':       'the Our Story / about page',
        'creek-life-blog': 'the Creek Life blog index',
        'blog-post':       'an individual blog post',
        'bridge-the-gap-application': 'the Bridge the Gap application form',
      };
      const label = PAGE_LABELS[slug] || ('the ' + slug.replace(/-/g, ' ') + ' page');
      pageBlock = 'The visitor is currently on ' + label +
        '. Tailor your replies to this context: if they say "this", "it", ' +
        '"is it any good", "how much", etc., assume they\'re referring to ' +
        'what\'s on this page unless they say otherwise. Don\'t re-pitch ' +
        'the page they\'re already on — answer the question directly.';
    }

    for (let iter = 0; iter < 4; iter++) {
      const systemBlocks = [
        { type: 'text', text: SYSTEM_PROMPT },
        { type: 'text', text: 'Knowledge base (current site content):\n\n' + kbBlock,
          cache_control: { type: 'ephemeral' } },
        { type: 'text', text: dateBlock },
      ];
      if (pageBlock)    systemBlocks.push({ type: 'text', text: pageBlock });
      if (mascotBlock)  systemBlocks.push({ type: 'text', text: mascotBlock });
      if (visitorBlock) systemBlocks.push({ type: 'text', text: visitorBlock });

      const body = {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        tools: TOOLS,
        system: systemBlocks,
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

    // Fire-and-forget log to the Chat_Logs Sheet tab so Pat can review
    // what visitors are asking about. Errors swallowed — logging is
    // never allowed to fail the user-visible response. Apps Script
    // returns no CORS headers so we use a no-await fetch.
    try {
      const logParams = new URLSearchParams({
        action:    'chatLog',
        sessionId: String((req.body && req.body.sessionId) || 'unknown').slice(0, 64),
        page:      String((req.body && req.body.page)      || '').slice(0, 200),
        userMsg:   String(message || '').slice(0, 2000),
        botMsg:    String(reply   || '').slice(0, 2000),
      });
      fetch(APPS_SCRIPT_URL + '?' + logParams.toString(), { method: 'GET' })
        .catch(err => console.warn('[chat] log fetch failed:', err));
    } catch (logErr) { console.warn('[chat] log build failed:', logErr); }

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
