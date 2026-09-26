-- Mokwheel was missing from the bike_brand enum.
--
-- It is not a minor brand: Mokwheel is the largest range on the site, 73 of
-- the 239 colour swatches, and the only one whose photos all come from the
-- vendor's own feed. It simply could not be recorded against a customer.
--
-- What that looked like in practice, on Earl Boylen's CTR-071: the invoice
-- line reads "Mokwheel Basalt ST 2.0 Ebike", and the bike registered against
-- it says Velotric. Nobody mistyped it. The admin form's brand list did not
-- offer Mokwheel, Velotric is the first <option>, and adminAddBike falls back
-- to `(formData.get('brand') || 'Velotric')` — so the wrong brand was not
-- chosen, it was the only thing that could happen.
--
-- The same gap explains a quieter one: `other` has never been used on any of
-- the 34 registered bikes, because the sync route returned the label
-- 'Custom / Other' for it, which is not a value of this type either. Every
-- non-listed brand failed to insert rather than landing in `other`.
-- detectBike is corrected alongside this migration to emit only values that
-- exist here.

alter type public.bike_brand add value if not exists 'Mokwheel' before 'other';

comment on type public.bike_brand is
  'Brands Cruise the Creek sells. A bike from any other maker — a trade-in, or
   a repair on something bought elsewhere — is "other", with the real brand
   kept in bikes.model so nothing is lost.';
