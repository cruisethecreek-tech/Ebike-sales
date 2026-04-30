// api/create-payment-link.js
// Vercel Serverless Function
// Creates Stripe Payment Links securely using environment variables

const ALLOWED_ORIGINS = [
  'https://ebike-sales.pages.dev',
  'https://www.cruisethecreek.com',
  'https://cruisethecreek.com'
];

export default async function handler(req, res) {
  // ── 1. CORS HEADERS — must be set BEFORE any return ────────
  const origin = req.headers.origin || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, X-Requested-With');
  res.setHeader('Vary', 'Origin');

  // ── 2. OPTIONS preflight — must respond 204 with headers ───
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // ── 3. Reject non-POST methods (after CORS headers set) ────
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── 4. Handle the POST ─────────────────────────────────────
  try {
    const { customerName, customerEmail, invoiceNumber, total, items } = req.body;

    // Validate required fields
    if (!customerEmail || !total || total <= 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      console.error('STRIPE_SECRET_KEY not configured');
      return res.status(500).json({ error: 'Stripe not configured' });
    }

    // Create Stripe Payment Link
    const response = await fetch('https://api.stripe.com/v1/payment_links', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][product_data][name]': `${invoiceNumber} - ${customerName}`,
        'line_items[0][price_data][unit_amount]': Math.round(total * 100),
        'line_items[0][quantity]': '1',
        'billing_address_collection': 'auto',
      }),
    });

    const data = await response.json();

    if (response.ok && data.url) {
      return res.status(200).json({
        success: true,
        paymentLink: data.url,
        invoiceNumber,
        customerName,
        total,
      });
    } else {
      console.error('Stripe error:', data);
      return res.status(400).json({
        error: data.error?.message || 'Failed to create payment link',
      });
    }
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: error.message });
  }
}
