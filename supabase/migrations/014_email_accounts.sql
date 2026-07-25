-- Отдельный почтовый ящик (faktura.imya@gmail.com) на каждого пользователя, вместо одного
-- общего Gmail-ящика с алиасами. Токен доступа хранится только для service-role (сам агент,
-- edge-функции) — обычные пользователи и владельцы его не видят и не могут прочитать чужие письма.
create table public.email_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  email_address text not null unique,
  gmail_refresh_token text not null,
  last_history_id text,
  is_active boolean not null default true,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index email_accounts_owner_id_idx on public.email_accounts (owner_id);

create trigger email_accounts_set_updated_at
  before update on public.email_accounts
  for each row execute function public.update_updated_at_column();

alter table public.email_accounts enable row level security;

-- Никаких RLS-policy для authenticated/anon на самой таблице НЕ создаём — она целиком закрыта
-- для всех, кроме service_role (его использует только сама edge-функция агента, RLS для него
-- не применяется). Так gmail_refresh_token в принципе не может утечь ни владельцу, ни админу
-- через обычный запрос к таблице.
--
-- Статус подключения (адрес/активность/дату — БЕЗ токена) админ и владелец видят через
-- отдельную view. View создаётся без security_invoker (т.е. выполняется с правами владельца
-- view, а не вызывающего, — это намеренно обходит RLS базовой таблицы), а фильтрацию по
-- ролям делает сама явным WHERE — так что скрытые от authenticated колонки (refresh_token,
-- last_history_id) в неё просто не попадают, и утечь не могут в принципе.
create view public.email_accounts_status as
select id, owner_id, email_address, is_active, connected_at, last_synced_at
from public.email_accounts
where owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'::app_role);

grant select on public.email_accounts_status to authenticated;
