-- Публичная (без данных гостя) выборка занятых диапазонов дат — нужна для страницы объекта
-- и для главной страницы, чтобы гости видели реальную доступность. RLS на bookings намеренно
-- не даёт анонимам читать таблицу целиком (там телефон/имя гостя), поэтому отдаём отдельную
-- SECURITY DEFINER функцию, которая возвращает только apartment_id/даты/статус.
create or replace function public.get_public_booked_ranges(p_apartment_ids uuid[] default null)
returns table (apartment_id uuid, start_date date, end_date date, status text)
language sql
security definer
set search_path to 'public'
stable
as $function$
  select b.apartment_id, b.start_date, b.end_date, b.status::text
  from public.bookings b
  where b.deleted_at is null
    and b.status in ('accepted', 'pending')
    and (p_apartment_ids is null or b.apartment_id = any(p_apartment_ids))
$function$;

grant execute on function public.get_public_booked_ranges(uuid[]) to anon, authenticated;
