-- Emails the shop sends a customer, with when each was opened or clicked.
--
-- One row per email. The sender picks a random token, puts it in the email
-- (a 1x1 image from /api/email/open and links through /api/email/click),
-- sends it, then writes the row:
--   portal invites and sign-in links  -> written by the portal
--   invoice receipts, referral emails, repair waivers, apparel orders,
--   Bridge the Gap agreements          -> written by the Apps Script through
--                                         POST /api/email/log (admin key)
--
-- "Opened" means the email's image loaded. Apple Mail loads images on its
-- own, so it can read opened when the customer never looked; someone who
-- blocks images reads not opened. Clicks are the stronger signal.
--
-- Staff only: customers have no policy here. Writes use the service role.

create table public.email_log (
  token            text primary key check (token ~ '^[a-f0-9]{32}$'),
  email            text not null,
  kind             text not null,
  subject          text,
  ref              text,
  status           text not null default 'sent' check (status in ('sent', 'failed')),
  error            text,
  sent_at          timestamptz not null default now(),
  first_opened_at  timestamptz,
  last_opened_at   timestamptz,
  open_count       integer not null default 0,
  first_clicked_at timestamptz,
  last_clicked_at  timestamptz,
  click_count      integer not null default 0
);

comment on table public.email_log is
  'Customer emails sent by the portal and the Apps Script, with open and click times.';
comment on column public.email_log.email is 'Recipient, stored lower case.';
comment on column public.email_log.ref is 'What the email was about, e.g. the invoice number.';

create index email_log_email_sent_at on public.email_log (email, sent_at desc);

alter table public.email_log enable row level security;

create policy "email_log: admin read"
  on public.email_log for select
  to authenticated
  using (public.is_admin());

-- One open or click. Called by /api/email/open and /api/email/click with the
-- service role. A click also counts as opened: they could not click without
-- opening it, even with images blocked.
create function public.email_log_hit(p_token text, p_what text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.email_log
     set open_count       = open_count + case when p_what = 'open' then 1 else 0 end,
         first_opened_at  = coalesce(first_opened_at, now()),
         last_opened_at   = case when p_what = 'open' then now() else coalesce(last_opened_at, now()) end,
         click_count      = click_count + case when p_what = 'click' then 1 else 0 end,
         first_clicked_at = case when p_what = 'click' then coalesce(first_clicked_at, now()) else first_clicked_at end,
         last_clicked_at  = case when p_what = 'click' then now() else last_clicked_at end
   where token = p_token
     and p_what in ('open', 'click');
$$;

revoke execute on function public.email_log_hit(text, text) from public, anon, authenticated;
grant execute on function public.email_log_hit(text, text) to service_role;
