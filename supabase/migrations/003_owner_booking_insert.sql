-- Allow owners to manually enter bookings for their own apartments
CREATE POLICY "bookings: owner insert" ON public.bookings
  FOR INSERT WITH CHECK (public.is_owner_of_apartment(apartment_id));

-- Allow owners to update owner_notes on their bookings
-- (owner_update policy already covers UPDATE, this ensures owner_notes is writable)

-- Add 'private' as alias via a view-friendly source value:
-- We reuse 'other' for private bookings (guest pays cash)
-- No enum change needed.
