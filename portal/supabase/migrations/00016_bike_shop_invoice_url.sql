-- The shop invoice (Shop.com order / warranty tracking link) for a bike.
--
-- Invoices already carry this as supplier_url, and a bike whose receipt number
-- matches an invoice shows that invoice's link. Bikes bought before the
-- invoice generator, or entered by hand, have no invoice to borrow it from,
-- so staff can paste the link on the bike itself.
alter table public.bikes
  add column if not exists shop_invoice_url text;

alter table public.bikes drop constraint if exists bikes_shop_invoice_url_http;
alter table public.bikes add constraint bikes_shop_invoice_url_http
  check (shop_invoice_url is null or (shop_invoice_url ~ '^https?://' and length(shop_invoice_url) <= 1000));

comment on column public.bikes.shop_invoice_url is
  'Shop.com order / warranty link for this bike, when it is not on a matching invoice.';
