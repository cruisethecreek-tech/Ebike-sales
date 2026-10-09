-- Ticket conversations: the shop can answer a service ticket, the customer
-- can answer back, and each side sees what is waiting on them.
--
--   ticket_messages            one row per reply, oldest first
--   service_tickets.needs_reply      the shop owes the customer an answer
--   service_tickets.customer_unread  the shop answered and the customer has
--                                    not looked yet
--
-- Every write goes through the portal's server actions with the service
-- client after they check who is asking, so the table only needs read
-- policies here.

create table if not exists public.ticket_messages (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.service_tickets (id) on delete cascade,
  from_staff boolean not null,
  author_id  uuid references auth.users (id) on delete set null,
  body       text not null check (length(trim(body)) > 0 and length(body) <= 4000),
  created_at timestamptz not null default now()
);

create index if not exists ticket_messages_ticket_id_idx
  on public.ticket_messages (ticket_id, created_at);

alter table public.ticket_messages enable row level security;

drop policy if exists "ticket_messages: read own or admin" on public.ticket_messages;
create policy "ticket_messages: read own or admin"
  on public.ticket_messages for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.service_tickets t
      where t.id = ticket_id and t.customer_id = auth.uid()
    )
  );

-- Existing tickets have had no answer yet, so they start as needing one.
alter table public.service_tickets
  add column if not exists needs_reply boolean not null default true,
  add column if not exists customer_unread boolean not null default false;

update public.service_tickets set needs_reply = false where status = 'resolved';

create index if not exists service_tickets_needs_reply_idx
  on public.service_tickets (created_at) where needs_reply;
