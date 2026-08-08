-- Баг: если auth.uid() IS NULL (запрос без сессии, просто анонимным ключом), проверка
-- "auth.uid() is not null and owner_id <> auth.uid() and not has_role(...)" целиком превращается
-- в false из-за короткого замыкания на первом условии, и exception никогда не поднимается —
-- то есть неаутентифицированный вызывающий проходит проверку владельца молча. Три RPC-функции
-- ниже (apply_pending_event, dismiss_pending_event, apply_bank_statement_event) вызываются с
-- anon-ключом из фронтенда и были доступны PostgREST без сессии. Правило теперь: если сессии
-- нет вообще — сразу отказ, вне зависимости от остальных условий.
--
-- Применено напрямую в проде через Supabase MCP (apply_migration) 08 Aug 2026 под именем
-- "fix_pending_event_anon_auth_bypass" — этот файл добавлен в репозиторий постфактум для
-- версионирования (в базе уже была схема-дрифт: часть live-объектов отсутствовала в migrations).

CREATE OR REPLACE FUNCTION public.apply_pending_event(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_event public.agent_pending_events;
  v_apt public.apartments;
  v_new_booking_id uuid;
  v_payload jsonb;
begin
  select * into v_event from public.agent_pending_events where id = p_event_id for update;

  if v_event is null then
    raise exception 'pending event not found';
  end if;

  if auth.uid() is null or (v_event.owner_id <> auth.uid() and not has_role(auth.uid(), 'admin'::app_role)) then
    raise exception 'not allowed';
  end if;

  if v_event.status <> 'pending' then
    raise exception 'event already resolved';
  end if;

  v_payload := v_event.payload;

  if v_event.kind = 'booking_new' then
    insert into public.bookings (
      apartment_id, guest_name, guest_phone, start_date, end_date, guests_count,
      status, source, total_amount, cleaning_fee_amount, host_service_fee_amount,
      external_booking_id, source_message_id, created_by_agent
    ) values (
      v_event.apartment_id,
      coalesce(v_payload->>'guest_name', ''),
      coalesce(v_payload->>'guest_phone', ''),
      (v_payload->>'start_date')::date,
      (v_payload->>'end_date')::date,
      coalesce((v_payload->>'guests_count')::int, 1),
      'accepted',
      coalesce(v_payload->>'source', 'airbnb')::booking_source,
      nullif(v_payload->>'total_amount','')::numeric,
      nullif(v_payload->>'cleaning_fee_amount','')::numeric,
      nullif(v_payload->>'host_service_fee_amount','')::numeric,
      v_payload->>'external_booking_id',
      v_event.source_message_id,
      true
    )
    returning id into v_new_booking_id;

    select * into v_apt from public.apartments where id = v_event.apartment_id;

    insert into public.cleaning_tasks (booking_id, cleaner_id, cleaning_fee, status, payment_status)
    values (v_new_booking_id, v_apt.cleaner_id, v_apt.cleaning_fee, 'pending', 'pending');

  elsif v_event.kind = 'booking_update' then
    update public.bookings set
      total_amount = coalesce(nullif(v_payload->>'total_amount','')::numeric, total_amount),
      cleaning_fee_amount = coalesce(nullif(v_payload->>'cleaning_fee_amount','')::numeric, cleaning_fee_amount),
      host_service_fee_amount = coalesce(nullif(v_payload->>'host_service_fee_amount','')::numeric, host_service_fee_amount),
      start_date = coalesce((v_payload->>'start_date')::date, start_date),
      end_date = coalesce((v_payload->>'end_date')::date, end_date),
      guests_count = coalesce((v_payload->>'guests_count')::int, guests_count),
      external_booking_id = coalesce(v_payload->>'external_booking_id', external_booking_id),
      source_message_id = v_event.source_message_id,
      updated_at = now()
    where id = v_event.existing_booking_id;

    v_new_booking_id := v_event.existing_booking_id;

  elsif v_event.kind = 'booking_cancel' then
    update public.bookings set
      deleted_at = now(),
      updated_at = now()
    where id = v_event.existing_booking_id;

    update public.cleaning_tasks set
      status = 'cancelled'
    where booking_id = v_event.existing_booking_id;

    v_new_booking_id := v_event.existing_booking_id;

  elsif v_event.kind = 'expense' then
    insert into public.expenses (
      apartment_id, owner_id, category, amount, expense_date,
      invoice_period_start, invoice_period_end, period_note,
      provider, description, source, status, source_message_id
    ) values (
      v_event.apartment_id,
      v_event.owner_id,
      v_payload->>'category',
      (v_payload->>'amount')::numeric,
      coalesce(nullif(v_payload->>'invoice_date','')::date, current_date),
      nullif(v_payload->>'period_start','')::date,
      nullif(v_payload->>'period_end','')::date,
      v_payload->>'period_label',
      v_payload->>'provider',
      v_payload->>'description',
      'email_agent',
      'confirmed',
      v_event.source_message_id
    );
  end if;

  update public.agent_pending_events
  set status = 'applied', resolved_at = now(), resolved_booking_id = v_new_booking_id
  where id = p_event_id;

  return jsonb_build_object('ok', true, 'booking_id', v_new_booking_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.dismiss_pending_event(p_event_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_event public.agent_pending_events;
begin
  select * into v_event from public.agent_pending_events where id = p_event_id for update;
  if v_event is null then
    raise exception 'pending event not found';
  end if;
  if auth.uid() is null or (v_event.owner_id <> auth.uid() and not has_role(auth.uid(), 'admin'::app_role)) then
    raise exception 'not allowed';
  end if;
  if v_event.status <> 'pending' then
    raise exception 'event already resolved';
  end if;

  update public.agent_pending_events
  set status = 'dismissed', resolved_at = now()
  where id = p_event_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_bank_statement_event(p_event_id uuid, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_event public.agent_pending_events;
  v_item jsonb;
  v_count int := 0;
begin
  select * into v_event from public.agent_pending_events where id = p_event_id for update;

  if v_event is null then
    raise exception 'pending event not found';
  end if;

  if auth.uid() is null or (v_event.owner_id <> auth.uid() and not has_role(auth.uid(), 'admin'::app_role)) then
    raise exception 'not allowed';
  end if;

  if v_event.kind <> 'bank_statement' then
    raise exception 'not a bank_statement event';
  end if;

  if v_event.status <> 'pending' then
    raise exception 'event already resolved';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.expenses (
      apartment_id, owner_id, category, amount, expense_date, provider, description, source, status
    ) values (
      (v_item->>'apartment_id')::uuid,
      v_event.owner_id,
      v_item->>'category',
      (v_item->>'amount')::numeric,
      (v_item->>'expense_date')::date,
      nullif(v_item->>'provider', ''),
      nullif(v_item->>'description', ''),
      'email_agent',
      'confirmed'
    );
    v_count := v_count + 1;
  end loop;

  update public.agent_pending_events
  set status = 'applied', resolved_at = now()
  where id = p_event_id;

  return jsonb_build_object('ok', true, 'inserted', v_count);
end;
$function$;
