-- CreekGuard plans, mirrored from Stripe so staff hear about cancellations.
--
-- CreekGuard is sold through Stripe Payment Links, which on their own tell
-- the portal nothing. The stripe-webhook Edge Function now receives Stripe's
-- events and keeps one row here per subscription:
--   checkout.session.completed      -> row created (status active), with the
--                                      buyer's email and name from checkout
--   customer.subscription.updated   -> status, and cancel_at when the customer
--                                      cancels at the end of the period
--   customer.subscription.deleted   -> status canceled, ended_at
-- Each change worth knowing about is also pushed to staff phones (ntfy).
--
-- Nothing is switched off automatically. A cancelled plan shows on Admin >
-- Fleet GPS until staff retire the tracker (and deactivate the SIM in 1NCE)
-- and press "Tracker is off", which sets tracker_off_at. That keeps a wrong
-- email match, or the shop testing a link with its own email, from retiring
-- the rental fleet.
--
-- Staff only: customers have no policy here.

create table public.creekguard_subscriptions (
  stripe_subscription_id  text primary key,
  stripe_customer_id      text,
  email                   text,
  name                    text,
  customer_id             uuid references public.customers (id) on delete set null,
  status                  text not null default 'active',
  cancel_at               timestamptz,
  ended_at                timestamptz,
  tracker_off_at          timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.creekguard_subscriptions is
  'CreekGuard Stripe subscriptions, written by the stripe-webhook Edge Function.';
comment on column public.creekguard_subscriptions.status is
  'Stripe subscription status (active, past_due, unpaid, canceled, ...); canceling = cancels at period end.';
comment on column public.creekguard_subscriptions.tracker_off_at is
  'When staff confirmed the tracker was retired after a cancellation.';

create trigger creekguard_subscriptions_set_updated_at
  before update on public.creekguard_subscriptions
  for each row execute function public.set_updated_at();

-- Stripe retries an event until it gets a 2xx, and can send one twice. The
-- function records each event id here first, so a phone is pushed once.
create table public.stripe_events (
  id           text primary key,
  type         text not null,
  received_at  timestamptz not null default now()
);

alter table public.creekguard_subscriptions enable row level security;
alter table public.stripe_events            enable row level security;

create policy "creekguard_subscriptions: admin read"
  on public.creekguard_subscriptions for select
  to authenticated
  using (public.is_admin());

create policy "creekguard_subscriptions: admin update"
  on public.creekguard_subscriptions for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
