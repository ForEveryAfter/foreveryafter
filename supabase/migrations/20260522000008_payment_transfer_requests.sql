-- Payment takeover: a linked child (or trusted individual) asks to become the payer
-- for a parent's guide. The guide OWNER and the primary TRUSTED INDIVIDUAL are both
-- notified; EITHER may approve. On approval the switch is scheduled for the guide's
-- next renewal (effective_at) — no mid-term refund, no overlap charge. The requester
-- then puts a card on file; billing_owner flips to them at effective_at.
--
-- subscriptions.billing_owner is the existing source of truth for WHO pays
-- ('self' = the guide owner; otherwise the payer's profiles.user_id).

create table payment_transfer_requests (
  id uuid primary key default gen_random_uuid(),

  -- the guide whose ongoing payments are being taken over
  guide_id uuid not null references guides(id) on delete cascade,

  -- who asked to become the payer (profiles.user_id; loose ref, matching the codebase)
  requester_user_id uuid not null,

  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined', 'cancelled', 'completed')),

  -- when billing actually switches to the requester (set on approval = the guide
  -- owner's subscription renewal date; null until approved)
  effective_at timestamptz,

  -- who acted on the request (owner or TI; profiles.user_id)
  decided_by_user_id uuid,

  created_at timestamptz default now(),
  decided_at timestamptz,
  completed_at timestamptz
);

create index payment_transfer_requests_guide_id_idx on payment_transfer_requests (guide_id);
create index payment_transfer_requests_requester_idx on payment_transfer_requests (requester_user_id);
create index payment_transfer_requests_status_idx on payment_transfer_requests (status);

-- At most one in-flight request per (guide, requester): prevents duplicate asks while
-- one is still pending or approved-but-not-yet-switched.
create unique index payment_transfer_requests_one_inflight
  on payment_transfer_requests (guide_id, requester_user_id)
  where status in ('pending', 'approved');

alter table payment_transfer_requests enable row level security;

-- The requester may read their own requests. Owner/TI reads + all writes go through
-- the service role (the API), which bypasses RLS — same pattern as payments/invoices.
create policy "ptr_select_own" on payment_transfer_requests
  for select using (requester_user_id = auth.uid());
