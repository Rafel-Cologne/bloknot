-- ============================================================
-- Bloknot — Migration 005: Email Agent Schema
-- ============================================================
-- Этапы:
--   1. ALTER apartments   — cadastral_reference, construction_value, full_address
--   2. ALTER bookings     — external_booking_id, deleted_at, created_by_agent, owner_notes
--   3. CREATE expenses    — расходы с подтверждением агентом
--   4. CREATE agent_logs  — лог запусков email-агента
--   5. CREATE user_email_aliases — привязка Gmail-алиасов к пользователям
--   6. Storage bucket для вложений расходов
-- ============================================================


-- ============================================================
-- 1. ALTER apartments
-- ============================================================

ALTER TABLE public.apartments
  ADD COLUMN IF NOT EXISTS cadastral_reference text,
  ADD COLUMN IF NOT EXISTS construction_value  numeric,
  ADD COLUMN IF NOT EXISTS full_address        text;

COMMENT ON COLUMN public.apartments.cadastral_reference IS 'Referencia catastral — нужна для Modelo 100 IRPF';
COMMENT ON COLUMN public.apartments.construction_value  IS 'Стоимость строения (без земли) для расчёта амортизации 3%/год';
COMMENT ON COLUMN public.apartments.full_address        IS 'Полный адрес для сопоставления счетов агентом';


-- ============================================================
-- 2. ALTER bookings
-- ============================================================

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS external_booking_id text,
  ADD COLUMN IF NOT EXISTS deleted_at          timestamptz,
  ADD COLUMN IF NOT EXISTS created_by_agent    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS owner_notes         text;

-- Уникальный индекс для дедупликации бронирований по платформе
CREATE UNIQUE INDEX IF NOT EXISTS bookings_external_id_idx
  ON public.bookings (apartment_id, external_booking_id)
  WHERE external_booking_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN public.bookings.external_booking_id IS 'ID брони на Airbnb/Booking.com — для дедупликации';
COMMENT ON COLUMN public.bookings.deleted_at          IS 'Soft delete: NULL = активна, timestamp = удалена';
COMMENT ON COLUMN public.bookings.created_by_agent    IS 'true если бронь создана email-агентом автоматически';
COMMENT ON COLUMN public.bookings.owner_notes         IS 'Заметки владельца (только видны ему)';


-- ============================================================
-- 3. CREATE expenses
-- ============================================================

CREATE TABLE IF NOT EXISTS public.expenses (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  apartment_id          uuid        NOT NULL REFERENCES public.apartments(id) ON DELETE CASCADE,
  owner_id              uuid        NOT NULL,

  category              text        NOT NULL,

  amount                numeric     NOT NULL CHECK (amount > 0),

  invoice_period_start  date,
  invoice_period_end    date,

  expense_date          date        NOT NULL,

  provider              text,
  description           text,

  source                text        NOT NULL DEFAULT 'manual'
                                    CHECK (source IN ('manual', 'email_agent')),

  status                text        NOT NULL DEFAULT 'confirmed'
                                    CHECK (status IN ('pending_confirmation', 'confirmed', 'rejected')),

  attachment_url        text,

  deleted_at            timestamptz,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS expenses_owner_id_idx      ON public.expenses (owner_id);
CREATE INDEX IF NOT EXISTS expenses_apartment_id_idx  ON public.expenses (apartment_id);
CREATE INDEX IF NOT EXISTS expenses_expense_date_idx  ON public.expenses (expense_date DESC);
CREATE INDEX IF NOT EXISTS expenses_status_idx        ON public.expenses (status) WHERE deleted_at IS NULL;

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expenses: owner manage" ON public.expenses
  FOR ALL USING (owner_id = auth.uid());

CREATE POLICY "expenses: admin full" ON public.expenses
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

COMMENT ON TABLE public.expenses IS 'Расходы по квартирам. source=manual — ручной ввод; source=email_agent — распознано агентом и ждёт подтверждения.';


-- ============================================================
-- 4. CREATE agent_logs
-- ============================================================

CREATE TABLE IF NOT EXISTS public.agent_logs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at            timestamptz NOT NULL DEFAULT now(),
  emails_checked    int         NOT NULL DEFAULT 0,
  bookings_created  int         NOT NULL DEFAULT 0,
  bookings_updated  int         NOT NULL DEFAULT 0,
  expenses_created  int         NOT NULL DEFAULT 0,
  skipped           int         NOT NULL DEFAULT 0,
  errors            jsonb,
  status            text        NOT NULL DEFAULT 'success'
                                CHECK (status IN ('success', 'partial', 'failed'))
);

ALTER TABLE public.agent_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_logs: admin only" ON public.agent_logs
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

COMMENT ON TABLE public.agent_logs IS 'Лог каждого запуска email-агента (GitHub Actions). Доступен только администратору.';


-- ============================================================
-- 5. CREATE user_email_aliases
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_email_aliases (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  alias       text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT user_email_aliases_alias_unique UNIQUE (alias)
);

ALTER TABLE public.user_email_aliases
  ADD CONSTRAINT alias_format CHECK (alias ~ '^[a-z0-9._-]+$');

ALTER TABLE public.user_email_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aliases: own select" ON public.user_email_aliases
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "aliases: admin manage" ON public.user_email_aliases
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

COMMENT ON TABLE public.user_email_aliases IS 'Привязка Gmail-алиасов (+rafael, +maria...) к пользователям Bloknot.';
COMMENT ON COLUMN public.user_email_aliases.alias IS 'Часть алиаса после +, например "rafael" для bloknot.app+rafael@gmail.com';


-- ============================================================
-- 6. Storage: expense-attachments bucket
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'expense-attachments',
  'expense-attachments',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "storage: owner upload attachments" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'expense-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "storage: owner read attachments" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'expense-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "storage: owner delete attachments" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'expense-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "storage: admin full attachments" ON storage.objects
  FOR ALL USING (
    bucket_id = 'expense-attachments'
    AND public.has_role(auth.uid(), 'admin')
  );


-- ============================================================
-- 7. restore_booking (для админ-панели, soft-delete recovery)
-- ============================================================

CREATE OR REPLACE FUNCTION public.restore_booking(_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  UPDATE public.bookings
  SET deleted_at = NULL, updated_at = now()
  WHERE id = _booking_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_booking(uuid) TO authenticated;


-- ============================================================
-- 8. restore_expense
-- ============================================================

CREATE OR REPLACE FUNCTION public.restore_expense(_expense_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  UPDATE public.expenses
  SET deleted_at = NULL, updated_at = now()
  WHERE id = _expense_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_expense(uuid) TO authenticated;
