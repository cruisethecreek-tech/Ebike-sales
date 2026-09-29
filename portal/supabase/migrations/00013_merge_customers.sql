-- Merging two customer records into one.
--
-- The directory has people in it twice: an account created by an invoice
-- import under one email, and another the customer signed up with under a
-- different one. Anna James is the example that prompted this — one account
-- she signs in with and $84.60 of invoices, another she has never used that
-- holds her Venus and its $1,585.19 invoice. Archiving either one hides half
-- of what she owns.
--
-- A merge moves everything onto the account being kept, then archives the
-- other. It does not delete it: the login is left in place, and permanent
-- deletion stays a separate, deliberate step from the archive.
--
-- Why this is a database function and not a few updates from the server:
-- service_tickets carries a composite foreign key to bikes (id, customer_id),
-- so a bike and its tickets have to change owner in the same statement or the
-- first update is rejected. One function call is also one transaction, so a
-- merge that fails halfway leaves both customers exactly as they were.

create or replace function public.merge_customers(p_keep uuid, p_merge uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_keep    public.customers%rowtype;
  v_merge   public.customers%rowtype;
  v_bikes   int;
  v_tickets int;
  v_invoices int;
  v_rides   int;
  v_photos  int;
  v_credits int;
  v_referred int;
begin
  if p_keep is null or p_merge is null or p_keep = p_merge then
    raise exception 'Pick two different customers to merge.';
  end if;

  select * into v_keep from public.customers where id = p_keep for update;
  if not found then raise exception 'The customer being kept no longer exists.'; end if;

  select * into v_merge from public.customers where id = p_merge for update;
  if not found then raise exception 'The customer being merged in no longer exists.'; end if;

  if v_merge.is_admin then
    raise exception 'An admin account cannot be merged into another. Keep the admin account instead.';
  end if;

  -- Bikes and their tickets in one statement: the composite foreign key is
  -- checked at the end of the statement, when both sides have moved.
  with moved_bikes as (
    update public.bikes set customer_id = p_keep where customer_id = p_merge returning 1
  ), moved_tickets as (
    update public.service_tickets set customer_id = p_keep where customer_id = p_merge returning 1
  )
  select (select count(*) from moved_bikes), (select count(*) from moved_tickets)
    into v_bikes, v_tickets;

  update public.invoices set customer_id = p_keep where customer_id = p_merge;
  get diagnostics v_invoices = row_count;

  update public.ride_logs set customer_id = p_keep where customer_id = p_merge;
  get diagnostics v_rides = row_count;

  update public.community_photos set customer_id = p_keep where customer_id = p_merge;
  get diagnostics v_photos = row_count;

  update public.referral_credits set customer_id = p_keep where customer_id = p_merge;
  get diagnostics v_credits = row_count;

  -- People this customer referred now count for the kept account. The kept
  -- account cannot become its own referrer.
  update public.customers set referred_by = p_keep
   where referred_by = p_merge and id <> p_keep;
  get diagnostics v_referred = row_count;

  -- Fill the kept record's blanks from the merged one; never overwrite.
  update public.customers
     set phone = coalesce(nullif(trim(phone), ''), v_merge.phone),
         referred_by = case
           when referred_by is not null then referred_by
           when v_merge.referred_by = p_keep then null
           else v_merge.referred_by
         end,
         -- A merge is how someone comes back from the archive, if the account
         -- being kept was the archived one.
         archived_at = null
   where id = p_keep;

  update public.customers
     set archived_at = now(),
         referred_by = null
   where id = p_merge;

  return jsonb_build_object(
    'bikes', v_bikes,
    'tickets', v_tickets,
    'invoices', v_invoices,
    'rides', v_rides,
    'photos', v_photos,
    'credits', v_credits,
    'referred', v_referred
  );
end;
$$;

comment on function public.merge_customers(uuid, uuid) is
  'Moves everything owned by p_merge onto p_keep and archives p_merge. Server-only (service role).';

-- Called only from the admin server action with the service-role key, after
-- it has checked the caller is staff. Nobody signed in calls it directly.
revoke all on function public.merge_customers(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_customers(uuid, uuid) to service_role;
