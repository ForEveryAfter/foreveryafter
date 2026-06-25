-- Extend the existing `notifications` table to serve as BOTH the in-app feed AND the
-- email work queue (replacing the planned separate `notifications_queue` table). Legacy
-- rows (user_id/title/content/is_read) stay valid; new code writes the richer columns.
--
-- Column mapping vs the original spec:
--   recipient_profile_id  ->  user_id   (kept the existing column name; same meaning)
--   read_at               ->  added (separate from legacy is_read; both populated for in_app)
--
-- The new richer columns are nullable so the existing `notify(userId, title, content)`
-- helper and every route that reads `title`/`content`/`is_read` keep working unchanged.

alter table notifications
  add column if not exists type text,
  add column if not exists channel text default 'in_app'
    check (channel in ('email', 'in_app')),
  add column if not exists recipient_role text
    check (recipient_role in ('subscription_owner', 'guide_owner', 'trusted_representative')),
  add column if not exists subscription_id text,
  add column if not exists stripe_event_id text,
  add column if not exists status text default 'pending'
    check (status in ('pending', 'processing', 'done', 'failed')),
  add column if not exists read_at timestamptz,
  add column if not exists payload jsonb,
  add column if not exists error text,
  add column if not exists sent_at timestamptz;

-- Backfill: every existing row was an in-app notification. is_read=true → use created_at
-- as the read timestamp (we don't have the actual read time historically).
update notifications
  set channel = coalesce(channel, 'in_app'),
      read_at = case when is_read = true and read_at is null then created_at else read_at end
  where channel is null or (is_read = true and read_at is null);

-- IDEMPOTENCY: one email + one in_app per (stripe_event_id, recipient, channel). Partial
-- index so legacy rows with NULL stripe_event_id don't conflict with each other.
create unique index if not exists notifications_event_recipient_channel_key
  on notifications (stripe_event_id, user_id, channel)
  where stripe_event_id is not null;

-- WORKER CLAIM PATH: pending email rows, oldest first. Partial index keeps it small
-- because the vast majority of rows are in-app.
create index if not exists notifications_email_claim_idx
  on notifications (created_at)
  where channel = 'email' and status = 'pending';

-- IN-APP FETCH PATH: a user's unread in-app rows, newest first. Partial on unread.
create index if not exists notifications_inapp_unread_idx
  on notifications (user_id, created_at desc)
  where channel = 'in_app' and read_at is null;
