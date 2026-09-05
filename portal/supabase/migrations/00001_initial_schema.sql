-- ============================================================================
-- Cruise the Creek Adventures — Customer Portal
-- Migration 00001: initial schema
--
-- Tables: customers, bikes, invoices, service_tickets
--
-- Access model
--   Every table is owner-scoped: a signed-in customer reads and writes only
--   their own rows, enforced by RLS against auth.uid(). There is no "staff"
--   role here — back-office access is expected to come from the service-role
--   key, which bypasses RLS entirely. Add an explicit staff role before
--   exposing any admin surface to a normal (anon-key) session.
-- ============================================================================

create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- ─────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────

create type public.contact_method as enum ('text', 'email', 'phone');

-- Mirrors the brands carried on the storefront. Adding a brand later is
-- `alter type public.bike_brand add value 'NewBrand';` — note that Postgres
-- will not let you drop or reorder enum values, so 'other' is the escape
-- hatch for a trade-in or a brand we don't stock.
create type public.bike_brand as enum (
  'Heybike',
  'Velotric',
  'Jasion',
  'Mooncool',
  'other'
);

create type public.invoice_status as enum ('paid', 'pending');

create type public.ticket_type as enum (
  'tune-up',
  'warranty',
  'general question',
  'upgrade request'
);

create type public.ticket_status as enum ('open', 'in progress', 'resolved');

-- ─────────────────────────────────────────────────────────────
-- updated_at trigger
-- ─────────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- customers
--
-- One row per authenticated user. The PK *is* the auth user id, so every
-- ownership check downstream is a join away from auth.uid() and the row
-- disappears with the auth user.
-- ─────────────────────────────────────────────────────────────

create table public.customers (
  id                 uuid primary key references auth.users (id) on delete cascade,
  first_name         text not null check (length(trim(first_name)) > 0),
  last_name          text not null check (length(trim(last_name)) > 0),
  phone              text,
  preferred_contact  public.contact_method not null default 'text',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.customers is
  'Portal profile for an authenticated user. id = auth.users.id.';

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- bikes
--
-- The unique (id, customer_id) pair looks redundant next to the PK, but it
-- is what lets service_tickets carry a composite FK and get "the bike on a
-- ticket must belong to the ticket's customer" enforced by the database
-- instead of by application code.
-- ─────────────────────────────────────────────────────────────

create table public.bikes (
  id                 uuid primary key default gen_random_uuid(),
  customer_id        uuid not null references public.customers (id) on delete cascade,
  brand              public.bike_brand not null,
  model              text not null check (length(trim(model)) > 0),
  serial_number      text unique,
  purchase_date      date,
  warranty_expires_at date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint bikes_id_customer_key unique (id, customer_id),
  constraint bikes_warranty_after_purchase
    check (
      purchase_date is null
      or warranty_expires_at is null
      or warranty_expires_at >= purchase_date
    )
);

comment on column public.bikes.serial_number is
  'Globally unique when present — a serial identifies exactly one physical bike.';

create index bikes_customer_id_idx on public.bikes (customer_id);

create trigger bikes_set_updated_at
  before update on public.bikes
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- invoices
-- ─────────────────────────────────────────────────────────────

create table public.invoices (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references public.customers (id) on delete cascade,
  invoice_number text unique,
  total_amount   numeric(10, 2) not null check (total_amount >= 0),
  pdf_url        text,
  status         public.invoice_status not null default 'pending',
  issued_at      timestamptz not null default now(),
  paid_at        timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Keeps status and paid_at from drifting apart.
  constraint invoices_paid_at_matches_status
    check (
      (status = 'paid'    and paid_at is not null)
      or
      (status = 'pending' and paid_at is null)
    )
);

create index invoices_customer_id_idx on public.invoices (customer_id);
create index invoices_customer_status_idx on public.invoices (customer_id, status);

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- service_tickets
--
-- bike_id is optional (a general question isn't about a specific bike). The
-- composite FK uses the default MATCH SIMPLE, so a NULL bike_id skips the
-- check while a non-NULL one must match a bike owned by the same customer.
-- on delete set null: deleting a bike must not erase its service history.
-- ─────────────────────────────────────────────────────────────

create table public.service_tickets (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  bike_id     uuid references public.bikes (id) on delete set null,
  ticket_type public.ticket_type not null,
  status      public.ticket_status not null default 'open',
  description text not null check (length(trim(description)) > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  resolved_at timestamptz,

  constraint service_tickets_bike_belongs_to_customer
    foreign key (bike_id, customer_id)
    references public.bikes (id, customer_id)
    on delete set null,

  constraint service_tickets_resolved_at_matches_status
    check (
      (status = 'resolved' and resolved_at is not null)
      or
      (status <> 'resolved' and resolved_at is null)
    )
);

create index service_tickets_customer_id_idx on public.service_tickets (customer_id);
create index service_tickets_bike_id_idx on public.service_tickets (bike_id);
create index service_tickets_open_idx
  on public.service_tickets (customer_id, status)
  where status <> 'resolved';

create trigger service_tickets_set_updated_at
  before update on public.service_tickets
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Row Level Security
--
-- RLS is worthless until it is enabled, and a table with RLS on and no
-- matching policy denies everything. Both halves are below, per table.
-- ============================================================================

alter table public.customers       enable row level security;
alter table public.bikes           enable row level security;
alter table public.invoices        enable row level security;
alter table public.service_tickets enable row level security;

-- ── customers ───────────────────────────────────────────────
-- A user reads and edits exactly one row: their own. No delete policy —
-- account deletion goes through auth.users and cascades.

create policy "customers: read own profile"
  on public.customers for select
  to authenticated
  using (auth.uid() = id);

create policy "customers: create own profile"
  on public.customers for insert
  to authenticated
  with check (auth.uid() = id);

create policy "customers: update own profile"
  on public.customers for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ── bikes ───────────────────────────────────────────────────
-- Customers register and maintain their own bikes. The with check on update
-- is what stops a row being reassigned to another customer_id.

create policy "bikes: read own bikes"
  on public.bikes for select
  to authenticated
  using (auth.uid() = customer_id);

create policy "bikes: register own bikes"
  on public.bikes for insert
  to authenticated
  with check (auth.uid() = customer_id);

create policy "bikes: update own bikes"
  on public.bikes for update
  to authenticated
  using (auth.uid() = customer_id)
  with check (auth.uid() = customer_id);

create policy "bikes: delete own bikes"
  on public.bikes for delete
  to authenticated
  using (auth.uid() = customer_id);

-- ── invoices ────────────────────────────────────────────────
-- Read-only to the customer, deliberately. Billing rows are written by the
-- back office through the service-role key; a customer who could insert or
-- update an invoice could mark their own balance paid.

create policy "invoices: read own invoices"
  on public.invoices for select
  to authenticated
  using (auth.uid() = customer_id);

-- ── service_tickets ─────────────────────────────────────────
-- Customers open tickets and may keep editing while a ticket is still open.
-- Once staff move it to 'in progress' or 'resolved' the row freezes for the
-- customer: the using clause gates which rows are updatable, the with check
-- clause gates what they may become — so a customer cannot resolve their own
-- ticket or hand it to somebody else.

create policy "service_tickets: read own tickets"
  on public.service_tickets for select
  to authenticated
  using (auth.uid() = customer_id);

create policy "service_tickets: open own tickets"
  on public.service_tickets for insert
  to authenticated
  with check (auth.uid() = customer_id and status = 'open');

create policy "service_tickets: edit own open tickets"
  on public.service_tickets for update
  to authenticated
  using (auth.uid() = customer_id and status = 'open')
  with check (auth.uid() = customer_id and status = 'open');
