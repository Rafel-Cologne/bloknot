-- =============================================================
-- Bloknot: автоматический годовой налоговый отчёт (Modelo 210 / IRNR)
--
-- Основано на разборе реальных деклараций владельцев за 2025 год (2 квартиры ×
-- 2 совладельца-нерезидента = 4 декларации Modelo 210) и проверке реальной
-- брони в базе (Airbnb): total_amount в bookings уже БЕЗ комиссии площадки,
-- но комиссия (host_service_fee_amount) хранится отдельно — для Modelo 210
-- casilla 5 нужна ПОЛНАЯ сумма, которую заплатил гость, поэтому
-- gross_income = total_amount + host_service_fee_amount, а сама комиссия
-- вычитается отдельной строкой как 100%-расход (без пропорции по дням —
-- она и так возникает только благодаря сдаче).
--
-- Отличие от исходного черновика спецификации: совладелец (apartment_owners)
-- НЕ обязан иметь учётную запись в приложении (profiles) — в реальности
-- совладелец квартиры может никогда не логиниться в Bloknot. Поэтому имя,
-- НИФ/NIE и налоговое резидентство хранятся прямо в apartment_owners, а
-- owner_id -> profiles необязателен (используется только если совладелец
-- всё-таки завёл аккаунт). tax_filings ссылается на apartment_owners, а не
-- на profiles, по той же причине.
--
-- Резиденты Испании (Modelo 100, IRPF, прогрессивная шкала) в этой версии
-- НЕ считаются — функция вернёт tax_rate = NULL и tax_due = 0 для них, чтобы
-- не притворяться, что посчитала то, чего не считала.
-- =============================================================

-- 1) Совладельцы объекта + их налоговый статус ------------------------------
-- apartments.owner_id остаётся "основным" владельцем/админом объекта в приложении
-- (кто управляет бронями, расходами и т.п.), а реальное налоговое распределение
-- дохода идёт через эту таблицу — один объект может иметь несколько совладельцев
-- с разными долями и разным налоговым резидентством.
create table if not exists public.apartment_owners (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null, -- необязательно: только если у совладельца есть логин
  full_name text not null,
  nif_nie text,
  tax_country_code text, -- ISO-3166-1 alpha-2, напр. 'DE'
  tax_residency text not null default 'non_resident_eu',
  ownership_pct numeric(5,2) not null check (ownership_pct > 0 and ownership_pct <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'apartment_owners_tax_residency_check'
  ) then
    alter table public.apartment_owners
      add constraint apartment_owners_tax_residency_check
      check (tax_residency in ('resident_es', 'non_resident_eu', 'non_resident_other'));
  end if;
end $$;
comment on table public.apartment_owners is
  'Доли владения объектом + налоговый статус каждого совладельца. Совладелец не '
  'обязан иметь аккаунт в приложении (owner_id может быть NULL) — нужно, чтобы '
  'разбить доход/расход по каждому совладельцу отдельно для Modelo 210 '
  '(каждый нерезидент подаёт свою декларацию).';
comment on column public.apartment_owners.tax_residency is
  'resident_es -> Modelo 100 IRPF (не покрыто calculate_annual_tax_report); '
  'non_resident_eu -> Modelo 210, ставка 19%, расходы вычитаются; '
  'non_resident_other -> Modelo 210, ставка 24%, расходы НЕ вычитаются (база = валовый доход)';

create index if not exists idx_apartment_owners_apartment on public.apartment_owners(apartment_id);

drop trigger if exists trg_apartment_owners_updated_at on public.apartment_owners;
create trigger trg_apartment_owners_updated_at
  before update on public.apartment_owners
  for each row execute function public.update_updated_at_column();

-- бэкфилл: имеющийся apartments.owner_id считаем единственным совладельцем на 100%
-- (реальное совладение — как у вас, 50/50 — нужно будет добавить вторым рядом через UI).
insert into public.apartment_owners (apartment_id, owner_id, full_name, ownership_pct)
select a.id, a.owner_id, coalesce(p.name, p.email, 'Владелец'), 100
from public.apartments a
join public.profiles p on p.id = a.owner_id
where not exists (
  select 1 from public.apartment_owners ao where ao.apartment_id = a.id
);

alter table public.apartment_owners enable row level security;
drop policy if exists "apartment_owners: apartment owner manages" on public.apartment_owners;
create policy "apartment_owners: apartment owner manages" on public.apartment_owners
  for all using (
    exists (select 1 from public.apartments a where a.id = apartment_owners.apartment_id and a.owner_id = auth.uid())
  );
drop policy if exists "apartment_owners: co-owner sees own row" on public.apartment_owners;
create policy "apartment_owners: co-owner sees own row" on public.apartment_owners
  for select using (owner_id = auth.uid());
drop policy if exists "apartment_owners: admin full" on public.apartment_owners;
create policy "apartment_owners: admin full" on public.apartment_owners
  for all using (public.has_role(auth.uid(), 'admin'::app_role));

-- 2) Вычитаемость и тип начисления расхода -----------------------------------
--
-- proration_method различает два типа затрат:
--  - 'time_based'  — расход существует независимо от того, сдаётся квартира
--                    в этот день или нет (IBI, comunidad, страховка, % по
--                    ипотеке, коммуналка по счётчику). Вычитается ТОЛЬКО
--                    пропорционально дням сдачи в году.
--  - 'per_booking' — расход существует только благодаря конкретной сдаче
--                    (клининг между гостями, разовый сервис по брони).
--                    Вычитается на 100%, без пропорции — он и так уже
--                    "привязан" только к сданным дням.
-- По умолчанию 'time_based' — большинство текущих расходов именно такие
-- (коммуналка, страховка и т.п.). Для годового счёта клининга — 'per_booking'.
alter table public.expenses
  add column if not exists is_tax_deductible boolean not null default true,
  add column if not exists proration_method text not null default 'time_based';
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'expenses_proration_method_check'
  ) then
    alter table public.expenses
      add constraint expenses_proration_method_check
      check (proration_method in ('time_based', 'per_booking'));
  end if;
end $$;
comment on column public.expenses.is_tax_deductible is
  'false для расходов, не признаваемых Hacienda как вычет по IRNR '
  '(личные траты, штрафы, капитальные улучшения — те амортизируются отдельно, не списываются разом)';
comment on column public.expenses.proration_method is
  'time_based = вычитается пропорционально дням сдачи в году (IBI, comunidad, '
  'страховка, ипотека, коммуналка); per_booking = вычитается на 100%, без '
  'пропорции (клининг, разовые расходы по конкретной сдаче)';

-- клининг задним числом переключаем на per_booking, чтобы уже внесённые
-- расходы этой категории сразу считались правильно (без пропорции по дням)
update public.expenses set proration_method = 'per_booking'
where category = 'cleaning' and proration_method = 'time_based';

-- 3) Хранилище посчитанных/поданных деклараций -------------------------------
create table if not exists public.tax_filings (
  id uuid primary key default gen_random_uuid(),
  apartment_owner_id uuid not null references public.apartment_owners(id) on delete cascade,
  fiscal_year int not null,
  tax_model text not null default '210',
  gross_income numeric(12,2) not null,
  rental_days int not null,
  calendar_days int not null,
  platform_commission numeric(12,2) not null default 0,
  time_based_expenses numeric(12,2) not null default 0,
  per_booking_expenses numeric(12,2) not null default 0,
  depreciation numeric(12,2) not null default 0,
  deductible_expenses numeric(12,2) not null default 0,
  taxable_base numeric(12,2) not null,
  tax_rate numeric(5,2),
  tax_due numeric(12,2),
  status text not null default 'draft',
  filed_at date,
  nrc text,                 -- номер платежа AEAT (как в JUSTIFICANTE DE PAGO)
  justificante_number text, -- "Número de justificante" формы 210
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (apartment_owner_id, fiscal_year)
);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tax_filings_tax_model_check') then
    alter table public.tax_filings add constraint tax_filings_tax_model_check check (tax_model in ('210', '100'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tax_filings_status_check') then
    alter table public.tax_filings add constraint tax_filings_status_check check (status in ('draft', 'filed', 'paid'));
  end if;
end $$;
comment on table public.tax_filings is
  'История годовых деклараций Modelo 210/100 по каждому совладельцу и объекту.';

drop trigger if exists trg_tax_filings_updated_at on public.tax_filings;
create trigger trg_tax_filings_updated_at
  before update on public.tax_filings
  for each row execute function public.update_updated_at_column();

alter table public.tax_filings enable row level security;
drop policy if exists "tax_filings: apartment owner manages" on public.tax_filings;
create policy "tax_filings: apartment owner manages" on public.tax_filings
  for all using (
    exists (
      select 1 from public.apartment_owners ao
      join public.apartments a on a.id = ao.apartment_id
      where ao.id = tax_filings.apartment_owner_id and a.owner_id = auth.uid()
    )
  );
drop policy if exists "tax_filings: co-owner sees own" on public.tax_filings;
create policy "tax_filings: co-owner sees own" on public.tax_filings
  for select using (
    exists (select 1 from public.apartment_owners ao where ao.id = tax_filings.apartment_owner_id and ao.owner_id = auth.uid())
  );
drop policy if exists "tax_filings: admin full" on public.tax_filings;
create policy "tax_filings: admin full" on public.tax_filings
  for all using (public.has_role(auth.uid(), 'admin'::app_role));

-- 4) Функция расчёта ----------------------------------------------------------
create or replace function public.calculate_annual_tax_report(
  p_apartment_id uuid,
  p_year int
)
returns table (
  apartment_owner_id uuid,
  owner_id uuid,
  owner_name text,
  nif_nie text,
  ownership_pct numeric,
  tax_residency text,
  tax_rate numeric,
  gross_income numeric,
  rental_days int,
  calendar_days int,
  platform_commission numeric,
  time_based_expenses numeric,
  per_booking_expenses numeric,
  depreciation numeric,
  deductible_expenses numeric,
  taxable_base numeric,
  tax_due numeric
)
language sql
stable
as $$
  with bounds as (
    select make_date(p_year, 1, 1) as y_start,
           make_date(p_year, 12, 31) as y_end
  ),
  -- Ночи и доход по каждой пересекающейся с годом брони, с прорацией на случай
  -- если бронь начинается в одном году и заканчивается в другом (доход и ночи
  -- делятся пропорционально тому, сколько ночей реально попадает в этот год).
  rental_calc as (
    select
      (least(b.end_date, bo.y_end) - greatest(b.start_date, bo.y_start))::int as nights_in_year,
      (b.end_date - b.start_date)::int as total_nights,
      coalesce(b.total_amount, 0) as total_amount,
      coalesce(b.host_service_fee_amount, 0) as host_service_fee_amount
    from bounds bo
    join public.bookings b
      on b.apartment_id = p_apartment_id
     and b.status = 'accepted'
     and b.source <> 'personal'
     and b.deleted_at is null
     and b.start_date <= bo.y_end
     and b.end_date >= bo.y_start
     and b.end_date > b.start_date
  ),
  rental as (
    select
      coalesce(sum(nights_in_year), 0)::int as nights,
      coalesce(sum((total_amount + host_service_fee_amount) * nights_in_year::numeric / nullif(total_nights, 0)), 0) as gross_income,
      coalesce(sum(host_service_fee_amount * nights_in_year::numeric / nullif(total_nights, 0)), 0) as platform_commission
    from rental_calc
  ),
  exp as (
    select
      coalesce(sum(e.amount) filter (where e.proration_method = 'time_based'), 0) as time_based_total,
      coalesce(sum(e.amount) filter (where e.proration_method = 'per_booking'), 0) as per_booking_total
    from public.expenses e, bounds bo
    where e.apartment_id = p_apartment_id
      and e.status = 'confirmed'
      and e.is_tax_deductible
      and e.deleted_at is null
      and e.expense_date between bo.y_start and bo.y_end
  ),
  apt as (
    select construction_value from public.apartments where id = p_apartment_id
  ),
  per_owner as (
    select
      ao.id as apartment_owner_id,
      ao.owner_id,
      ao.full_name as owner_name,
      ao.nif_nie,
      ao.ownership_pct,
      ao.tax_residency,
      case ao.tax_residency
        when 'non_resident_eu' then 19.00
        when 'non_resident_other' then 24.00
        else null -- resident_es -> Modelo 100, вне охвата этой функции
      end as tax_rate,
      round(rental.gross_income * ao.ownership_pct / 100, 2) as gross_income,
      rental.nights as rental_days,
      (select (y_end - y_start) + 1 from bounds) as calendar_days,
      -- комиссия площадки: 100% вычет только для EU-резидента, для остальных база = валовый доход
      case when ao.tax_residency = 'non_resident_eu' then
        round(rental.platform_commission * ao.ownership_pct / 100, 2)
      else 0 end as platform_commission,
      -- расходы "по времени": пропорция rental_days/calendar_days
      case when ao.tax_residency = 'non_resident_eu' then
        round(
          exp.time_based_total * ao.ownership_pct / 100 * rental.nights::numeric
          / greatest((select (y_end - y_start) + 1 from bounds), 1)
        , 2)
      else 0 end as time_based_expenses,
      -- расходы "по брони" (клининг и т.п.): 100% вычет, без пропорции
      case when ao.tax_residency = 'non_resident_eu' then
        round(exp.per_booking_total * ao.ownership_pct / 100, 2)
      else 0 end as per_booking_expenses,
      -- амортизация 3%/год от стоимости строения, пропорция дням сдачи
      case when ao.tax_residency = 'non_resident_eu' and apt.construction_value is not null then
        round(
          apt.construction_value * 0.03 * ao.ownership_pct / 100 * rental.nights::numeric
          / greatest((select (y_end - y_start) + 1 from bounds), 1)
        , 2)
      else 0 end as depreciation
    from public.apartment_owners ao
    cross join rental
    cross join exp
    cross join apt
    where ao.apartment_id = p_apartment_id
  )
  select
    apartment_owner_id, owner_id, owner_name, nif_nie, ownership_pct, tax_residency, tax_rate,
    gross_income, rental_days, calendar_days,
    platform_commission, time_based_expenses, per_booking_expenses, depreciation,
    round(platform_commission + time_based_expenses + per_booking_expenses + depreciation, 2) as deductible_expenses,
    round(
      gross_income - (platform_commission + time_based_expenses + per_booking_expenses + depreciation)
    , 2) as taxable_base,
    round(
      (gross_income - (platform_commission + time_based_expenses + per_booking_expenses + depreciation))
      * coalesce(tax_rate, 0) / 100
    , 2) as tax_due
  from per_owner;
$$;

comment on function public.calculate_annual_tax_report is
  'Считает разбивку Modelo 210 по каждому совладельцу объекта (apartment_owners) '
  'за календарный год. Автоматически подтягивает комиссию площадки '
  '(bookings.host_service_fee_amount) как 100%-вычитаемый расход для EU-резидентов. '
  'Для tax_residency = resident_es возвращает tax_rate = NULL, tax_due = 0 '
  '(нужна отдельная логика Modelo 100 IRPF, здесь не реализована).';

-- Пример вызова:
-- select * from public.calculate_annual_tax_report(
--   (select id from public.apartments where title ilike '%la mata%'),
--   2025
-- );
