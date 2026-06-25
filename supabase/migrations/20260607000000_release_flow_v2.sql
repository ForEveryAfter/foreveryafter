-- Release flow v2: replaces the export-lifecycle release_events table from
-- 20260522000010 with a release-DECISION lifecycle (pending/executed/canceled).
-- The deferred export engine has its own state; nothing in production uses the
-- old release_events table yet, so dropping is safe.

-- ─── 1) GUIDES: release-state columns ─────────────────────────────────────────────
-- released_at already exists from the v1 migration; keep it. The new columns model
-- the full lifecycle so the manual flow can sit in 'release_pending' for a hold
-- window before executing.
alter table guides
  add column if not exists release_status text default 'active'
    check (release_status in ('active', 'release_pending', 'released', 'release_canceled')),
  add column if not exists release_reason text
    check (release_reason in ('checkin_expired', 'manual_trusted_rep')),
  add column if not exists release_requested_at timestamptz,
  add column if not exists release_executes_at timestamptz,
  add column if not exists released_by_profile_id uuid;

-- Backfill: any guide that already has released_at (from v1) is 'released'.
update guides
   set release_status = 'released'
 where released_at is not null and release_status = 'active';

-- ─── 2) RELEASE_EVENTS: replace with the new lifecycle model ──────────────────────
-- The v1 table tracked export progress (preparing/ready/failed). The new spec
-- tracks the release DECISION (pending/executed/canceled). One row per lifecycle.
drop table if exists release_events;

create table release_events (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references guides(id) on delete cascade,
  reason text not null
    check (reason in ('checkin_expired', 'manual_trusted_rep')),
  -- Null for automated trigger (check-in expired). Loose ref to profiles.user_id,
  -- matching the codebase's pattern of not hard-FK'ing to profiles.
  requested_by_profile_id uuid,
  status text not null default 'pending'
    check (status in ('pending', 'executed', 'canceled')),
  requested_at timestamptz not null default now(),
  -- requested_at + RELEASE_HOLD_HOURS. When monitor sees status='pending' and
  -- now() >= executes_at, it calls executeRelease.
  executes_at timestamptz not null,
  executed_at timestamptz,
  canceled_at timestamptz,
  canceled_by_profile_id uuid,
  -- Stripe refund id once issued — the idempotency key for billing.
  refund_id text,
  notes text,
  created_at timestamptz not null default now()
);

create index release_events_guide_id_idx on release_events (guide_id);

-- Monitor query path: pending events whose hold window has elapsed.
create index release_events_pending_executes_idx
  on release_events (executes_at)
  where status = 'pending';

-- IDEMPOTENCY: at most ONE non-canceled release_event per guide. Blocks the
-- manual+automated race AND double-click on the manual button.
create unique index release_events_one_active
  on release_events (guide_id)
  where status in ('pending', 'executed');

alter table release_events enable row level security;
-- Server-only access (service role bypasses RLS — same pattern as the other
-- queue tables in this codebase).

-- ─── 3) Storage subscription plan ($5/year, drop-to after release) ──────────────
-- Only the price + period matter for the downgrade flow; Stripe holds the actual
-- recurring Price (env STRIPE_STORAGE_PRICE_ID; release/core.ts creates one
-- on-the-fly if the env var is missing and logs the id for you to paste in).
insert into subscription_plans (id, name, price_cents, spouse_addon_cents, period, features, is_active, sort_order)
values ('storage', 'Storage', 500, 0, '/year', '[]'::jsonb, false, 100)
on conflict (id) do nothing;
