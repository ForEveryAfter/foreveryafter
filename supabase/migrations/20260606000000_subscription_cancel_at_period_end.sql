-- Owner-initiated cancellation: the subscription stays 'active' through the current
-- paid term and just stops auto-renewing. When the term ends, the renewal webhook
-- transitions status to 'canceled' and a downstream job (deferred) deletes the
-- guide's data. true = scheduled to lapse at expires_at.
alter table subscriptions
  add column if not exists cancel_at_period_end boolean default false;
