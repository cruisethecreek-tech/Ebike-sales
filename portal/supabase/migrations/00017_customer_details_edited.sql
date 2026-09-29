-- When staff last corrected a customer's name or phone in the admin portal.
--
-- Every save of an invoice in the invoice generator writes the invoice's
-- customer name and phone onto the customer record. That was the only way to
-- change them, and it meant re-saving an old invoice put an old spelling or
-- an old number back. Once staff have edited a customer in the portal, the
-- portal is the record: invoice saves only fill in what is blank.
alter table public.customers
  add column if not exists details_edited_at timestamptz;

comment on column public.customers.details_edited_at is
  'Set when an admin edits name/phone in the portal; invoice syncs then only fill blanks.';
