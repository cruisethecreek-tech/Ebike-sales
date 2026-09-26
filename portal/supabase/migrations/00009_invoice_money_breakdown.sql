-- The portal stored one number for an invoice: total_amount.
--
-- That is why Earl Boylen's CTR-071 could read $1,976.47 in the portal while
-- the invoice itself totalled $74.03. A $1,799 discount had been applied, the
-- portal had nowhere to put it, and nothing could tell a stale total from a
-- discounted one — 1869 + 5.75% tax is exactly 1976.47, so the wrong figure
-- was perfectly self-consistent. It was found by a human noticing.
--
-- Keeping the parts means the total can be checked against them instead of
-- taken on trust, and the customer can see what they were actually given.

alter table public.invoices
  add column if not exists subtotal          numeric(10,2),
  add column if not exists discount_amount   numeric(10,2),
  add column if not exists discount_percent  numeric(5,2),
  add column if not exists tax_amount        numeric(10,2),
  add column if not exists amount_paid       numeric(10,2),
  add column if not exists balance_due       numeric(10,2);

-- How the money actually arrived. Stripe is only one of several routes and,
-- for a lease-to-own sale, not the route at all: Snap pays the shop and the
-- customer pays Snap, so nothing reaches Stripe. Recording "paid" without
-- recording how left no way to tell those apart afterwards.
alter table public.invoices
  add column if not exists payment_method    text,
  add column if not exists payment_reference text;

comment on column public.invoices.subtotal is
  'Line items before any discount. Null on invoices synced before this existed.';
comment on column public.invoices.discount_amount is
  'Cash value of the discount, however it was entered (percent or fixed).';
comment on column public.invoices.tax_amount is
  'Ohio sales tax charged, 5.75% of the subtotal after discount. Zero when tax-exempt.';
comment on column public.invoices.amount_paid is
  'Received so far. Equals total_amount on a sale paid in full, including a Snap-financed one.';
comment on column public.invoices.payment_method is
  'cash, check, credit_card, zelle, venmo, cashapp, snap, stripe, other. Free text rather than an enum so a new method does not need a migration before it can be recorded.';
comment on column public.invoices.payment_reference is
  'Whatever identifies the payment on the other side: check number, last four, or a Snap lease/application ID.';
