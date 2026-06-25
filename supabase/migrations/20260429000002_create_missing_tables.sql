-- Create tables referenced by API code but not yet in production:
-- 1. parent_keys (RSA key storage for accounts encryption)
-- 2. sensitive_entries (encrypted account entries)
-- 3. letters_to_loved_ones (letters section)

-- ═══════════════════════════════════════════════════════
-- parent_keys
-- Used by: identity/routes.ts, accounts/routes.ts, utils/encryption.ts
-- Stores RSA public key per parent. Private key lives in Supabase Vault.
-- ═══════════════════════════════════════════════════════
create table parent_keys (
  id uuid primary key default gen_random_uuid(),
  parent_guid uuid not null unique references profiles(user_id) on delete cascade,
  public_key text not null,
  vault_key_id text not null,
  created_at timestamptz default now()
);

alter table parent_keys enable row level security;

create policy "parent_keys_select_own" on parent_keys
  for select using (auth.uid() = parent_guid);
create policy "parent_keys_insert_own" on parent_keys
  for insert with check (auth.uid() = parent_guid);
create policy "parent_keys_update_own" on parent_keys
  for update using (auth.uid() = parent_guid);
create policy "parent_keys_delete_own" on parent_keys
  for delete using (auth.uid() = parent_guid);

-- ═══════════════════════════════════════════════════════
-- sensitive_entries
-- Used by: identity/routes.ts (seed), accounts/routes.ts (CRUD)
-- Stores encrypted account information (bank, email, phone, etc.)
-- ═══════════════════════════════════════════════════════
create table sensitive_entries (
  id uuid primary key default gen_random_uuid(),
  parent_guid uuid not null references profiles(user_id) on delete cascade,
  category text not null,
  label text not null,
  is_required bool not null default false,
  handled_in_will bool not null default false,
  encrypted_data text,
  sort_order int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table sensitive_entries enable row level security;

create policy "sensitive_entries_select_own" on sensitive_entries
  for select using (auth.uid() = parent_guid);
create policy "sensitive_entries_insert_own" on sensitive_entries
  for insert with check (auth.uid() = parent_guid);
create policy "sensitive_entries_update_own" on sensitive_entries
  for update using (auth.uid() = parent_guid);
create policy "sensitive_entries_delete_own" on sensitive_entries
  for delete using (auth.uid() = parent_guid);

-- ═══════════════════════════════════════════════════════
-- letters_to_loved_ones
-- Used by: letters/routes.ts
-- One letter per (parent, recipient) pair.
-- Format can be typed text, audio recording, or video recording.
-- ═══════════════════════════════════════════════════════
create table letters_to_loved_ones (
  id uuid primary key default gen_random_uuid(),
  parent_guid uuid not null references profiles(user_id) on delete cascade,
  recipient_guid uuid not null,
  format text check (format in ('typed', 'audio', 'video')),
  content_text text,
  audio_path text,
  video_path text,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'complete')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(parent_guid, recipient_guid)
);

alter table letters_to_loved_ones enable row level security;

create policy "letters_select_own" on letters_to_loved_ones
  for select using (auth.uid() = parent_guid);
create policy "letters_insert_own" on letters_to_loved_ones
  for insert with check (auth.uid() = parent_guid);
create policy "letters_update_own" on letters_to_loved_ones
  for update using (auth.uid() = parent_guid);
create policy "letters_delete_own" on letters_to_loved_ones
  for delete using (auth.uid() = parent_guid);
