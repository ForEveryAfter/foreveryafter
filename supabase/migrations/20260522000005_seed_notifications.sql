-- Seed a few notifications for the established user (Harold) so the bell isn't
-- empty once it's wired to the DB. Guarded to prod (his profile must exist) and
-- idempotent (only seeds if he has no notifications yet).
do $$
declare v_user uuid := '2891f294-80ea-439a-bb4d-8f00adb05252';
begin
  if exists (select 1 from profiles where user_id = v_user)
     and not exists (select 1 from notifications where user_id = v_user) then
    insert into notifications (user_id, title, content, is_read, created_at) values
      (v_user, 'Guide created',  'Your guide was created successfully.',   false, now() - interval '1 minute'),
      (v_user, 'New co-guide',   'Myron Lee was added as a co-guide.',     false, now() - interval '2 hours'),
      (v_user, 'New co-guide',   'Kevin Lee was added as a co-guide.',     true,  now() - interval '1 day');
  end if;
end $$;
