-- A processing fee the customer absorbs.
--
-- Snap states it outside the cash price: subtotal + tax = Cash Price, with the
-- processing fee listed separately beneath. On Earl Boylen's CTR-071 that is
-- $1,869.00 + $107.47 = $1,976.47, then $39.00.
--
-- So it is added after tax and is not itself taxed. That mirrors the financing
-- record rather than asserting how Ohio treats it; if an accountant says
-- otherwise, the place to change it is calculateTotals() in invoice.html.
--
-- Its own column rather than a line item, because a line item would be taxed
-- and would land in the itemised list as if it were something the shop sold.

alter table public.invoices
  add column if not exists processing_fee numeric(10,2);

comment on column public.invoices.processing_fee is
  'Financing or card processing fee the customer pays, added after tax and not taxed. Null on invoices that predate this column; 0 where none was charged.';
