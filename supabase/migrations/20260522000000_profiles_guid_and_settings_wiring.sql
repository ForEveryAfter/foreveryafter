-- Wire the dashboard Settings page to real per-user data.
--
-- Identity model (see apps/api/src/auth):
--   profiles.user_id  — INTERNAL key. All joins/FKs use it; never exposed to the frontend.
--   profiles.guid     — PUBLIC handle the frontend uses and that the API matches for
--                       ownership on every write. Random, non-sequential, unspoofable.
--   profiles.email    — lets login resolve a profile from the OAuth email.
--
-- The backfill block targets the single provisioned production user (Harold) by his
-- known user_id / guide_id. The guards make it a no-op on fresh local/staging DBs.

-- ─── profiles: add public guid + email ───────────────────────────────
alter table profiles add column if not exists email text;
alter table profiles add column if not exists guid uuid not null default gen_random_uuid();

create unique index if not exists profiles_guid_key  on profiles (guid);
create unique index if not exists profiles_email_key on profiles (email);

-- ─── guides: persist the chosen Trusted Individuals ──────────────────
alter table guides add column if not exists primary_ti_member_id   uuid references family_members(id) on delete set null;
alter table guides add column if not exists secondary_ti_member_id uuid references family_members(id) on delete set null;

-- ─── Backfill the one provisioned production user (Harold) ───────────
-- His OAuth login email is the Microsoft account myron_lee@hotmail.com.
update profiles
   set email = 'myron_lee@hotmail.com'
 where user_id = '2891f294-80ea-439a-bb4d-8f00adb05252'
   and email is null;

-- Link Harold's existing notification_settings row to his profile (internal id).
update notification_settings
   set user_id = '2891f294-80ea-439a-bb4d-8f00adb05252'
 where email = 'myron_lee@hotmail.com';

-- Seed family members, the default Trusted Individual, and a check-in schedule
-- so every Settings section reads real data. Guarded to prod (Harold's profile
-- must exist) and idempotent (only seeds when nothing is there yet).
do $$
declare
  v_user_id  uuid := '2891f294-80ea-439a-bb4d-8f00adb05252';
  v_guide_id uuid := '18aa483a-3519-4b7e-838c-856121eec5f1';
  v_primary  uuid;
begin
  if exists (select 1 from profiles where user_id = v_user_id) then

    if not exists (select 1 from family_members where parent_guid = v_user_id) then
      insert into family_members (parent_guid, display_name, relationship, email) values
        (v_user_id, 'Myron Lee',   'son',    'myronlee@gmail.com'),
        (v_user_id, 'Kevin Lee',   'son',    'kevin_lee@hotmail.com'),
        (v_user_id, 'Dorothy Lee', 'spouse', 'dorothy_lee@hotmail.com');
    end if;

    select id into v_primary
      from family_members
     where parent_guid = v_user_id and display_name = 'Myron Lee'
     limit 1;

    update guides
       set primary_ti_member_id = coalesce(primary_ti_member_id, v_primary)
     where id = v_guide_id;

    if not exists (select 1 from check_in_settings where guide_id = v_guide_id) then
      insert into check_in_settings (guide_id, interval_months, next_due_at)
      values (v_guide_id, 6, now() + interval '6 months');
    end if;

  end if;
end $$;
