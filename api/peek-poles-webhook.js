// api/peek-poles-webhook.js
// Vercel Serverless Function — Peek Pro booking webhook → igloohome time-bound
// PIN → email + SMS to the customer, for the self-serve Jetti walking-pole locker.
//
// FLOW
//   1. Peek Pro fires a booking webhook when a poles booking is confirmed.
//   2. We mint an igloohome offline "hourly" algoPIN valid for the booking
//      window — a random, 7–9 digit, time-sensitive code that works on the
//      lock with no internet (algoPIN technology).
//   3. We send that code to the customer by SMS (Twilio) and email (your
//      existing Apps Script MailApp), matching the "get your code by text"
//      step already on the site.
//
// ── ENV VARS (Vercel → Project → Settings → Environment Variables) ─────────
//   IGLOOHOME_CLIENT_ID       from the igloohome iglooaccess / developer portal
//   IGLOOHOME_CLIENT_SECRET   "
//   IGLOOHOME_DEVICE_ID       the padlock's device ID (igloohome portal or the
//                             GET /igloohome/devices API)
//   PEEK_WEBHOOK_TOKEN        a random secret you put on the Peek webhook URL as
//                             ?token=... — we reject requests without it
//   POLES_PRODUCT_MATCH       case-insensitive substring of the Peek product /
//                             experience name to act on (default: "jetti")
//   POLES_EMAIL_URL           Apps Script /exec that emails the code
//                             (see apps-script-poles-email.snippet.gs)
//   TWILIO_ACCOUNT_SID        Twilio (SMS)
//   TWILIO_AUTH_TOKEN         "
//   TWILIO_MESSAGING_SERVICE_SID  MG… — PREFERRED. Routes texts through your
//                             registered A2P 10DLC campaign. Set this once your
//                             Twilio Brand + Campaign show "Approved".
//   TWILIO_FROM               fallback if no messaging service is set: your
//                             Twilio number, e.g. +13305551234
//
// ── VERIFY BEFORE GO-LIVE ──────────────────────────────────────────────────
// I couldn't reach the live igloohome / Peek docs from the build sandbox, so
// three things are best-effort and should be confirmed on your first real test
// booking (this handler logs the raw Peek payload to make that easy):
//   • IGLOO_TOKEN_URL, IGLOO_API_BASE, and the hourly-algoPIN path + body
//     fields — check https://igloocompany.stoplight.io/docs/igloohome-api
//   • The Peek webhook field paths in parseBooking() — the raw payload is
//     logged so you (or I) can map the real field names.
//   • Peek "booking_update" fires on confirm/update/cancel; we act only on a
//     confirmed/booked status. See the idempotency note in the handler.

export const config = { api: { bodyParser: true } };

// igloohome API — confirm these against the current developer docs.
const IGLOO_TOKEN_URL = 'https://auth.igloohome.co/oauth2/token';   // OAuth2 client-credentials
const IGLOO_API_BASE  = 'https://api.igloodeveloper.co/igloohome';  // device operations base

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── 1. Authenticate the inbound webhook ─────────────────────────
  // Set the Peek webhook URL to  …/api/peek-poles-webhook?token=YOUR_SECRET
  const expected = process.env.PEEK_WEBHOOK_TOKEN;
  const got = (req.query && req.query.token) || req.headers['x-webhook-token'];
  if (!expected || got !== expected) {
    console.warn('[poles] rejected webhook: bad/missing token');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Log the raw payload once so the real Peek field shape can be confirmed.
  try { console.log('[poles] Peek payload:', JSON.stringify(req.body)); } catch (_) {}

  // ── 2. Parse + filter the booking ───────────────────────────────
  const booking = parseBooking(req.body);
  if (!booking) {
    // Not something we handle (e.g. a shape we couldn't read). 200 so Peek
    // doesn't retry a payload we've intentionally ignored.
    return res.status(200).json({ ignored: 'unparseable or non-booking payload' });
  }

  const match = (process.env.POLES_PRODUCT_MATCH || 'jetti').toLowerCase();
  const isPoles = String(booking.productName || '').toLowerCase().includes(match);
  const isConfirmed = ['confirmed', 'booked', 'paid', 'active'].includes(
    String(booking.status || '').toLowerCase()
  );
  if (!isPoles || !isConfirmed) {
    return res.status(200).json({ ignored: true, isPoles, status: booking.status });
  }

  // IDEMPOTENCY NOTE: booking_update can fire more than once for the same
  // booking. This stateless function will mint a fresh PIN each time it fires
  // for a confirmed poles booking. If Peek re-sends confirmations, add a guard
  // — e.g. only proceed when the event is the first confirmation, or record
  // booking.id in a sheet/KV and skip if already processed.

  if (!booking.startISO || !booking.endISO) {
    console.error('[poles] missing booking window', booking);
    return res.status(200).json({ error: 'missing booking start/end' });
  }

  try {
    // ── 3. Mint the igloohome time-bound PIN ──────────────────────
    const token = await getIglooToken();
    const deviceId = process.env.IGLOOHOME_DEVICE_ID;
    const { pin } = await createHourlyPin(token, deviceId, {
      startISO: booking.startISO,
      endISO:   booking.endISO,
      accessName: `Poles ${booking.reference || booking.name || ''}`.trim().slice(0, 40),
    });

    if (!pin) throw new Error('igloohome returned no PIN');

    // ── 4. Deliver by SMS + email (independently) ─────────────────
    const results = await Promise.allSettled([
      booking.phone ? sendSms(booking.phone, smsBody(booking, pin)) : Promise.resolve('no phone'),
      booking.email ? sendEmail(booking, pin)                        : Promise.resolve('no email'),
    ]);
    const sms   = results[0].status === 'fulfilled' ? 'sent' : String(results[0].reason);
    const email = results[1].status === 'fulfilled' ? 'sent' : String(results[1].reason);
    console.log('[poles] delivered', { reference: booking.reference, sms, email });

    return res.status(200).json({ success: true, sms, email });
  } catch (err) {
    console.error('[poles] failed:', err);
    // 500 so Peek retries — a transient igloohome/Twilio hiccup shouldn't drop
    // the code silently. (If you add idempotency, retries become safe.)
    return res.status(500).json({ error: err.message });
  }
}

// ── Peek payload → normalized booking ──────────────────────────────
// Field paths are best-effort across likely Peek shapes; the raw payload is
// logged above so these can be corrected against a real booking.
function parseBooking(body) {
  if (!body || typeof body !== 'object') return null;
  const b = body.booking || body.data || body.payload || body;
  const cust = b.customer || b.contact || b.guest || {};
  // Flat top-level keys are checked first so a simple Zapier "Data" mapping
  // (name/email/phone/start/end/product/status/reference) works directly;
  // nested shapes are kept as fallbacks for a native Peek webhook.
  const start = b.start || b.startDateTime || b.start_time || b.startTime || b.beginsAt;
  const end   = b.end   || b.endDateTime   || b.end_time   || b.endTime   || b.endsAt;
  const productName =
    (typeof b.product === 'string' ? b.product : '') ||
    b.productName || b.activityName || b.experienceName ||
    (b.product && (b.product.name || b.product.title)) ||
    (b.activity && b.activity.name) || b.title || '';
  return {
    reference: b.reference || b.confirmationCode || b.code || b.id || '',
    name:      b.name || cust.name || `${cust.firstName || ''} ${cust.lastName || ''}`.trim(),
    email:     b.email || cust.email || '',
    phone:     normalizePhone(b.phone || cust.phone || cust.phoneNumber || ''),
    status:    b.status || b.state || (body.event || '').replace(/^booking[_.]?/i, '') || '',
    startISO:  toISO(start),
    endISO:    toISO(end),
    productName,
  };
}

function toISO(v) {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

// E.164-ish: keep a leading +, strip other non-digits, default US +1 for 10-digit.
function normalizePhone(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const plus = s.startsWith('+');
  const digits = s.replace(/\D/g, '');
  if (plus) return '+' + digits;
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return digits ? '+' + digits : '';
}

// ── igloohome ──────────────────────────────────────────────────────
async function getIglooToken() {
  const id = process.env.IGLOOHOME_CLIENT_ID;
  const secret = process.env.IGLOOHOME_CLIENT_SECRET;
  if (!id || !secret) throw new Error('IGLOOHOME_CLIENT_ID/SECRET not configured');
  const basic = Buffer.from(`${id}:${secret}`).toString('base64');
  const r = await fetch(IGLOO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.access_token) {
    throw new Error(`igloohome token failed (${r.status}): ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

// Creates an hourly (time-bound) algoPIN valid for [startISO, endISO].
// variance:1 = a single unique PIN for the window. Confirm the exact path and
// body fields against the igloohome API docs.
async function createHourlyPin(token, deviceId, { startISO, endISO, accessName }) {
  if (!deviceId) throw new Error('IGLOOHOME_DEVICE_ID not configured');
  const url = `${IGLOO_API_BASE}/devices/${encodeURIComponent(deviceId)}/algopin/hourly`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      variance: 1,
      startDate: startISO,
      endDate: endISO,
      accessName: accessName || 'Jetti Poles',
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`igloohome create PIN failed (${r.status}): ${JSON.stringify(data)}`);
  // Response commonly returns { pin: "1234567", pinId: "..." }.
  return { pin: data.pin || data.pinCode || (data.data && data.data.pin), raw: data };
}

// ── Delivery ────────────────────────────────────────────────────────
function fmtWindow(booking) {
  const opts = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' };
  try {
    const s = new Date(booking.startISO).toLocaleString('en-US', opts);
    const e = new Date(booking.endISO).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
    return `${s}–${e}`;
  } catch (_) { return ''; }
}

function smsBody(booking, pin) {
  const when = fmtWindow(booking);
  return `Cruise the Creek — your Jetti walking pole locker code is ${pin}` +
    (when ? ` (valid ${when})` : '') +
    `. Kirk Road Trailhead: enter the code, grab the color-taped set for your size, and return + lock up when done. Text 330-406-9686 for help.`;
}

async function sendSms(to, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const msgService = process.env.TWILIO_MESSAGING_SERVICE_SID;  // MG… (preferred, A2P 10DLC)
  const from = process.env.TWILIO_FROM;                          // fallback: a raw Twilio number
  if (!sid || !token || (!msgService && !from)) {
    throw new Error('TWILIO_* not configured (need ACCOUNT_SID, AUTH_TOKEN, and MESSAGING_SERVICE_SID or FROM)');
  }
  // Prefer the Messaging Service so texts route through your registered 10DLC
  // campaign; fall back to a raw From number if no service SID is set.
  const params = { To: to, Body: body };
  if (msgService) params.MessagingServiceSid = msgService;
  else params.From = from;
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`twilio ${r.status}: ${data.message || JSON.stringify(data)}`);
  return data.sid;
}

// Emails via your Apps Script MailApp (see apps-script-poles-email.snippet.gs).
async function sendEmail(booking, pin) {
  const url = process.env.POLES_EMAIL_URL;
  if (!url) throw new Error('POLES_EMAIL_URL not configured');
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'polesAccessCode',
      to: booking.email,
      name: booking.name,
      pin,
      window: fmtWindow(booking),
      reference: booking.reference,
    }),
  });
  if (!r.ok) throw new Error(`apps-script email ${r.status}`);
  return 'sent';
}
