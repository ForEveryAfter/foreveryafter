# Subscription-lifecycle webhooks → notifications queue

This doc covers the **manual Stripe + Supabase setup** that has to happen alongside the
two migrations (`20260606000001_notifications_queue_extension.sql` and
`20260606000002_email_worker_pg_cron.sql`) and the webhook handler in
`apps/api/src/webhooks/stripe.ts`.

---

## Architecture (one-page summary)

```
Stripe event ─────► POST /webhooks/stripe ─────► INSERT row(s) in `notifications`
                    (signature-verified;          (channel='email' status='pending',
                     express.raw body parser)      and/or channel='in_app' for the
                                                   payment_failed in-app variant)

                                                  pg_cron tick (every minute)
                                                       │
                                                       ▼
                                       send_pending_notification_emails()
                                          ├── claims rows  FOR UPDATE SKIP LOCKED
                                          ├── flips to 'processing'
                                          └── pg_net.http_post → Resend (async)

                                                  pg_cron tick (every minute)
                                                       │
                                                       ▼
                                       reconcile_notification_emails()
                                          └── joins net._http_response → flips
                                              'processing' to 'done' or 'failed'
```

Everything email goes through **Resend**. The webhook **never** sends — it only
enqueues. The pg_cron worker is the single sender.

---

## Part 6 — Stripe dashboard setup (manual)

### 1) Add the webhook endpoint
Stripe Dashboard → **Developers → Webhooks → Add endpoint**:
- URL: `https://YOUR_API_HOST/webhooks/stripe`
- Events to send (these four — nothing else):
  - `invoice.upcoming`
  - `invoice.paid`
  - `invoice.payment_failed`
  - `customer.subscription.deleted`

Copy the **signing secret** (`whsec_…`) and put it in `apps/api/.env` as
`STRIPE_WEBHOOK_SECRET=…`. The handler verifies every payload against this.

### 2) `invoice.upcoming` lead time
Stripe sends one `invoice.upcoming` event before each subscription renewal. The
default lead is ~3 days; the spec wants ~7. **Heads up: the UI for this knob has
moved around — verify what's currently in the Dashboard before assuming.**

- Recent layout: **Settings → Billing → Subscriptions and invoices →** scroll to
  "Upcoming invoice notifications" → set days ahead.
- If you can't find it there, it may now live under
  **Settings → Billing → Email notifications → Upcoming invoice** instead.

If neither shows the knob in your account, that knob is now per-subscription only —
in which case you'd set it on subscription create:
```ts
stripe.subscriptions.create({ ..., billing_cycle_anchor: ..., days_until_due: 7 })
```
For an existing subscription:
```ts
stripe.subscriptions.update(sub_id, { days_until_due: 7 })
```

I didn't code this — the spec said document only, since the Dashboard location may
have changed.

### 3) Turn OFF Stripe's automatic customer emails for these events
This is the **most important** Stripe-side toggle, because Resend is the single
channel. If Stripe is also sending emails for these events, customers get duplicate
messaging.

Stripe Dashboard → **Settings → Billing → Customer emails**:
- **Send emails about failed payments** → turn OFF
- **Send invoices for subscription renewals** → turn OFF
- **Send emails about expiring cards** → leave per your preference (we don't send a
  Resend email for this case)
- **Send finalized invoices and receipts** → turn OFF for subscriptions
  (or leave ON if you specifically want one-off invoice/receipts; not in scope here)

Confirm by inspecting a test renewal: only the Resend email lands.

---

## Part 7 — Verify

### A) Confirm the migrations applied

Run in the Supabase SQL editor:

```sql
-- 1. notifications has the new columns + constraint + indexes.
select column_name, data_type, column_default
  from information_schema.columns
 where table_name = 'notifications'
   and column_name in ('type','channel','recipient_role','subscription_id',
                       'stripe_event_id','status','read_at','payload','error','sent_at')
 order by column_name;

-- expect 10 rows.

select indexname, indexdef
  from pg_indexes
 where tablename = 'notifications'
   and indexname in ('notifications_event_recipient_channel_key',
                     'notifications_email_claim_idx',
                     'notifications_inapp_unread_idx');

-- expect 3 rows.

-- 2. cron jobs registered.
select jobid, jobname, schedule
  from cron.job
 where jobname in ('send-pending-notification-emails',
                   'reconcile-notification-emails');

-- expect 2 rows with '* * * * *'.

-- 3. vault secrets present.
select name from vault.secrets
 where name in ('RESEND_API_KEY','RESEND_EMAIL_FROM','RESEND_EMAIL_FROM_NAME');

-- expect 2 or 3 rows.
```

### B) Smoke-test the worker manually (skip the wait)

```sql
-- Drop a fake pending row and run the send fn synchronously.
insert into notifications (user_id, channel, type, status, payload, title, content)
values (
  'YOUR_PROFILE_UUID',
  'email',
  'subscription_renewed',
  'pending',
  jsonb_build_object(
    'to',      'you@example.com',
    'subject', 'pg_cron smoke test',
    'text',    'It works.',
    'html',    '<p>It works.</p>'
  ),
  'pg_cron smoke test', 'It works.'
);

select public.send_pending_notification_emails();

-- The row should be 'processing' now and a pgnet_request_id stamped in payload.
select id, status, payload->>'pgnet_request_id' as req_id
  from notifications where title = 'pg_cron smoke test';

-- After pg_net's background worker completes the HTTP call (seconds):
select public.reconcile_notification_emails();

select id, status, sent_at, error
  from notifications where title = 'pg_cron smoke test';
-- status 'done' on a successful Resend POST, 'failed' otherwise.
```

### C) Confirm rows land per event type / channel

After a webhook tick (real or via Stripe CLI — see D), eyeball the queue:

```sql
select type, channel, recipient_role, count(*)
  from notifications
 where stripe_event_id is not null
 group by 1,2,3
 order by 1,2,3;
```

Expected after each Stripe event:

| Stripe event | type | channel | recipient_role | rows |
|---|---|---|---|---|
| invoice.upcoming (cycle) | subscription_renewal_upcoming | email | subscription_owner | 1 |
| invoice.paid (cycle) | subscription_renewed | email | subscription_owner | 1 |
| invoice.payment_failed (cycle) | subscription_payment_failed | email | subscription_owner | 1 |
|  |  | email | trusted_representative | 1 |
|  |  | email | guide_owner | 1 if != owner, else 0 |
|  |  | in_app | subscription_owner | 1 |
|  |  | in_app | trusted_representative | 1 |
| customer.subscription.deleted | subscription_expired | email | subscription_owner | 1 |
|  |  | email | trusted_representative | 1 |
|  |  | email | guide_owner | 1 if != owner, else 0 |

(In this codebase `subscription_owner === guide_owner` always, so the `guide_owner`
rows are dedup'd by the existing handler — `1 if != owner` collapses to 0.)

### D) Stripe CLI — local

```bash
# In one terminal, forward signed events from Stripe to the local API:
stripe listen --forward-to localhost:3001/webhooks/stripe

# In another terminal, trigger events:
stripe trigger invoice.upcoming
stripe trigger invoice.payment_failed
stripe trigger customer.subscription.deleted
```

**Caveat: the `billing_reason` filter.** `stripe trigger` fixtures don't always set
`billing_reason='subscription_cycle'`. To reproduce the cycle-renewal path
faithfully, use **Stripe test clocks** instead:

```bash
# Create a test clock at "now":
stripe test_helpers test_clocks create --frozen_time $(date +%s)

# Create a customer + subscription anchored to that clock:
stripe customers create --test-clock <clock_id>
stripe subscriptions create --customer cus_... --items.0.price price_... --test-clock <clock_id>

# Advance the clock past renewal and Stripe will fire the real lifecycle events
# WITH billing_reason='subscription_cycle' set correctly:
stripe test_helpers test_clocks advance <clock_id> --frozen_time $(($(date +%s) + 32*86400))
```

The `stripe listen` terminal will show each forwarded event; the API logs will show
the enqueue happening; the `notifications` table will fill with the right rows.

---

## Operational notes

- **Idempotency**: re-delivered Stripe events never duplicate rows. The webhook catches
  the 23505 unique violation (`UNIQUE (stripe_event_id, user_id, channel)`) silently —
  we treat it as "already enqueued."
- **Worker contention**: `FOR UPDATE SKIP LOCKED` means two `send_pending_notification_emails`
  ticks can run concurrently and each will claim a disjoint set of rows.
- **Privacy carve-out**: only the `subscription_owner` body mentions billing /
  payment-method language. TI + guide_owner copy is neutral and doesn't expose
  financial detail — see [`subscription-notification-templates.ts`](../src/shared/subscription-notification-templates.ts).
- **Rotating the Resend key**: run
  `select vault.update_secret(secret_id, 'NEW_KEY') from vault.secrets where name = 'RESEND_API_KEY';`
  — no code change, no migration, no cron downtime.
