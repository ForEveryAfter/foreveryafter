-- Release flow: a trusted individual (either of the guide's 1–2 TIs) releases the guide
-- to the family. There is no second-TI acknowledgment and no grace period — the release
-- is prepared immediately. guides.released_at is the source of truth for "released";
-- release_events is the per-release record the export engine (deferred) tracks.

alter table guides add column if not exists released_at timestamptz;

create table release_events (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references guides(id) on delete cascade,
  -- the TI who proceeded (profiles.user_id; loose ref, matching the codebase)
  triggered_by_user_id uuid not null,
  -- export lifecycle: 'preparing' (gathering/zipping) → 'ready' (emailed, downloadable) | 'failed'
  status text not null default 'preparing'
    check (status in ('preparing', 'ready', 'failed')),
  -- where the prepared download lands once ready (deferred export); null while preparing
  export_path text,
  created_at timestamptz default now(),
  ready_at timestamptz
);

create index release_events_guide_id_idx on release_events (guide_id);

-- At most one active (preparing/ready) release per guide; a 'failed' attempt can be retried.
create unique index release_events_one_active
  on release_events (guide_id)
  where status in ('preparing', 'ready');

alter table release_events enable row level security;

-- Reads + writes go through the service role (the API), which bypasses RLS. RLS is on
-- with no public policy so anon/authenticated clients get nothing — same as our other
-- server-owned tables.
