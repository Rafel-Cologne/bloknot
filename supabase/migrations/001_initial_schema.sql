-- ============================================================
-- StayFlow — Initial Schema
-- ============================================================

-- Enums
CREATE TYPE public.app_role AS ENUM ('guest', 'owner', 'cleaner', 'admin');
CREATE TYPE public.booking_status AS ENUM ('pending', 'accepted', 'declined', 'cancelled');
CREATE TYPE public.booking_source AS ENUM ('platform', 'airbnb', 'booking', 'other');
CREATE TYPE public.cleaning_payment_method AS ENUM ('guest_cash', 'owner_transfer', 'paypal');

-- ============================================================
-- Helper: update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- profiles
-- ============================================================
CREATE TABLE public.profiles (
  id          uuid PRIMARY KEY,
  name        text NOT NULL DEFAULT '',
  email       text,
  phone       text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- user_roles
-- ============================================================
CREATE TABLE public.user_roles (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  uuid NOT NULL,
  role     public.app_role NOT NULL DEFAULT 'guest',
  UNIQUE (user_id, role)
);

-- ============================================================
-- Security-definer: has_role (used in RLS to avoid recursion)
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- ============================================================
-- apartments
-- ============================================================
CREATE TABLE public.apartments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid NOT NULL,
  title           text NOT NULL,
  description     text NOT NULL DEFAULT '',
  address         text NOT NULL DEFAULT '',
  amenities       text[] NOT NULL DEFAULT '{}',
  rules           text[] NOT NULL DEFAULT '{}',
  price_per_night numeric NOT NULL DEFAULT 0,
  cleaning_fee    numeric NOT NULL DEFAULT 60,
  max_guests      int NOT NULL DEFAULT 2,
  is_public       boolean NOT NULL DEFAULT true,
  cleaner_id      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_apartments_updated_at
  BEFORE UPDATE ON public.apartments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- apartment_images
-- ============================================================
CREATE TABLE public.apartment_images (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apartment_id  uuid NOT NULL REFERENCES public.apartments(id) ON DELETE CASCADE,
  image_url     text NOT NULL,
  order_index   smallint NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- bookings
-- ============================================================
CREATE TABLE public.bookings (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apartment_id                uuid NOT NULL REFERENCES public.apartments(id) ON DELETE CASCADE,
  guest_id                    uuid,
  guest_name                  text NOT NULL DEFAULT '',
  guest_phone                 text NOT NULL DEFAULT '',
  guest_message               text,
  start_date                  date NOT NULL,
  end_date                    date NOT NULL,
  guests_count                int NOT NULL DEFAULT 1,
  status                      public.booking_status NOT NULL DEFAULT 'pending',
  source                      public.booking_source NOT NULL DEFAULT 'platform',
  total_amount                numeric,
  offer_price                 numeric,
  share_contact_with_cleaner  boolean NOT NULL DEFAULT false,
  guest_rating                smallint,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- blocked_dates
-- ============================================================
CREATE TABLE public.blocked_dates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apartment_id  uuid NOT NULL REFERENCES public.apartments(id) ON DELETE CASCADE,
  date          date NOT NULL,
  reason        text NOT NULL DEFAULT 'blocked',
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (apartment_id, date)
);

-- ============================================================
-- custom_pricing
-- ============================================================
CREATE TABLE public.custom_pricing (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apartment_id  uuid NOT NULL REFERENCES public.apartments(id) ON DELETE CASCADE,
  date          date NOT NULL,
  price         numeric NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (apartment_id, date)
);

-- ============================================================
-- cleaning_tasks
-- ============================================================
CREATE TABLE public.cleaning_tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  cleaner_id      uuid,
  cleaning_fee    numeric NOT NULL DEFAULT 60,
  status          text NOT NULL DEFAULT 'pending',
  payment_method  public.cleaning_payment_method,
  notes           text,
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- cleaning_payments
-- ============================================================
CREATE TABLE public.cleaning_payments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cleaning_task_id  uuid NOT NULL REFERENCES public.cleaning_tasks(id) ON DELETE CASCADE,
  amount            numeric,
  comment           text,
  paid_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- booking_notes
-- ============================================================
CREATE TABLE public.booking_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  owner_id    uuid NOT NULL,
  note        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- messages
-- ============================================================
CREATE TABLE public.messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  sender_id   uuid NOT NULL,
  content     text NOT NULL,
  read        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- ============================================================
-- notifications
-- ============================================================
CREATE TABLE public.notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  title       text NOT NULL,
  message     text NOT NULL,
  link        text,
  read        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Trigger: handle_new_user (auto-create profile + assign role)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role       public.app_role;
  _meta_role  text;
BEGIN
  IF NEW.email = 'rafaelbabaew@googlemail.com' THEN
    _role := 'admin';
  ELSE
    _meta_role := COALESCE(NEW.raw_user_meta_data->>'role', 'guest');
    IF _meta_role = 'owner' THEN
      _role := 'owner';
    ELSE
      _role := 'guest';
    END IF;
  END IF;

  INSERT INTO public.profiles (id, name, email, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    NEW.email,
    NEW.raw_user_meta_data->>'phone'
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- Helper security-definer functions for RLS
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_owner_of_apartment(_apartment_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.apartments
    WHERE id = _apartment_id AND owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_owner_of_booking(_booking_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
    JOIN public.apartments a ON a.id = b.apartment_id
    WHERE b.id = _booking_id AND a.owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_guest_of_booking(_booking_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings
    WHERE id = _booking_id AND guest_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_cleaner_of_task(_task_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cleaning_tasks
    WHERE id = _task_id AND cleaner_id = auth.uid()
  );
$$;

-- ============================================================
-- RLS Policies
-- ============================================================

-- profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles: own row" ON public.profiles
  FOR ALL USING (id = auth.uid());

CREATE POLICY "profiles: admin sees all" ON public.profiles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "profiles: owner sees active cleaners" ON public.profiles
  FOR SELECT USING (
    is_active = true
    AND public.has_role(id, 'cleaner')
    AND public.has_role(auth.uid(), 'owner')
  );

-- user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_roles: own roles" ON public.user_roles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user_roles: admin full" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- apartments
ALTER TABLE public.apartments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "apartments: public visible" ON public.apartments
  FOR SELECT USING (is_public = true);

CREATE POLICY "apartments: owner crud" ON public.apartments
  FOR ALL USING (owner_id = auth.uid());

CREATE POLICY "apartments: admin full" ON public.apartments
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- apartment_images
ALTER TABLE public.apartment_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "apt_images: public select" ON public.apartment_images
  FOR SELECT USING (true);

CREATE POLICY "apt_images: owner manage" ON public.apartment_images
  FOR ALL USING (public.is_owner_of_apartment(apartment_id));

-- bookings
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bookings: guest sees own" ON public.bookings
  FOR SELECT USING (guest_id = auth.uid());

CREATE POLICY "bookings: owner sees apt bookings" ON public.bookings
  FOR SELECT USING (public.is_owner_of_apartment(apartment_id));

CREATE POLICY "bookings: guest insert" ON public.bookings
  FOR INSERT WITH CHECK (guest_id = auth.uid());

CREATE POLICY "bookings: guest update own" ON public.bookings
  FOR UPDATE USING (guest_id = auth.uid());

CREATE POLICY "bookings: owner update" ON public.bookings
  FOR UPDATE USING (public.is_owner_of_apartment(apartment_id));

CREATE POLICY "bookings: admin full" ON public.bookings
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- blocked_dates
ALTER TABLE public.blocked_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blocked_dates: public select" ON public.blocked_dates
  FOR SELECT USING (true);

CREATE POLICY "blocked_dates: owner manage" ON public.blocked_dates
  FOR ALL USING (public.is_owner_of_apartment(apartment_id));

CREATE POLICY "blocked_dates: admin full" ON public.blocked_dates
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- custom_pricing
ALTER TABLE public.custom_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pricing: public select" ON public.custom_pricing
  FOR SELECT USING (true);

CREATE POLICY "pricing: owner manage" ON public.custom_pricing
  FOR ALL USING (public.is_owner_of_apartment(apartment_id));

-- cleaning_tasks
ALTER TABLE public.cleaning_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks: cleaner sees assigned" ON public.cleaning_tasks
  FOR SELECT USING (cleaner_id = auth.uid());

CREATE POLICY "tasks: cleaner update" ON public.cleaning_tasks
  FOR UPDATE USING (cleaner_id = auth.uid());

CREATE POLICY "tasks: owner manage" ON public.cleaning_tasks
  FOR ALL USING (public.is_owner_of_booking(booking_id));

-- booking_notes
ALTER TABLE public.booking_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notes: owner manage" ON public.booking_notes
  FOR ALL USING (owner_id = auth.uid());

-- messages
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages: booking parties" ON public.messages
  FOR ALL USING (
    public.is_guest_of_booking(booking_id)
    OR public.is_owner_of_booking(booking_id)
  );

-- notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications: own" ON public.notifications
  FOR ALL USING (user_id = auth.uid());

-- ============================================================
-- Storage bucket: apartment-photos
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('apartment-photos', 'apartment-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "storage: public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'apartment-photos');

CREATE POLICY "storage: owner upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'apartment-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "storage: owner delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'apartment-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
