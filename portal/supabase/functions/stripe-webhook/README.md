# stripe-webhook

Receives Stripe events for CreekGuard plans, keeps
`public.creekguard_subscriptions` (migration `00022_creekguard_subscriptions.sql`)
up to date, and pushes staff phones (ntfy, same `NTFY_TOPIC` as traccar-ingest)
when someone signs up, cancels, stops paying, or their plan ends. Cancelled
plans show under **Admin > Fleet GPS > CreekGuard Plans** with the customer's
tracker. Nothing is switched off automatically.

## Deploy

```sh
cd portal
supabase functions deploy stripe-webhook --no-verify-jwt
```

`--no-verify-jwt` because Stripe signs with its own secret, not a Supabase JWT.
Requests without a valid Stripe signature get 400 and change nothing.

## Stripe setup

1. Stripe Dashboard > Developers > Webhooks > Add endpoint.
2. URL: `https://PROJECT_REF.supabase.co/functions/v1/stripe-webhook`
3. Events: `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`.
4. Copy the endpoint's signing secret (starts `whsec_`) into Supabase:
   Dashboard > Edge Functions > Secrets, name `STRIPE_WEBHOOK_SECRET`
   (or `supabase secrets set STRIPE_WEBHOOK_SECRET=...`). Never paste it in chat.

Only subscription checkouts are recorded; CreekGuard is the shop's only
subscription product. Plans bought before the webhook existed have no email on
file, so their push names the Stripe customer id instead.

## Tests

```sh
node --test supabase/functions/stripe-webhook/stripe.test.mjs
```
