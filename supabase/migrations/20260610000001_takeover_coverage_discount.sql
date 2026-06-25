-- Payment takeover: capture the spouse-coverage choice and any discount code the
-- requester applied at the picker step. Both follow the same convention as
-- chosen_plan_type (see 20260610000000_takeover_chosen_plan.sql):
--
--   chosen_coverage      NULL = inherit parent's current sub coverage (no change).
--                        Set  = at effective_at, the parent's sub coverage is updated
--                               (e.g. 'single' → 'both' adds the spouse add-on). When
--                               the parent's CURRENT coverage is 'both', the picker
--                               locks the toggle on — so chosen_coverage will be 'both'
--                               but it's a no-op switch.
--
--   applied_discount_code NULL = no code applied. Set = the literal code string the
--                                requester typed. The validation happened at request
--                                time (POST /payment-transfers/checkout → POST
--                                /billing/validate-code internally); we store the
--                                STRING (not the discount_codes.id) because the
--                                discount may expire / be deleted before approval,
--                                and we want to remember what the child intended.
--                                Re-validation happens at apply time (next-renewal).
--
-- Both apply only when the corresponding takeover row is approved AND the
-- next-renewal pipeline is wired (see TODO(takeover-renewal-plan-switch) in
-- apps/api/src/payment-transfers/routes.ts).
alter table public.payment_transfer_requests
  add column if not exists chosen_coverage text
    check (chosen_coverage in ('single','both')),
  add column if not exists applied_discount_code text;

comment on column public.payment_transfer_requests.chosen_coverage is
  'Spouse-coverage choice at takeover. NULL = inherit current; ''both''/''single'' = override at effective_at.';
comment on column public.payment_transfer_requests.applied_discount_code is
  'Discount code the requester applied at the takeover picker, stored verbatim. Re-validated when applied at next renewal (the code may have expired by then).';
