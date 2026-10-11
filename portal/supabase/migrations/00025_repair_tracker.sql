-- Live repair tracker: a bike in the shop moves through stages the customer
-- can watch on their dashboard and Support page.
--
--   service_tickets.repair_stage     where the bike is now (null = not a shop repair)
--   service_tickets.repair_stage_at  when it got there
--   repair_stage_events              one row per stage change, oldest first,
--                                    with an optional note for the customer
--
-- Staff move a repair along from Admin > Tickets, or check a bike in from a
-- customer's card. Every write goes through the portal's server actions with
-- the service client after they check the caller is staff, so the new table
-- only needs a read policy. A trigger stops a customer from setting a stage
-- on their own ticket through the API.

alter type public.ticket_type add value if not exists 'repair';

alter table public.service_tickets
  add column if not exists repair_stage text
    check (repair_stage in ('checked_in', 'diagnosing', 'waiting_parts', 'repairing', 'ready', 'picked_up')),
  add column if not exists repair_stage_at timestamptz;

create index if not exists service_tickets_active_repair_idx
  on public.service_tickets (customer_id)
  where repair_stage is not null and repair_stage <> 'picked_up';

create table if not exists public.repair_stage_events (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.service_tickets (id) on delete cascade,
  stage      text not null
    check (stage in ('checked_in', 'diagnosing', 'waiting_parts', 'repairing', 'ready', 'picked_up')),
  note       text check (note is null or length(note) <= 500),
  author_id  uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists repair_stage_events_ticket_id_idx
  on public.repair_stage_events (ticket_id, created_at);

alter table public.repair_stage_events enable row level security;

drop policy if exists "repair_stage_events: read own or admin" on public.repair_stage_events;
create policy "repair_stage_events: read own or admin"
  on public.repair_stage_events for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.service_tickets t
      where t.id = ticket_id and t.customer_id = auth.uid()
    )
  );

-- Customers may still insert and edit their own open tickets, so keep the
-- repair columns out of their reach. The service client (staff actions) and
-- SQL Editor run as other roles and pass straight through.
create or replace function public.guard_repair_stage()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' and not public.is_admin() then
    if tg_op = 'INSERT' then
      if new.repair_stage is not null or new.repair_stage_at is not null then
        raise exception 'only the shop can set a repair stage';
      end if;
    elsif new.repair_stage is distinct from old.repair_stage
       or new.repair_stage_at is distinct from old.repair_stage_at then
      raise exception 'only the shop can set a repair stage';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists service_tickets_guard_repair_stage on public.service_tickets;
create trigger service_tickets_guard_repair_stage
  before insert or update on public.service_tickets
  for each row execute function public.guard_repair_stage();

-- Live updates: the customer's page refreshes when a stage row is added.
-- Realtime applies the select policies, so customers only hear about their own.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'repair_stage_events') then
      alter publication supabase_realtime add table public.repair_stage_events;
    end if;
  end if;
end;
$$;
