-- Two steps to removing a customer, because they are not the same decision.
--
-- Archiving hides someone from the directory and nothing else. It is for the
-- duplicate account, the test record, the person who asked to be taken off the
-- list: the sale still happened, the invoice is still in the Sheet, and the
-- shop may need to look it up in a year.
--
-- Deleting is for a record that should never have existed. It takes the login,
-- the customer row, their bikes and their portal invoices with it and cannot be
-- undone. Making it reachable only from the archive means nobody gets there by
-- misclicking a row in a list of sixty-one people.

alter table public.customers
  add column if not exists archived_at timestamptz;

comment on column public.customers.archived_at is
  'Set when a customer is hidden from the directory. Their data is untouched; only permanent deletion removes anything.';

-- The directory reads "everyone not archived" on every load.
create index if not exists customers_archived_at_idx
  on public.customers (archived_at)
  where archived_at is null;
