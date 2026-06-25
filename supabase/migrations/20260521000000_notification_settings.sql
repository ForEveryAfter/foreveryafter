-- notification_settings
-- One row per user holding their notification toggle preferences.
-- Mirrors the three toggles shown on the dashboard Settings page:
--   Check-in reminders / Family activity / Product updates.
--
-- user_id is nullable for now: the seed rows below are demo users that are
-- not yet linked to auth.users / profiles. Once real accounts exist, rows
-- can be backfilled and user_id made NOT NULL in a follow-up migration.

create table notification_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(user_id) on delete cascade,
  name text not null,
  email text not null unique,
  relationship text,
  check_in_reminders boolean not null default true,
  family_activity boolean not null default true,
  product_updates boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table notification_settings enable row level security;

-- Owner-only access, consistent with the rest of the schema. The API uses the
-- service-role key (which bypasses RLS); these policies keep the table safe if
-- it is ever reached via the anon/authenticated keys.
create policy "notification_settings_select_own" on notification_settings
  for select using (auth.uid() = user_id);
create policy "notification_settings_insert_own" on notification_settings
  for insert with check (auth.uid() = user_id);
create policy "notification_settings_update_own" on notification_settings
  for update using (auth.uid() = user_id);
create policy "notification_settings_delete_own" on notification_settings
  for delete using (auth.uid() = user_id);

-- Seed three example users (made-up emails for now).
-- Toggle columns fall back to their defaults (reminders on, activity on, updates off).
insert into notification_settings (name, email, relationship) values
  ('Myron Lee',   'myronlee@gmail.com',      'son'),
  ('Kevin Lee',   'kevin_lee@hotmail.com',   'son'),
  ('Dorothy Lee', 'dorothy_lee@hotmail.com', 'spouse')
on conflict (email) do nothing;
