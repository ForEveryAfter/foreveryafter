-- BASELINE SNAPSHOT from production on 2026-04-29
-- This migration represents the existing state of the database.
-- DO NOT run this against production — it already matches.
-- Use this only for fresh local/staging databases.
--
-- Source: PostgREST OpenAPI schema introspection of 22 production tables.
-- Tables with existing RLS policies are noted inline.

-- ═══════════════════════════════════════════════════════
-- EXTENSIONS
-- ═══════════════════════════════════════════════════════

create extension if not exists "uuid-ossp";

-- ═══════════════════════════════════════════════════════
-- TABLES
-- ═══════════════════════════════════════════════════════

-- ─── profiles ─────────────────────────────────────────
create table profiles (
  user_id uuid primary key references auth.users on delete cascade,
  role text not null check (role in ('child', 'parent')),
  first_name text,
  last_name text,
  onboarding_completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table profiles enable row level security;
-- NO POLICIES (gap — addressed in next migration)

-- ─── relationships ────────────────────────────────────
create table relationships (
  id uuid primary key default uuid_generate_v4(),
  child_user_id uuid not null references profiles(user_id),
  parent_user_id uuid not null references profiles(user_id),
  status text not null check (status in ('pending', 'active', 'revoked')),
  invited_at timestamptz default now(),
  accepted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table relationships enable row level security;
-- NO POLICIES (gap)

-- ─── guides ───────────────────────────────────────────
create table guides (
  id uuid primary key default uuid_generate_v4(),
  parent_user_id uuid not null unique references profiles(user_id),
  is_locked bool default true,
  lock_mode text not null check (lock_mode in ('checkin', 'manual', 'open')) default 'checkin',
  completion_percentage int default 0,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table guides enable row level security;
-- NO POLICIES (gap)

-- ─── tiles ────────────────────────────────────────────
create table tiles (
  id uuid primary key default uuid_generate_v4(),
  guide_id uuid not null references guides(id) on delete cascade,
  tile_type text not null check (tile_type in ('life_story', 'accounts', 'health', 'wills', 'final_wishes', 'letters', 'occasions')),
  status text not null check (status in ('not_started', 'in_progress', 'complete')),
  completion_percentage int default 0,
  last_accessed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table tiles enable row level security;
-- NO POLICIES (gap)

-- ─── interview_sessions ──────────────────────────────
create table interview_sessions (
  id uuid primary key default uuid_generate_v4(),
  tile_id uuid not null references tiles(id) on delete cascade,
  guide_id uuid not null references guides(id) on delete cascade,
  session_number int,
  transcript jsonb default '[]',
  audio_storage_path text,
  summary text,
  started_at timestamptz default now(),
  ended_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table interview_sessions enable row level security;
-- NO POLICIES (gap)

-- ─── messages ─────────────────────────────────────────
create table messages (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references interview_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  was_voice_input bool default false,
  created_at timestamptz default now()
);
alter table messages enable row level security;
-- NO POLICIES (gap)

-- ─── access_events ────────────────────────────────────
create table access_events (
  id uuid primary key default uuid_generate_v4(),
  guide_id uuid not null references guides(id) on delete cascade,
  triggered_by_user_id uuid references profiles(user_id),
  event_type text not null check (event_type in (
    'checkin_sent', 'checkin_responded', 'checkin_missed',
    'verification_requested', 'verification_confirmed',
    'verification_rejected', 'guide_unlocked', 'guide_relocked'
  )),
  metadata jsonb,
  created_at timestamptz default now()
);
alter table access_events enable row level security;
-- NO POLICIES (gap)

-- ─── check_in_settings ───────────────────────────────
create table check_in_settings (
  id uuid primary key default uuid_generate_v4(),
  guide_id uuid not null unique references guides(id) on delete cascade,
  interval_months int not null check (interval_months in (3, 6, 12)) default 6,
  last_sent_at timestamptz,
  next_due_at timestamptz,
  parent_response_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table check_in_settings enable row level security;
-- NO POLICIES (gap)

-- ─── subscriptions ────────────────────────────────────
create table subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(user_id),
  plan_type text not null check (plan_type in ('annual', 'five_year', 'ten_year', 'archive')),
  status text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table subscriptions enable row level security;
-- NO POLICIES (gap)

-- ─── occasions ────────────────────────────────────────
create table occasions (
  id uuid primary key default uuid_generate_v4(),
  guide_id uuid not null references guides(id) on delete cascade,
  title text not null,
  date timestamptz not null,
  occasion_type text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table occasions enable row level security;
-- NO POLICIES (gap)

-- ─── vault_items ──────────────────────────────────────
create table vault_items (
  id uuid primary key default uuid_generate_v4(),
  guide_id uuid not null references guides(id) on delete cascade,
  tile_id uuid references tiles(id),
  title text not null,
  file_path text,
  file_type text,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table vault_items enable row level security;
-- NO POLICIES (gap)

-- ─── notifications ────────────────────────────────────
create table notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(user_id),
  title text not null,
  content text not null,
  is_read bool default false,
  created_at timestamptz default now()
);
alter table notifications enable row level security;
-- NO POLICIES (gap)

-- ─── chapters ─────────────────────────────────────────
create table chapters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  "order" int not null,
  created_at timestamptz default now(),
  intro_video_url text,
  intro_text text,
  section text not null default 'mystory',
  section_order int not null default 0,
  icon text,
  is_active bool not null default true
);
alter table chapters enable row level security;
alter table chapters force row level security;
create policy "Chapters are viewable by everyone" on chapters for select using (true);

-- ─── questions ────────────────────────────────────────
create table questions (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references chapters(id) on delete cascade,
  title text not null,
  slug text not null unique,
  prompt_audio_slug text not null,
  type text not null check (type in ('core', 'go_deeper')),
  "order" int not null,
  created_at timestamptz default now(),
  response_type text not null default 'audio',
  is_active bool not null default true,
  depends_on uuid references questions(id),
  hint_text text
);
alter table questions enable row level security;
alter table questions force row level security;
create policy "Questions are viewable by everyone" on questions for select using (true);

-- ─── user_question_responses ──────────────────────────
create table user_question_responses (
  id uuid primary key default gen_random_uuid(),
  parent_guid uuid not null references profiles(user_id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  audio_path text,
  transcript_path text,
  recorded_at timestamptz default now(),
  video_path text,
  audience text default 'everyone',
  audience_user_id uuid,
  unique(parent_guid, question_id)
);
alter table user_question_responses enable row level security;
create policy "Users can manage their own responses" on user_question_responses
  for all using (auth.uid() = parent_guid);

-- ─── user_flags ───────────────────────────────────────
create table user_flags (
  id uuid primary key default gen_random_uuid(),
  user_guid uuid not null references profiles(user_id) on delete cascade,
  flag text not null,
  created_at timestamptz default now(),
  unique(user_guid, flag)
);
alter table user_flags enable row level security;
create policy "Users can manage their own flags" on user_flags
  for all using (auth.uid() = user_guid);

-- ─── document_slots (created in Studio) ───────────────
create table document_slots (
  id uuid primary key default gen_random_uuid(),
  parent_guid uuid not null,
  document_type text not null,
  label text not null,
  encrypted_file_path text,
  encrypted_aes_key text,
  encrypted_location text,
  encrypted_location_key text,
  storage_method text,
  file_name text,
  upload_tier text not null default 'upload_or_location',
  is_required bool not null default false,
  sort_order int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table document_slots enable row level security;
-- HAS POLICIES: full CRUD scoped to parent_guid (created in Studio)
create policy "document_slots_select" on document_slots for select using (auth.uid() = parent_guid);
create policy "document_slots_insert" on document_slots for insert with check (auth.uid() = parent_guid);
create policy "document_slots_update" on document_slots for update using (auth.uid() = parent_guid);
create policy "document_slots_delete" on document_slots for delete using (auth.uid() = parent_guid);

-- ─── family_members (created in Studio) ───────────────
create table family_members (
  id uuid primary key default gen_random_uuid(),
  parent_guid uuid not null,
  member_guid uuid,
  display_name text not null,
  relationship text,
  email text,
  created_at timestamptz default now()
);
alter table family_members enable row level security;
-- HAS POLICIES: SELECT, INSERT, UPDATE scoped to parent_guid
create policy "family_members_select" on family_members for select using (auth.uid() = parent_guid);
create policy "family_members_insert" on family_members for insert with check (auth.uid() = parent_guid);
create policy "family_members_update" on family_members for update using (auth.uid() = parent_guid);

-- ─── final_wishes (created in Studio) ─────────────────
create table final_wishes (
  id uuid primary key default gen_random_uuid(),
  parent_guid text not null,
  service_type text,
  service_notes text,
  body_preference text,
  body_notes text,
  service_video_path text,
  service_video_url text,
  obituary_own_words text,
  obituary_ai_generated text,
  notify_list jsonb not null default '[]'::jsonb,
  updated_at timestamptz default now()
);
alter table final_wishes enable row level security;
-- HAS POLICIES: ALL scoped to parent_guid
create policy "final_wishes_all" on final_wishes for all using (auth.uid()::text = parent_guid);

-- ─── kid_questions (created in Studio) ────────────────
create table kid_questions (
  id uuid primary key default gen_random_uuid(),
  parent_guid uuid not null,
  submitter_guid uuid not null,
  submitter_name text not null,
  question_text text not null,
  audio_path text,
  video_path text,
  status text not null default 'pending',
  created_at timestamptz default now()
);
alter table kid_questions enable row level security;
-- HAS POLICIES: parent can SELECT/INSERT/UPDATE; submitter can SELECT
create policy "kid_questions_parent" on kid_questions for all using (auth.uid() = parent_guid);
create policy "kid_questions_submitter_select" on kid_questions for select using (auth.uid() = submitter_guid);

-- ─── learn_videos (created in Studio) ─────────────────
create table learn_videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null,
  description text,
  video_path text not null,
  duration_seconds int not null,
  category text not null,
  document_type text,
  display_order int not null default 0,
  is_active bool not null default true,
  created_at timestamptz default now()
);
alter table learn_videos enable row level security;
-- HAS POLICIES: SELECT for everyone
create policy "learn_videos_select" on learn_videos for select using (true);

-- ─── parent_video_messages (created in Studio) ────────
create table parent_video_messages (
  id uuid primary key default gen_random_uuid(),
  parent_guid uuid not null,
  title text not null,
  video_path text,
  audience text not null default 'everyone',
  audience_user_id uuid,
  duration_seconds int,
  status text not null default 'draft',
  recorded_at timestamptz,
  created_at timestamptz default now()
);
alter table parent_video_messages enable row level security;
-- HAS POLICIES: SELECT, INSERT, UPDATE scoped to parent_guid
create policy "parent_video_messages_select" on parent_video_messages for select using (auth.uid() = parent_guid);
create policy "parent_video_messages_insert" on parent_video_messages for insert with check (auth.uid() = parent_guid);
create policy "parent_video_messages_update" on parent_video_messages for update using (auth.uid() = parent_guid);

-- ═══════════════════════════════════════════════════════
-- SEED DATA
-- ═══════════════════════════════════════════════════════

-- Chapters (fixed UUIDs for FK references)
insert into chapters (id, name, "order", section, section_order) values
  ('a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Early Life & Childhood', 1, 'mystory', 1),
  ('b2c3d4e5-f6a7-4b6c-9d0e-1f2a3b4c5d6e', 'Adulthood & Career', 2, 'mystory', 2),
  ('c3d4e5f6-a7b8-4c7d-0e1f-2a3b4c5d6e7f', 'Family & Relationships', 3, 'mystory', 3),
  ('d4e5f6a7-b8c9-4d8e-1f2a-3b4c5d6e7f8a', 'Values & Wisdom', 4, 'mystory', 4),
  ('e5f6a7b8-c9d0-4e9f-2a3b-4c5d6e7f8a9b', 'Final Wishes', 5, 'mystory', 5);

-- Sample questions
insert into questions (chapter_id, title, slug, prompt_audio_slug, type, "order") values
  ('a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Where were you born and what was your home like?', 'birthplace-home', 'q-birthplace', 'core', 1),
  ('a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'What is your earliest childhood memory?', 'earliest-memory', 'q-memory', 'core', 2),
  ('b2c3d4e5-f6a7-4b6c-9d0e-1f2a3b4c5d6e', 'What was your first job and what did it teach you?', 'first-job', 'q-job', 'core', 1),
  ('c3d4e5f6-a7b8-4c7d-0e1f-2a3b4c5d6e7f', 'How did you meet your spouse or partner?', 'meeting-partner', 'q-partner', 'core', 1),
  ('d4e5f6a7-b8c9-4d8e-1f2a-3b4c5d6e7f8a', 'What are the three most important values you live by?', 'core-values', 'q-values', 'core', 1);
