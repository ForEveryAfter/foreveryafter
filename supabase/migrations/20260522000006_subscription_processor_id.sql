-- Link our subscription row to the Stripe subscription so the webhook can find it
-- on renewal/cancel events (invoice.paid, customer.subscription.*). One-time plans
-- leave this null.
alter table subscriptions add column if not exists processor_subscription_id text;
create unique index if not exists subscriptions_processor_subscription_id_key
  on subscriptions (processor_subscription_id)
  where processor_subscription_id is not null;
