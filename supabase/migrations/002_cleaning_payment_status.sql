-- Add payment_status to cleaning_tasks
ALTER TABLE public.cleaning_tasks
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending';
-- values: 'pending' | 'paid'

-- Add notes field to bookings for owner comments
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS owner_notes text;
