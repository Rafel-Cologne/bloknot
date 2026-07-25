-- Позволяет хозяину вручную исключить конкретную бронь (обычно частную, source='other')
-- из налогооблагаемого дохода Modelo 210 — например, если гость по факту не заплатил.
-- Раньше это решение хранилось только в localStorage браузера (не видно совладельцу/
-- администратору, теряется при смене устройства, и НЕ влияло на calculate_annual_tax_report).
-- Теперь это настоящее поле брони, и функция расчёта его учитывает.
alter table public.bookings
  add column if not exists exclude_from_tax boolean not null default false;
comment on column public.bookings.exclude_from_tax is
  'true — бронь не включается в налогооблагаемый доход Modelo 210/100 (например, гость '
  'по факту не заплатил). Дни бронирования при этом всё равно считаются днями сдачи.';

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
  -- Ночи (для пропорции расходов/амортизации) считаются по ВСЕМ сданным броням, включая
  -- исключённые из дохода — жильё физически сдавалось. А доход/комиссия площадки — только
  -- по не исключённым.
  rental_calc as (
    select
      (least(b.end_date, bo.y_end) - greatest(b.start_date, bo.y_start))::int as nights_in_year,
      (b.end_date - b.start_date)::int as total_nights,
      coalesce(b.total_amount, 0) as total_amount,
      coalesce(b.host_service_fee_amount, 0) as host_service_fee_amount,
      b.exclude_from_tax
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
      coalesce(sum((total_amount + host_service_fee_amount) * nights_in_year::numeric / nullif(total_nights, 0))
                filter (where not exclude_from_tax), 0) as gross_income,
      coalesce(sum(host_service_fee_amount * nights_in_year::numeric / nullif(total_nights, 0))
                filter (where not exclude_from_tax), 0) as platform_commission
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
        else null
      end as tax_rate,
      round(rental.gross_income * ao.ownership_pct / 100, 2) as gross_income,
      rental.nights as rental_days,
      (select (y_end - y_start) + 1 from bounds) as calendar_days,
      case when ao.tax_residency = 'non_resident_eu' then
        round(rental.platform_commission * ao.ownership_pct / 100, 2)
      else 0 end as platform_commission,
      case when ao.tax_residency = 'non_resident_eu' then
        round(
          exp.time_based_total * ao.ownership_pct / 100 * rental.nights::numeric
          / greatest((select (y_end - y_start) + 1 from bounds), 1)
        , 2)
      else 0 end as time_based_expenses,
      case when ao.tax_residency = 'non_resident_eu' then
        round(exp.per_booking_total * ao.ownership_pct / 100, 2)
      else 0 end as per_booking_expenses,
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
