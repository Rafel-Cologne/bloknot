-- Расширяем допустимые виды событий агента новым видом 'bank_statement' — банковская
-- выписка, распознанная агентом. В отличие от одиночного счёта (kind='expense'), тут
-- в payload.line_items лежит МАССИВ позиций (все строки выписки), которые хозяин
-- разбирает в интерактивном окне (галочки/правки/удаление) перед добавлением в Расходы.
alter table public.agent_pending_events drop constraint agent_pending_events_kind_check;
alter table public.agent_pending_events add constraint agent_pending_events_kind_check
  check (kind = any (array['booking_new'::text, 'booking_update'::text, 'booking_cancel'::text, 'expense'::text, 'bank_statement'::text]));

-- В отличие от apply_pending_event (одно решение = одна вставка из исходного payload),
-- банковская выписка требует финального списка позиций С УЧЁТОМ правок хозяина
-- (удалённые строки, изменённые суммы/категории/квартиры, разбитые 50/50 строки) —
-- поэтому хозяин присылает уже готовый p_items, а не то, что агент изначально извлёк.
create or replace function public.apply_bank_statement_event(p_event_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_event public.agent_pending_events;
  v_item jsonb;
  v_count int := 0;
begin
  select * into v_event from public.agent_pending_events where id = p_event_id for update;

  if v_event is null then
    raise exception 'pending event not found';
  end if;

  if auth.uid() is not null and v_event.owner_id <> auth.uid() and not has_role(auth.uid(), 'admin'::app_role) then
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
