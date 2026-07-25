-- Гарантия на уровне БД: для одной квартиры не может быть двух ПОДТВЕРЖДЁННЫХ
-- (status = 'accepted') броней с пересекающимися датами. Проверка на клиенте (форма
-- бронирования, кнопка "Подтвердить") может быть обойдена багом/гонкой запросов —
-- это последний рубеж защиты от двойного бронирования.
-- Заявки со статусом 'pending' constraint не затрагивает: несколько гостей могут
-- одновременно отправить запрос на одни и те же даты, это нормально — решает хозяин.
create extension if not exists btree_gist;

alter table public.bookings
  add constraint bookings_no_overlap_accepted
  exclude using gist (
    apartment_id with =,
    daterange(start_date, end_date, '[)') with &&
  )
  where (status = 'accepted' and deleted_at is null);
