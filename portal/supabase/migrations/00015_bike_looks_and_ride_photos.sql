-- What a customer's bike looks like, and the ride photos they share with us.
--
-- 1. Bike colour and photo
--    My Bikes showed a brand and a typed model name. Staff now pick the bike's
--    colour from the shop catalogue (data/inventory.json, the same swatches
--    and product photos as the storefront), and the customer sees that photo
--    and swatch on their bike.
--
-- 2. Ride photos, with marketing consent
--    community_photos was created for a community gallery that was never
--    built: no page reads or writes it and it is empty. It becomes the
--    customer's ride photos. Each photo records whether the customer agreed
--    to its use in marketing, the exact wording they agreed to, and when; and
--    when they withdrew it, if they did. Staff review each one before use.
--
--    The files go in a PRIVATE bucket. Nobody browses them by URL; the portal
--    hands out short-lived signed links to the owner and to staff.

-- ── 1. Bike colour ──────────────────────────────────────────────────────
alter table public.bikes
  add column if not exists color_name text,
  add column if not exists color_hex  text,
  add column if not exists image_url  text;

alter table public.bikes drop constraint if exists bikes_color_hex_format;
alter table public.bikes add constraint bikes_color_hex_format
  check (color_hex is null or color_hex ~ '^#[0-9A-Fa-f]{6}$');

alter table public.bikes drop constraint if exists bikes_image_url_https;
alter table public.bikes add constraint bikes_image_url_https
  check (image_url is null or image_url ~ '^https://');

comment on column public.bikes.color_name is 'Colour as the shop catalogue names it, e.g. "Serenity Blue".';
comment on column public.bikes.image_url  is 'Catalogue product photo for this model in this colour.';

-- ── 2. Ride photos ──────────────────────────────────────────────────────
alter table public.community_photos
  alter column image_url drop not null,
  add column if not exists storage_path         text,
  add column if not exists bike_id              uuid references public.bikes (id) on delete set null,
  add column if not exists marketing_consent    boolean not null default false,
  add column if not exists consent_text         text,
  add column if not exists consented_at         timestamptz,
  add column if not exists consent_withdrawn_at timestamptz,
  add column if not exists review_status        text not null default 'new';

alter table public.community_photos drop constraint if exists community_photos_review_status;
alter table public.community_photos add constraint community_photos_review_status
  check (review_status in ('new', 'approved', 'hidden'));

-- Consent is only ever recorded with what was agreed to and when.
alter table public.community_photos drop constraint if exists community_photos_consent_recorded;
alter table public.community_photos add constraint community_photos_consent_recorded
  check (not marketing_consent or (consent_text is not null and consented_at is not null));

comment on column public.community_photos.marketing_consent is
  'The customer agreed to marketing use (consent_text, consented_at). False again once withdrawn.';

-- A customer sees their own photos only; the gallery that "read all" was for
-- does not exist, and these are not public until staff approve them for use.
-- Writes go through the portal's server actions, which check ownership and
-- keep the file and the row together, so there are no customer write policies.
drop policy if exists "photos: read all"   on public.community_photos;
drop policy if exists "photos: upload own" on public.community_photos;
drop policy if exists "photos: delete own" on public.community_photos;
drop policy if exists "photos: read own"   on public.community_photos;
create policy "photos: read own"
  on public.community_photos for select
  to authenticated
  using (auth.uid() = customer_id);
-- "admin: read all photos" and "admin: delete any photo" (00003) stay.

-- Private bucket. 10 MB cap; the upload form shrinks photos well below it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ride-photos', 'ride-photos', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
