-- Админ должен видеть полностью "кабинет уборщицы" — весь список уборок по всем хозяевам
-- и клинерам (для общего надзора за сервисом), а не только свои назначенные задачи.
-- Раньше на cleaning_tasks не было admin-политики вообще: SELECT был только у самого
-- клинера (cleaner_id = auth.uid()) и у хозяина брони (is_owner_of_booking).
create policy "tasks: admin sees all" on public.cleaning_tasks
  for select using (public.has_role(auth.uid(), 'admin'));
