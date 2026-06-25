# Guide release flow

Two triggers, ONE execution path:
- **Automated**: check-in monitor → `POST /release/internal/execute-due` (secret-guarded) → scans for `release_events.status='pending'` with `executes_at <= now()` → calls `executeRelease`.
- **Manual**: trusted representative → 3-step UI → `POST /release/:guideId` → either calls `executeRelease` immediately (`RELEASE_HOLD_HOURS=0`) OR creates a `pending` event for the monitor to pick up.

Both routes funnel through [`executeRelease(guideId, reason, triggeredByProfileId)`](../src/release/core.ts). No release logic lives anywhere else.

## Tunables (env)
| Var | Default | Notes |
|---|---|---|
| `RELEASE_HOLD_HOURS` | `0` | Hours request sits in `release_pending` before executing. 0 = immediate. |
| `REFUND_MIN_REMAINING_DAYS` | `30` | If more days remain on the prepaid term than this, prorated refund. |
| `STRIPE_STORAGE_PRICE_ID` | unset | If unset, `executeRelease` creates the Price on first use and logs the id so you can paste it into `.env`. |
| `CHECKIN_MONITOR_SECRET` | unset | Required for `POST /release/internal/execute-due`. When unset, the endpoint refuses every call (401). |

## Verification SQL

### 1. Migration applied
```sql
-- Guide release-state columns:
select column_name from information_schema.columns
 where table_name = 'guides'
   and column_name in ('release_status','release_reason','release_requested_at','release_executes_at','released_by_profile_id');
-- expect 5 rows.

-- release_events shape:
select column_name from information_schema.columns
 where table_name = 'release_events'
 order by ordinal_position;
-- expect: id, guide_id, reason, requested_by_profile_id, status, requested_at,
--         executes_at, executed_at, canceled_at, canceled_by_profile_id, refund_id, notes, created_at.

-- Storage plan added:
select id, name, price_cents, period from subscription_plans where id = 'storage';
-- expect one row: storage / Storage / 500 / /year.

-- Partial unique blocks a 2nd non-canceled event per guide:
select indexname, indexdef from pg_indexes
 where tablename = 'release_events' and indexname = 'release_events_one_active';
-- expect a unique partial index on (guide_id) where status in ('pending','executed').
```

### 2. Demonstrate the partial-unique block
```sql
-- Pick any guide.
\set guide_id '''YOUR_GUIDE_UUID'''

-- First insert succeeds:
insert into release_events (guide_id, reason, status, requested_at, executes_at)
values (:guide_id, 'manual_trusted_rep', 'pending', now(), now() + interval '24 hours')
returning id;

-- Second insert (without canceling the first) fails with 23505:
insert into release_events (guide_id, reason, status, requested_at, executes_at)
values (:guide_id, 'manual_trusted_rep', 'pending', now(), now() + interval '24 hours');
-- ERROR: duplicate key value violates unique constraint "release_events_one_active"

-- Cancel the first; a new insert is now allowed:
update release_events set status='canceled', canceled_at=now()
 where guide_id = :guide_id and status='pending';
insert into release_events (guide_id, reason, status, requested_at, executes_at)
values (:guide_id, 'manual_trusted_rep', 'pending', now(), now() + interval '24 hours');
-- OK.

-- Cleanup:
delete from release_events where guide_id = :guide_id and reason='manual_trusted_rep' and status in ('pending','canceled');
```

### 3. Sample release flips status, writes one event, enqueues the right rows
```sql
-- Before:
select id, release_status, released_at from guides where id = :guide_id;
select count(*) from release_events where guide_id = :guide_id;
select count(*) from notifications where stripe_event_id like 'release:%';

-- Manually run executeRelease via the API (in another terminal):
--   curl -X POST -H 'x-monitor-secret: $CHECKIN_MONITOR_SECRET' \
--     http://localhost:3001/release/internal/execute-due
-- (or POST /release/:guideId from an authenticated TR session)

-- After:
select id, release_status, released_at, released_by_profile_id from guides where id = :guide_id;
-- expect: release_status='released', released_at not null.

select id, status, executed_at, refund_id from release_events where guide_id = :guide_id;
-- expect exactly ONE row with status='executed'.

select type, channel, recipient_role, count(*) from notifications
 where stripe_event_id like 'release:%' group by 1,2,3 order by 1,2,3;
-- expect:
--   release_executed_recipient   | email   | trusted_representative | N (one per recipient)
--   release_executed_recipient   | in_app  | trusted_representative | N
--   release_executed_other_rep   | email   | trusted_representative | N-1 (excludes trigger)
--   release_executed_other_rep   | in_app  | trusted_representative | N-1
--   release_executed_owner       | email   | subscription_owner     | 1
```

### 4. Idempotency — calling executeRelease twice
```sql
-- Snapshot:
select count(*) as ev_before from release_events where guide_id = :guide_id;
select refund_id    as refund_before from release_events where guide_id = :guide_id and status='executed';
select count(*) as notif_before from notifications where stripe_event_id like 'release:%';
```

Re-hit `POST /release/internal/execute-due` (idempotency runs through the same
path as a real second delivery). Then:

```sql
select count(*) as ev_after from release_events where guide_id = :guide_id;
-- ev_after == ev_before. No new release_event row created.

select refund_id as refund_after from release_events where guide_id = :guide_id and status='executed';
-- refund_after == refund_before. No second refund.

select count(*) as notif_after from notifications where stripe_event_id like 'release:%';
-- notif_after == notif_before. The notifications UNIQUE on
-- (stripe_event_id, user_id, channel) — with synthetic ids 'release:{evt_id}:{role}'
-- — guarantees no duplicates.
```

## Operational notes
- **The monitor endpoint is not session-authed.** It's guarded by `X-Monitor-Secret`. Pick a long random value, store it in your check-in worker's config and in `apps/api/.env`. When unset on the server, the endpoint 401s every call.
- **Stripe storage Price**: first release on an environment without `STRIPE_STORAGE_PRICE_ID` creates the Price via API and logs the id (`[release] Created Stripe storage Price price_XXX. Set STRIPE_STORAGE_PRICE_ID=price_XXX in apps/api/.env to reuse it.`). Paste it into `.env` to avoid creating multiple Stripe Prices over time.
- **Partial-failure resilience**: `executeRelease` flips DB state first (guide + event), then runs billing transitions, then enqueues notifications. A Stripe transient failure leaves the release executed and the refund_id null — a later monitor tick will retry the refund step via re-entry into `executeRelease` (which is safe because the refund check is gated on `release_events.refund_id IS NULL`).
- **`letters_to_loved_ones` + `messages` delivery** is marked as a TODO in `release/core.ts`. The tables exist; the per-recipient delivery wiring is non-trivial and not specced in detail. Recipients still get email + in-app notifications that the guide is available.
