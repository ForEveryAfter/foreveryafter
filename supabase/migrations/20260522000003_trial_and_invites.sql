-- Trial accounts + guide invitations.

-- Trial: a logged-in user whose signup is NOT finished, but who is allowed into a
-- read-only dashboard (all data entry / recording disabled). onboarding_completed_at
-- stays the "finished" flag; is_trial is an orthogonal "exploring" flag.
alter table profiles add column if not exists is_trial boolean not null default false;

-- Invitations to create a guide. Token-based so a not-yet-existing user can accept
-- by following the link and signing in. On acceptance we link the new guide owner
-- to the inviter via the relationships table.
create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  inviter_user_id uuid not null references profiles(user_id) on delete cascade,
  invitee_email text,
  invitee_role text not null default 'parent' check (invitee_role in ('parent', 'child')),
  relationship text, -- invitee's relationship to the inviter (e.g. 'parent', 'child', 'spouse')
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  accepted_by_user_id uuid references profiles(user_id) on delete set null,
  created_at timestamptz default now(),
  accepted_at timestamptz
);

create index if not exists invites_inviter_idx on invites (inviter_user_id);

alter table invites enable row level security;

-- Writes go through the service role (server). Owners may read invites they sent.
create policy "invites_select_own" on invites
  for select using (auth.uid() = inviter_user_id);
