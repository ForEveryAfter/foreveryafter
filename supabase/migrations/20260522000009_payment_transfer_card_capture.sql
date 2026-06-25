-- Capture the requester's card UP FRONT (at request time), not after approval. The
-- request sits 'pending' with the card held; approval promotes the card to be used at
-- the guide's next renewal; rejection/cancel deactivates it (detached in Stripe).
--
-- payment_state: 'captured' (held, awaiting decision) → 'active' (approved; used next
-- renewal) | 'deactivated' (declined/cancelled; card detached, never charged).
alter table payment_transfer_requests
  add column if not exists processor_customer_id text,
  add column if not exists processor_payment_method text,
  add column if not exists card_brand text,
  add column if not exists card_last4 text,
  add column if not exists payment_state text
    check (payment_state in ('captured', 'active', 'deactivated'));
