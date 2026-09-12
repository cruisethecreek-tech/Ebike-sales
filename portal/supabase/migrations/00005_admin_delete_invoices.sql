-- Admins can delete invoices.
--
-- 00003 gave admins select/update/insert on public.invoices but no delete, so
-- the admin UI had no way to remove an invoice and a delete issued with the
-- caller's own session silently affected zero rows — Postgres does not error
-- when no policy matches, it just deletes nothing.
--
-- Deliberately NOT granted to ordinary customers: their invoices stay
-- read-only, matching the select-only policy in 00001. A customer must not be
-- able to make a bill they owe disappear.
--
-- Deleting here removes the portal's copy only. The Google Sheet is the system
-- of record for invoicing; a row deleted here comes back if that invoice is
-- edited and re-saved from invoice.html.

create policy "admin: delete invoices"
  on public.invoices for delete
  to authenticated
  using (public.is_admin());
