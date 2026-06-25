-- Payment takeover: capture the plan the requester chose during the takeover step.
--
-- Today the takeover flow only changes WHO PAYS — the parent's plan is unchanged.
-- The UI on /dashboard/child/overview now opens a plan picker before the Stripe
-- card-capture step (mirrors the Plan Options grid on /dashboard/payments) so the
-- child sees the parent's current plan + next billing date and can also change the
-- plan terms (e.g. "Annual" → "5-year") as part of taking over.
--
-- NULL = inherit the parent's current plan (no terms change; just the payer/card).
-- Set  = at the parent's effective_at (= sub.expires_at), the parent's subscription
--        switches to this plan and bills the new payer's card at the new price.
--
-- The actual Stripe-side plan-switch on renewal is wired alongside the
-- "use child's card at renewal" pipeline (both depend on the same renewal webhook
-- plumbing — see TODO(takeover-renewal-plan-switch) in apps/api).
--
-- We constrain to the same set of plan ids subscriptions.plan_type uses so a typo
-- can't be persisted; the canonical source is the subscription_plans table but a
-- subset-check here is cheaper than a real FK + still catches the common bug.
alter table public.payment_transfer_requests
  add column if not exists chosen_plan_type text
    check (chosen_plan_type in ('annual','five_year','ten_year','archive'));

comment on column public.payment_transfer_requests.chosen_plan_type is
  'Plan the requester picked when requesting takeover. NULL = inherit parent''s current plan. When set, at effective_at the parent''s subscription is switched to this plan and billed against the new payer''s card.';
