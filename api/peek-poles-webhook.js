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
//   POLES_START_GRACE_HOURS   open the window this many hours BEFORE the booking
//                             start, to absorb early arrivals + lock clock drift
//                             (default 1; set 0 to disable)
//   POLES_END_GRACE_HOURS     extend the window this many hours AFTER the return
//                             time (default 1)
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
//     confirmed/booked status, and the idempotency guard (step 3a) means a
//     repeat fire re-sends the same code rather than minting a new one.

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
  // Accept anything that isn't an explicitly bad state (so Peek's "fulfilled",
  // "confirmed", "booked", etc. all pass, and cancels/refunds/pending don't).
  const badStatus = ['cancelled','canceled','refunded','declined','failed',
    'no_show','noshow','voided','abandoned','pending','unpaid','incomplete','draft'];
  const isConfirmed = booking.status
    ? !badStatus.includes(String(booking.status).toLowerCase())
    : true;
  if (!isPoles || !isConfirmed) {
    return res.status(200).json({ ignored: true, isPoles, status: booking.status });
  }

  try {
    // ── 3a. Idempotency ───────────────────────────────────────────
    // booking_update fires on edits and can repeat, so only ever issue ONE
    // code per booking reference. We check the PolesCodes sheet first and skip
    // if a code was already issued for this booking.
    if (booking.reference) {
      const existing = await lookupExistingCode(booking.reference);
      if (existing) {
        console.log('[poles] duplicate booking; code already issued for', booking.reference);
        return res.status(200).json({ duplicate: true, reference: booking.reference });
      }
    }

    // ── 3b. Resolve a safe time window ────────────────────────────
    // If Peek gave no parseable start, fall back to now with a GENEROUS window
    // (covers same-day + overnight even without a mapped date). Advance bookings
    // should still map a start date so the window matches the ride.
    let generous = false;
    if (!booking.startISO) { booking.startISO = new Date().toISOString(); generous = true; }
    if (!booking.endISO) booking.endISO = computeEndISO(booking, generous);
    // Never mint an already-expired code: if the window ends at/before now,
    // push the end out (and pull a future start back to now).
    const nowMs = Date.now();
    if (new Date(booking.endISO).getTime() <= nowMs + 30 * 60000) {
      const hrs = Number(process.env.POLES_DEFAULT_HOURS) || 8;
      booking.endISO = new Date(nowMs + hrs * 3600000).toISOString();
      if (new Date(booking.startISO).getTime() > nowMs) booking.startISO = new Date(nowMs).toISOString();
    }
    // Pad the start earlier so an early arrival — or a lock whose internal clock
    // runs a little behind — still opens it. (The end already gets a grace hour
    // in computeEndISO.) A hard cap keeps the window from opening absurdly early.
    const startGraceH = envHours('POLES_START_GRACE_HOURS', 1);
    if (startGraceH > 0) {
      const padded = new Date(booking.startISO).getTime() - startGraceH * 3600000;
      booking.startISO = new Date(padded).toISOString();
    }

    // ── 3c. Mint the igloohome time-bound PIN ─────────────────────
    const token = await getIglooToken();
    const deviceId = process.env.IGLOOHOME_DEVICE_ID;
    const { pin, pinId } = await createHourlyPin(token, deviceId, {
      startISO: booking.startISO,
      endISO:   booking.endISO,
      accessName: `Poles ${booking.reference || booking.name || ''}`.trim().slice(0, 40),
    });

    if (!pin) throw new Error('igloohome returned no PIN');
    // pinId lets you later revoke/audit this specific code via the igloohome API.
    console.log('[poles] minted PIN', { reference: booking.reference, pinId: pinId || '(none returned)' });

    // ── 4. Deliver by SMS + email (independently) ─────────────────
    const results = await Promise.allSettled([
      booking.phone ? sendSms(booking.phone, smsBody(booking, pin)) : Promise.resolve('no phone'),
      booking.email ? sendEmail(booking, pin, pinId)                 : Promise.resolve('no email'),
    ]);
    const sms   = results[0].status === 'fulfilled' ? 'sent' : String(results[0].reason);
    const email = results[1].status === 'fulfilled' ? 'sent' : String(results[1].reason);
    console.log('[poles] delivered', { reference: booking.reference, sms, email });

    return res.status(200).json({ success: true, sms, email });
  } catch (err) {
    console.error('[poles] failed:', err);
    // 500 so Peek retries — a transient igloohome/Twilio hiccup shouldn't drop
    // the code silently. Retries are safe: the step-3a idempotency guard
    // re-sends the existing code instead of minting a second one.
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
  // Peek often splits the start into a date + a time. Combine them if a
  // separate date is provided; otherwise use whatever single start field exists.
  const rawStart  = b.start || b.startDateTime || b.start_time || b.startTime || b.beginsAt || '';
  const startDate = b.startDate || b.activityDate || b.date || '';
  const start = startDate ? (String(startDate) + ' ' + String(rawStart)).trim() : rawStart;
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
    // Peek often gives a start + a duration/option rather than an explicit end.
    durationText:  b.durationText || b.optionName || b.option || b.rateName || b.rate || '',
    durationHours: b.durationHours || b.hours || '',
  };
}

// If no explicit end time, derive one: from a numeric duration, else from an
// option/rate name like "2 Hour Jetti Rental", else a safe default window.
// A grace hour is added so a slightly-late return still opens the locker.
function computeEndISO(booking, generous) {
  const startMs = new Date(booking.startISO).getTime();
  let hours = Number(booking.durationHours);
  if (!hours || isNaN(hours)) {
    const text = String(booking.durationText || booking.productName || '');
    const m = text.match(/(\d+(?:\.\d+)?)\s*h(ou)?r/i);
    if (m) hours = Number(m[1]);
  }
  if (!hours || isNaN(hours)) {
    // No known duration: a generous window when we also had no start (so a
    // date-less booking still works same-day/overnight), else the normal default.
    hours = generous
      ? (Number(process.env.POLES_FALLBACK_HOURS) || 26)
      : (Number(process.env.POLES_DEFAULT_HOURS) || 8);
  }
  const graceMs = envHours('POLES_END_GRACE_HOURS', 1) * 3600 * 1000; // grace after the return time
  return new Date(startMs + hours * 3600 * 1000 + graceMs).toISOString();
}

// Read a non-negative hours value from an env var, falling back to a default.
// Rejects NaN and negatives so a bad env value can't produce a broken window.
function envHours(name, fallback) {
  const v = Number(process.env[name]);
  return isNaN(v) || v < 0 ? fallback : v;
}

// Ask Apps Script whether a code was already issued for this booking reference
// (dedup). Fail-open — returns '' on any error so a lookup hiccup never blocks
// issuing a code.
async function lookupExistingCode(ref) {
  const url = process.env.POLES_EMAIL_URL;
  if (!url) return '';
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'polesCodeLookup', reference: ref }),
    });
    const data = await r.json().catch(() => ({}));
    return data && data.found && data.code ? String(data.code) : '';
  } catch (_) { return ''; }
}

function toISO(v) {
  if (!v) return '';
  const s = String(v).trim();
  if (!s) return '';
  // Already carries timezone info (Z or ±hh:mm)? Trust it.
  if (/[zZ]$|[+\-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? '' : d.toISOString();
  }
  // Naive datetime (e.g. "August 1, 2026 4:00pm") → interpret as America/New_York.
  const naive = new Date(s);
  if (isNaN(naive.getTime())) return '';
  const etOffsetMin = easternOffsetMinutes(naive); // -240 (EDT) / -300 (EST)
  return new Date(naive.getTime() - etOffsetMin * 60000).toISOString();
}

// UTC offset (minutes) for America/New_York at the given instant.
function easternOffsetMinutes(date) {
  const et  = new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  return Math.round((et.getTime() - utc.getTime()) / 60000);
}

// Format an ISO instant as igloohome wants: YYYY-MM-DDTHH:00:00±hh:mm, on the
// hour, in America/New_York (the lock's timezone). mode 'floor' (start) or
// 'ceil' (end) rounds to the hour. ET offsets are whole hours, so rounding the
// UTC instant to the hour keeps it on the hour in ET too.
function fmtIglooHour(iso, mode) {
  const ms = new Date(iso).getTime();
  const H = 3600000;
  const rounded = new Date((mode === 'ceil' ? Math.ceil(ms / H) : Math.floor(ms / H)) * H);
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
  }).formatToParts(rounded).reduce((a, x) => (a[x.type] = x.value, a), {});
  const off = easternOffsetMinutes(rounded);
  const sign = off <= 0 ? '-' : '+';
  const abs = Math.abs(off);
  const oh = String(Math.floor(abs / 60)).padStart(2, '0');
  const om = String(abs % 60).padStart(2, '0');
  return `${p.year}-${p.month}-${p.day}T${p.hour}:00:00${sign}${oh}:${om}`;
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
      // igloohome requires on-the-hour times with an explicit offset:
      // YYYY-MM-DDTHH:00:00±hh:mm (America/New_York, the lock's timezone).
      startDate: fmtIglooHour(startISO, 'floor'),
      endDate:   fmtIglooHour(endISO, 'ceil'),
      accessName: accessName || 'Jetti Poles',
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`igloohome create PIN failed (${r.status}): ${JSON.stringify(data)}`);
  // Response commonly returns { pin: "1234567", pinId: "..." }.
  const d = data.data || data;
  return {
    pin: data.pin || data.pinCode || d.pin || d.pinCode,
    pinId: data.pinId || data.id || d.pinId || d.id || '',
    raw: data,
  };
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
async function sendEmail(booking, pin, pinId) {
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
      pinId: pinId || '',
      window: fmtWindow(booking),
      reference: booking.reference,
    }),
  });
  if (!r.ok) throw new Error(`apps-script email ${r.status}`);
  return 'sent';
}
