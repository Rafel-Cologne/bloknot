-- Allow owners to delete bookings for their own apartments
CREATE POLICY "bookings: owner delete" ON public.bookings
  FOR DELETE USING (public.is_owner_of_apartment(apartment_id));
