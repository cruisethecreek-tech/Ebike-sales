// api/stripe-webhook.js
// Vercel Serverless Function — receives Stripe webhook events and forwards
// "invoice paid" notifications to Apps Script Project C, which flips the
// Invoices sheet row to paid.
//
// Setup:
//   1. Deploy this. Endpoint URL: https://ebike-sales-nu.vercel.app/api/stripe-webhook
//   2. Stripe Dashboard → Developers → Webhooks → Add endpoint
//      • URL above
//      • Events: invoice.paid
//      • Reveal the signing secret (whsec_…) and set STRIPE_WEBHOOK_SECRET
//        in Vercel project env vars.
//   3. Project C Apps Script needs handleMarkInvoicePaid() — see
//      apps-script-project-c.snippet.gs in the repo root for the paste-in.
//
// Important: Vercel's default body parser strips the raw bytes we need for
// Stripe signature verification, so we disable it and read the stream
// manually.

import crypto from 'crypto';

export const config = {
  api: { bodyParser: false },
};

const PROJECT_C_URL = 'https://script.google.com/macros/s/AKfycbxmzlQHP4ghYbTzInhTANG7Wv9Cjj4dHTPFv-m8Q7GYPwbtx0yC7ydt8Nd_gFLobsBE/exec';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (err) {
    console.error('Failed to read raw body:', err);
    return res.status(400).json({ error: 'Bad request body' });
  }

  // ── Verify signature ──────────────────────────────────────
  const sigHeader = req.headers['stripe-signature'];
  if (!sigHeader || !verifyStripeSignature(rawBody, sigHeader, secret)) {
    console.warn('Webhook signature mismatch');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    return res.status(400).json({ error: 'Bad JSON' });
  }

  // We only care about invoice.paid for the Sheet update. Stripe also fires
  // invoice.payment_succeeded around the same time, but invoice.paid is the
  // definitive "state = paid" event and avoids double-processing.
  if (event.type !== 'invoice.paid') {
    return res.status(200).json({ received: true, ignored: event.type });
  }

  const invoice = event.data && event.data.object;
  if (!invoice) {
    return res.status(200).json({ received: true, error: 'no invoice object' });
  }

  const ourInvoiceNumber = invoice.metadata && invoice.metadata.ourInvoiceNumber;
  const source           = invoice.metadata && invoice.metadata.source;

  // Apparel orders ('CTC-AP') don't have a per-order Sheet row keyed by
  // invoice number — they're keyed by server-generated id. The webhook
  // can't usefully update those, so ACK and move on.
  if (!ourInvoiceNumber || source === 'apparel.html') {
    return res.status(200).json({
      received: true,
      skipped:  'no invoice.html row to update',
      ourInvoiceNumber,
      source,
    });
  }

  // Best-effort payment method extraction. invoice.charge gets us a Charge
  // object id; we'd need a second API call to get the method. Cheaper signal
  // is invoice.collection_method + presence of payment_intent vs settled
  // via Terminal. The amount + currency is always available.
  const amountPaid = ((invoice.amount_paid || 0) / 100).toFixed(2);
  const paidAt     = invoice.status_transitions && invoice.status_transitions.paid_at
                       ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
                       : new Date().toISOString();

  // Forward to Project C. JSONP-style GET with action=markInvoicePaid
  // matches the rest of that script's surface.
  const params = new URLSearchParams({
    action:          'markInvoicePaid',
    invoiceNumber:   ourInvoiceNumber,
    stripeInvoiceId: invoice.id || '',
    stripeInvoiceNumber: invoice.number || '',
    amountPaid,
    currency:        (invoice.currency || 'usd').toUpperCase(),
    paidAt,
    hostedInvoiceUrl: invoice.hosted_invoice_url || '',
    customerEmail:   invoice.customer_email || '',
  });

  try {
    const r = await fetch(PROJECT_C_URL + '?' + params.toString(), { method: 'GET' });
    // Apps Script returns 302 to a content-redirect; following it gives the
    // JSON body. fetch follows redirects by default.
    const text = await r.text();
    if (!r.ok) {
      console.error('Project C markInvoicePaid failed:', r.status, text.slice(0, 500));
      // Return 500 so Stripe retries — transient Apps Script blips shouldn't
      // drop the paid signal.
      return res.status(500).json({ error: 'Project C call failed', status: r.status });
    }
    return res.status(200).json({ received: true, projectCResponse: text.slice(0, 500) });
  } catch (err) {
    console.error('Project C call threw:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ── helpers ───────────────────────────────────────────────────

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifyStripeSignature(rawBody, sigHeader, secret) {
  // Stripe-Signature: t=1234567890,v1=abcdef…[,v0=…]
  const parts = sigHeader.split(',').reduce((m, kv) => {
    const [k, v] = kv.split('=');
    if (k && v) {
      if (k === 'v1') (m.v1 = m.v1 || []).push(v);
      else            m[k] = v;
    }
    return m;
  }, {});
  if (!parts.t || !parts.v1 || !parts.v1.length) return false;

  // Reject signatures older than 5 minutes (replay protection).
  const tsSec = parseInt(parts.t, 10);
  if (!tsSec || Math.abs(Date.now() / 1000 - tsSec) > 300) return false;

  const signedPayload = parts.t + '.' + rawBody.toString('utf8');
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

  // Timing-safe compare against each v1 signature (Stripe may rotate).
  const expectedBuf = Buffer.from(expected, 'hex');
  for (const sig of parts.v1) {
    let actualBuf;
    try { actualBuf = Buffer.from(sig, 'hex'); } catch { continue; }
    if (actualBuf.length !== expectedBuf.length) continue;
    if (crypto.timingSafeEqual(actualBuf, expectedBuf)) return true;
  }
  return false;
}
