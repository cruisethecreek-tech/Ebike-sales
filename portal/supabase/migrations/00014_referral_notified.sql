-- When the person who referred a customer was told about it.
--
-- A referrer gets one email per friend, the first time that friend has a paid
-- invoice. The portal claims this column (null -> now()) before sending, so
-- the Sheet re-syncing the same invoice, or staff marking a second invoice
-- paid, never sends a second email about the same friend.

alter table public.customers
  add column if not exists referral_notified_at timestamptz;

comment on column public.customers.referral_notified_at is
  'When the customer who referred this one was emailed that this customer made a paid purchase. Null = not yet.';

-- Referrals that already had a paid purchase before these emails existed are
-- marked as told, so turning this on does not email people about purchases
-- made weeks ago.
update public.customers c
   set referral_notified_at = now()
 where c.referred_by is not null
   and c.referral_notified_at is null
   and exists (
     select 1 from public.invoices i
      where i.customer_id = c.id and i.status = 'paid'
   );
