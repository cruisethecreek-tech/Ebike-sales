-- ============================================================================
-- Cruise the Creek Adventures — Customer Portal
-- Migration 00004: add receipt_number to bikes table
--
-- Connects a customer's registered e-bike to their official invoice/receipt
-- number (e.g. CTR-058) for easy cross-referencing and warranty tracking.
-- ============================================================================

alter table public.bikes
  add column if not exists receipt_number text;

comment on column public.bikes.receipt_number is
  'Invoice or receipt number (e.g. CTR-058) associated with the bike purchase.';

create index if not exists bikes_receipt_number_idx
  on public.bikes (receipt_number);
