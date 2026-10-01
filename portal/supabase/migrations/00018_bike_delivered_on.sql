-- The day the customer actually got the bike.
--
-- Shipped bikes can take about 10 days to arrive, so the free 30-day
-- Creek Ready break-in tune-up counts from delivery when staff record it.
-- Without it the portal allows 40 days from purchase_date.
alter table public.bikes
  add column if not exists delivered_on date;

comment on column public.bikes.delivered_on is
  'Day the customer received the bike. Starts the 30-day break-in tune-up window; null means use purchase_date + 40 days.';
