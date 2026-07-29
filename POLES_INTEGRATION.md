# Jetti Walking-Pole Self-Serve Locker — Integration Guide

End-to-end reference for the self-serve Jetti walking-pole rental at the **Kirk
Road Trailhead**. A customer books on Peek Pro, and the system automatically
mints a time-bound igloohome padlock code and delivers it by **text and email**
— no staff on site.

```
Peek Pro booking
      │  (Zapier "Booking Added or Updated" → Webhooks by Zapier → POST)
      ▼
api/peek-poles-webhook.js   (Vercel serverless function)
      │  1. auth token check
      │  2. parse + filter (product contains "jetti", status not cancelled/pending…)
      │  3a. idempotency: ask Apps Script if this booking ref already has a code
      │  3b. resolve a safe time window
      │  3c. mint igloohome hourly algoPIN (offline, 7–9 digit, time-bound)
      ▼
  ┌───────────────┬─────────────────────────────┐
  ▼               ▼                             ▼
Twilio SMS    Apps Script email            PolesCodes sheet
(A2P 10DLC)   (MailApp + audit log)        (permanent audit trail)
```

Everything the customer receives — code, valid window, color-key instructions —
is generated per booking. Codes work on the padlock **with no internet or
Bluetooth** (igloohome offline algoPIN).

---

## 1. Components

| Piece | Where it lives | What it does |
|---|---|---|
| `api/peek-poles-webhook.js` | This repo → deployed on **Vercel** | Booking → igloohome PIN → SMS + email. |
| `apps-script-poles-email.snippet.gs` | Paste into the **CMS Apps Script** (deployment `AKfycbwXv6r6…`) | Emails the code, logs to `PolesCodes`, answers idempotency lookups. |
| `poles.html` | This repo → `/poles` | Short-link that redirects to the Jetti Peek booking page (for the QR stand). |
| `qr/poles-qr-*.png`, `qr/poles-qr.svg` | This repo | QR codes encoding `https://www.cruisethecreek.com/poles`. |
| Zapier Zap | zapier.com | Fires the webhook on every Peek booking add/update. |
| Twilio Messaging Service | twilio.com | Sends the SMS through the registered A2P 10DLC campaign. |
| igloohome padlock | Kirk Road locker | The physical lock the algoPIN opens. |

---

## 2. Vercel environment variables

Set these in **Vercel → Project → Settings → Environment Variables**. Secrets
live here **only** — never in the repo, never in chat.

| Var | Required | Purpose |
|---|---|---|
| `IGLOOHOME_CLIENT_ID` | ✅ | igloohome developer OAuth2 client id. |
| `IGLOOHOME_CLIENT_SECRET` | ✅ | igloohome OAuth2 secret. **Vercel only.** |
| `IGLOOHOME_DEVICE_ID` | ✅ | The padlock's device id (igloohome portal or `GET /igloohome/devices`). |
| `PEEK_WEBHOOK_TOKEN` | ✅ | Random secret appended to the webhook URL as `?token=…`; requests without it are rejected 401. |
| `POLES_EMAIL_URL` | ✅ | Apps Script `/exec` URL that emails the code and answers idempotency lookups. |
| `POLES_PRODUCT_MATCH` | — | Case-insensitive substring the Peek product name must contain to act (default `jetti`). |
| `TWILIO_ACCOUNT_SID` | for SMS | Twilio account SID. |
| `TWILIO_AUTH_TOKEN` | for SMS | Twilio auth token. |
| `TWILIO_MESSAGING_SERVICE_SID` | for SMS | `MG…` — **preferred.** Routes texts through the A2P 10DLC campaign. Set once the Brand + Campaign show **Approved**. |
| `TWILIO_FROM` | fallback | A raw Twilio number, e.g. `+13305551234`, used only if no Messaging Service SID is set. |
| `POLES_DEFAULT_HOURS` | — | Assumed rental length when the booking's duration isn't mapped, and a start exists (default `4` = the longest Jetti rental, so no one is locked out; map the duration for exact windows). |
| `POLES_FALLBACK_HOURS` | — | Generous window when there was **no** start at all (default `26`, covers same-day + overnight). |
| `POLES_START_GRACE_HOURS` | — | Open the code this many hours *before* the booking start. Default `0` — the code activates **at** the booking time so nobody can open the shared locker before their slot. igloohome starts are on the hour, so any value > 0 opens a full hour early; leave at `0` unless you have a reason. |
| `POLES_END_GRACE_HOURS` | — | Keep the code valid this many hours *after* the rental ends, for a slightly-late return (default `2`). |

SMS is optional: with no Twilio vars the webhook still mints the code and emails
it — the SMS leg simply reports "not configured" and is skipped.

---

## 3. Zapier setup

1. **Trigger:** Peek Pro → *Booking Added or Updated*.
2. **Action:** *Webhooks by Zapier* → **POST**.
   - **URL:** `https://<your-vercel-domain>/api/peek-poles-webhook?token=YOUR_PEEK_WEBHOOK_TOKEN`
   - **Payload type:** JSON
   - **Data** (map from Peek fields):

     | Key | Value |
     |---|---|
     | `name` | Customer name |
     | `email` | Customer email |
     | `phone` | Customer phone |
     | `startDate` | Booking date (e.g. `August 1, 2026`) |
     | `start` | Booking start time (e.g. `4:00pm`) |
     | `product` | Product / experience name (must contain **jetti**) |
     | `status` | Booking status |
     | `reference` | Booking id / confirmation code |
     | `durationText` | Rate/option name (e.g. `2 Hour Jetti Rental`) — optional |

3. **Publish** the Zap. (A test run only proves mapping; it must be *published*
   to fire on real bookings.)

**Field notes**
- The handler combines `startDate` + `start` into one datetime and interprets a
  naive value as **America/New_York**. Mapping `startDate` is what makes the
  code's window match the actual ride — without it the window falls back to the
  generous `POLES_FALLBACK_HOURS` from "now".
- Keep the **Value** boxes clean — a stray character (a pasted "August" that
  became "ugust", extra instructions in the box) breaks date parsing.
- `status`: use only Peek's real status field. The handler ignores a booking
  whose status is cancelled/canceled/refunded/declined/failed/no_show/voided/
  abandoned/pending/unpaid/incomplete/draft; anything else (confirmed, booked,
  fulfilled…) passes.

---

## 4. Apps Script setup

In the CMS Apps Script (the deployment whose `doPost` already dispatches on
`action`), paste from `apps-script-poles-email.snippet.gs`:

1. Two dispatcher lines next to the existing cases:
   ```js
   if (action === 'polesAccessCode') return handlePolesAccessCode(p);
   if (action === 'polesCodeLookup') return handlePolesCodeLookup(p);
   ```
2. The `handlePolesAccessCode(p)` function (emails the customer + internal desks,
   appends to the `PolesCodes` tab).
3. The `handlePolesCodeLookup(p)` function (idempotency — scans `PolesCodes` for
   the booking ref).

Then **Deploy → Manage deployments → Edit → New version** (the `/exec` URL stays
the same). Put that `/exec` URL in Vercel's `POLES_EMAIL_URL`.

> **`PolesCodes` tab is required for idempotency + reschedule detection.** The
> first issued code auto-creates the tab with headers: `Issued at | Customer |
> Email | Code | Valid window | Booking ref | igloo PIN id | Booking start ISO |
> Booking end ISO`. The lookup matches on the **Booking ref** column and reads
> the start/end ISO to decide whether a repeat webhook is a duplicate or a
> reschedule, so idempotency only works once at least one code has been logged.
> Confirm the tab appears after your first real booking.

---

## 5. igloohome quirks

- **Auth:** OAuth2 *client-credentials* (`POST https://auth.igloohome.co/oauth2/token`,
  HTTP Basic with client id/secret).
- **PIN:** hourly algoPIN at
  `POST https://api.igloodeveloper.co/igloohome/devices/{deviceId}/algopin/hourly`,
  `variance: 1` (one unique PIN for the window).
- **Date format is strict:** `YYYY-MM-DDTHH:00:00±hh:mm` — **on the hour**, with
  an explicit offset, in the lock's timezone (America/New_York). `fmtIglooHour()`
  floors the start / ceils the end to the hour and stamps the ET offset
  (`-04:00` EDT, `-05:00` EST). A malformed value returns the API's
  `400 … 'startDate' must be in format …`.
- **Offline by design:** the algoPIN opens the lock with no phone, Bluetooth, or
  internet at the trailhead. You won't see it in the igloohome app unless you're
  in Bluetooth range of the lock — the customer's email/SMS is the source of
  truth for what code was issued (and so is the `PolesCodes` sheet).

### PIN reliability (why this setup is robust, and how to keep it that way)

The nightmare scenario for an unattended locker is a customer standing at the
trailhead with a code that won't open the lock. Three things guard against it:

1. **We use hourly (time-bound) algoPINs — not one-time PINs.** igloohome
   *one-time* PINs use a strict sequential counter: generate them out of order
   and earlier ones get invalidated, which for a booking system that fires
   webhooks in unpredictable order would be a disaster. Hourly PINs are keyed to
   absolute time instead, so bookings can be created in any order, any number of
   times, and each code just works during its window. **Keep using the
   `/algopin/hourly` endpoint** — don't switch to one-time PINs.

2. **End-side window grace.** The code stays valid a bit *after* the return time
   (`POLES_END_GRACE_HOURS`, default 1) so a slightly-late return still opens the
   lock. The *start* opens exactly at the booking time (`POLES_START_GRACE_HOURS`
   default 0) so nobody can open the shared locker before their slot and collide
   with the prior booking.

3. **Idempotency (see §4).** A repeat booking webhook re-sends the *same* code
   rather than minting a new one, so the lock never accumulates a pile of unused
   codes for one reservation.

**The one thing code can't fix: the lock's clock + battery.** Time-bound codes
trust the padlock's internal clock. It only re-syncs when the igloohome app is
near it over Bluetooth. So build this into your routine:

- **Weekly:** walk to the lock, open the igloohome app in Bluetooth range, let
  it auto-sync (this corrects clock drift and refreshes the lock).
- **On every battery change:** sync immediately afterward — a battery swap is the
  most common cause of clock drift.
- **Watch the battery level** in the igloohome app; replace before it's critical.

**Revocation / audit:** each issued code logs its igloohome **PIN id** to the
`PolesCodes` sheet (7th column). If a code is ever shared around or needs
killing, that id is what you use to delete the PIN via the igloohome API or app.

### Recovery runbook — "my code didn't work"

1. **Check the window.** Is the customer inside their booking window (± the grace
   hours)? Look up their row in `PolesCodes` for the exact valid window.
2. **Most likely cause: lock clock drift.** Walk to the lock with the igloohome
   app, sync it over Bluetooth. Re-test the customer's code.
3. **Still failing?** Read the Vercel function logs for that booking — confirm a
   PIN was actually minted (`[poles] minted PIN … pinId`) and delivered.
4. **Immediate customer fix:** you can generate a fresh hourly PIN on the spot
   from the igloohome app, or re-fire the Zap for that booking (idempotency means
   it re-sends the logged code; if you need a *new* code, generate it in the app).
5. **Battery low?** Replace it, then sync — and expect to re-sync the clock right
   after.

---

## 5b. Reschedules & cancellations (Peek "Booking Changes")

Peek's built-in **Booking Changes** feature lets customers reschedule or cancel
themselves. Here's how each interacts with the locker code:

- **Reschedule → a new code is issued automatically.** A reschedule re-fires the
  webhook. If the new booked start still falls inside the already-issued code's
  window, nothing changes (the existing code still works). If it's moved outside
  that window, the webhook mints a **fresh** code for the new time and emails it.
  The old code isn't revoked — it simply expires on its own.
- **Cancellation → the code is *not* revoked; it expires by time.** igloohome
  offline algoPINs are computed by the lock with no connectivity, so a code
  **cannot be killed remotely** — there is no way to reach the offline lock to
  invalidate it. A cancelled booking's code stays usable until its window ends.
  The mitigation is the tight window (`POLES_END_GRACE_HOURS`, default 2h after
  the rental), which bounds the exposure to a few hours. True real-time
  revocation would require an internet-connected lock, which this trailhead
  setup isn't.

Practical guidance: enabling **Cancel** is low-risk (honor system + short
window). **Reschedule** is safe now that a moved booking auto-issues a new code.

---

## 5c. Creek Concierge chat — code retrieval & troubleshooting

The site chatbot (`chatbot.js` → `api/chat.js`, a Claude agent) can help pole
renters directly:

- **Troubleshooting** — it knows the self-serve flow, the color-key, and the
  "code didn't work" steps (check spam, check you're inside the window, text the
  desk). Pure knowledge, no lookup.
- **Code retrieval — two-factor gated.** The `get_poles_code` tool returns a
  customer's code **only** when they supply BOTH their **email** and their
  **booking reference**, the reference exists in `PolesCodes`, the email matches
  that booking, and the code is **not expired**. The check is enforced
  server-side in `execTool` (not just the prompt), so a single factor — or a
  wrong email — never reveals a code. It reuses the same `polesCodeLookup` Apps
  Script action the webhook uses, so no extra Apps Script setup is required.

Expired codes are never shown (the bot points to re-booking instead), and a
mismatch reveals nothing about which field was wrong.

## 6. Twilio / A2P 10DLC

US application-to-person SMS requires 10DLC registration:

1. **Brand** (e.g. sole-proprietor) → **Campaign** → **Messaging Service**.
2. While the Brand/Campaign are *In Review*, texts may not deliver — email still
   works, so go live on email and switch SMS on when **Approved**.
3. Once approved, set `TWILIO_MESSAGING_SERVICE_SID` (`MG…`) in Vercel. The
   handler prefers the Messaging Service over a raw `TWILIO_FROM` number so all
   texts route through the registered campaign.

---

## 7. The `/poles` QR short-link

- `poles.html` serves at `/poles` (Cloudflare Pages clean URLs) and redirects to
  the Jetti Peek booking page. It's `noindex`.
- QR codes in `qr/` encode **`https://www.cruisethecreek.com/poles`** — the
  `www.` host is deliberate (the apex may not route sub-paths on Cloudflare).
- If `/poles` ever shows the homepage instead of redirecting, `poles.html` isn't
  deployed yet — merge it and re-check.

---

## 8. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `401 Unauthorized` from the webhook | Missing/wrong `?token=` vs `PEEK_WEBHOOK_TOKEN`. |
| `{ "ignored": true, "isPoles": false }` | Product name doesn't contain the `POLES_PRODUCT_MATCH` substring (default `jetti`). |
| `{ "ignored": true }` with a real status | Status is in the bad-status list (cancelled/pending/…). |
| `igloohome create PIN failed (400 … format …)` | Date not on-the-hour / missing offset — a `fmtIglooHour` input problem. Check the mapped `startDate`/`start`. |
| `igloohome token failed (401)` | `IGLOOHOME_CLIENT_ID/SECRET` wrong in Vercel. |
| Code emailed but no SMS | Twilio vars not set, or Brand/Campaign not yet Approved — expected until 10DLC clears. |
| Same booking issued two codes | `PolesCodes` tab missing or `reference` not mapped in Zapier, so the idempotency lookup can't find the prior row. |
| `/poles` shows the homepage | `poles.html` not deployed — merge and re-check. |
| Window doesn't match the ride | `startDate` not mapped in Zapier → handler used the generous fallback from "now". Map `startDate`. |
| Customer's code rejected at the lock | Almost always lock clock drift — sync the lock via the igloohome app over Bluetooth (see §5 recovery runbook). Check the battery. |

The webhook logs the **raw Peek payload** and a delivery summary to the Vercel
function logs, so a real booking is the fastest way to confirm field mapping.
