// api/create-stripe-invoice.js
// Vercel Serverless Function — creates a real Stripe Invoice (not a Payment Link).
//
// Why Invoices over Payment Links:
//   - Same invoice can be paid online (hosted_invoice_url) OR settled in-person
//     via Stripe Terminal. Pat opens Dashboard → Invoices → "Collect payment"
//     and swipes on the Reader; the invoice flips to paid automatically.
//   - Customer gets a real PDF invoice, not a bare checkout link.
//   - Apple Pay / Google Pay / ACH all surface on the hosted invoice page once
//     enabled in Stripe Dashboard → Settings → Payment methods.
//
// Webhook pairing:
//   - When this invoice is paid (either path), Stripe fires invoice.paid →
//     api/stripe-webhook.js → Apps Script Project C → Sheet row flips to paid.
//   - The metadata.ourInvoiceNumber set here is the key the webhook uses to
//     find the right Sheet row.

const ALLOWED_ORIGINS = [
  'https://ebike-sales.pages.dev',
  'https://www.cruisethecreek.com',
  'https://cruisethecreek.com'
];

const STRIPE_API = 'https://api.stripe.com/v1';

export default async function handler(req, res) {
  // ── 1. CORS HEADERS ────────────────────────────────────────
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
    const {
      customerName,
      customerEmail,
      customerPhone,
      invoiceNumber,
      total,
      items,
      productName,
      description,
      daysUntilDue,
      source,
    } = req.body || {};

    if (!customerEmail || !total || total <= 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      console.error('STRIPE_SECRET_KEY not configured');
      return res.status(500).json({ error: 'Stripe not configured' });
    }

    // ── 2. Customer: create fresh each time ─────────────────
    // Stripe's Customer.search API requires search indexing that lags by
    // ~minutes; trying to dedupe by email here means racing the index.
    // Stripe Dashboard groups customers by email visually, so duplicates
    // are not a real problem for Pat's audit workflow.
    const customer = await stripeFetch(stripeSecretKey, '/customers', {
      email: customerEmail,
      name:  customerName || '',
      phone: customerPhone || '',
      'metadata[ourInvoiceNumber]': invoiceNumber || '',
      'metadata[source]':            source || 'invoice.html',
    });
    if (customer.error) {
      console.error('Stripe customer error:', customer);
      return res.status(400).json({ error: customer.error.message || 'Customer create failed' });
    }

    // ── 3. Invoice items ────────────────────────────────────
    // If a structured items[] array was passed (invoice.html), itemize.
    // Otherwise collapse to a single line (apparel.html, or any caller
    // that only knows the bundled total).
    const lines = Array.isArray(items) && items.length
      ? items
          .filter(it => it && it.description && Number(it.price) > 0)
          .map(it => ({
            description: String(it.description),
            qty:         Math.max(1, parseInt(it.qty, 10) || 1),
            unitAmount:  Math.round(Number(it.price) * 100),
          }))
      : [];

    // If the structured items don't sum to `total` (taxes, discounts, deposits),
    // fall back to one invoice item for the full `total` so we collect the
    // correct amount. invoice.html applies tax/discount client-side and passes
    // the final chargeAmount as `total`; that's the number we must hit.
    const lineSum = lines.reduce((s, l) => s + (l.unitAmount * l.qty), 0);
    const targetCents = Math.round(Number(total) * 100);
    const useFallback = lines.length === 0 || lineSum !== targetCents;

    if (useFallback) {
      const fallbackName = (productName && String(productName).trim())
        || `${invoiceNumber || 'Invoice'} - ${customerName || customerEmail}`;
      const createRes = await stripeFetch(stripeSecretKey, '/invoiceitems', {
        customer:    customer.id,
        amount:      targetCents,
        currency:    'usd',
        description: fallbackName + (description ? ` — ${description}` : ''),
      });
      if (createRes.error) {
        console.error('Stripe invoiceitem error:', createRes);
        return res.status(400).json({ error: createRes.error.message || 'Invoice item failed' });
      }
    } else {
      for (const line of lines) {
        const createRes = await stripeFetch(stripeSecretKey, '/invoiceitems', {
          customer:    customer.id,
          unit_amount: line.unitAmount,
          quantity:    line.qty,
          currency:    'usd',
          description: line.description,
        });
        if (createRes.error) {
          console.error('Stripe invoiceitem error:', createRes);
          return res.status(400).json({ error: createRes.error.message || 'Invoice item failed' });
        }
      }
    }

    // ── 4. Create invoice (pulls pending items above) ───────
    const dueDays = Math.max(1, Math.min(60, parseInt(daysUntilDue, 10) || 14));
    const invoice = await stripeFetch(stripeSecretKey, '/invoices', {
      customer:                          customer.id,
      collection_method:                 'send_invoice',
      days_until_due:                    String(dueDays),
      auto_advance:                      'false',     // we finalize explicitly below
      pending_invoice_items_behavior:    'include',
      'metadata[ourInvoiceNumber]':      invoiceNumber || '',
      'metadata[source]':                source || 'invoice.html',
      'metadata[customerName]':          customerName || '',
      description: description
        ? String(description)
        : `Cruise the Creek — ${invoiceNumber || ''}`.trim(),
    });
    if (invoice.error) {
      console.error('Stripe invoice create error:', invoice);
      return res.status(400).json({ error: invoice.error.message || 'Invoice create failed' });
    }

    // ── 5. Finalize so we get hosted_invoice_url + PDF ──────
    // We DO NOT call /send — invoice.html and apparel.html send their own
    // customer email via Apps Script. Double-emailing would be worse UX.
    const finalized = await stripeFetch(stripeSecretKey, `/invoices/${invoice.id}/finalize`, {
      auto_advance: 'false',
    });
    if (finalized.error) {
      console.error('Stripe invoice finalize error:', finalized);
      return res.status(400).json({ error: finalized.error.message || 'Invoice finalize failed' });
    }

    return res.status(200).json({
      success:             true,
      hostedInvoiceUrl:    finalized.hosted_invoice_url,
      invoicePdfUrl:       finalized.invoice_pdf,
      stripeInvoiceId:     finalized.id,
      stripeInvoiceNumber: finalized.number,
      customerId:          customer.id,
      // Back-compat alias so existing callers that look for `paymentLink`
      // continue to work during the migration window.
      paymentLink:         finalized.hosted_invoice_url,
      invoiceNumber,
      customerName,
      total,
    });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// ── helpers ───────────────────────────────────────────────────
async function stripeFetch(secretKey, path, params) {
  const body = new URLSearchParams();
  for (const k in params) {
    if (params[k] !== undefined && params[k] !== null) body.append(k, String(params[k]));
  }
  const r = await fetch(STRIPE_API + path, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body,
  });
  return r.json();
}
