-- Billing schema split into three concerns:
--   subscriptions = WHAT was purchased (plan, coverage, active window)
--   payments      = HOW it is paid (the processor customer + payment method on file)
--   invoices      = each CHARGE / ledger entry (amount, when, status, discount, trace IDs)
--
-- Relationships:
--   subscriptions --< payments        a subscription has payment method(s) on file
--   subscriptions  >- payments        current_payment_id = the active method
--   subscriptions --< invoices        a subscription accrues invoices
--   invoices       >- discount_codes  code applied at purchase, if any

-- ═══════════════════════════════════════════════════════
-- payments: how a subscription is paid — processor customer + payment method on file
-- ═══════════════════════════════════════════════════════
create table payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  -- processor-agnostic identifiers (Stripe today: customer = cus_..., payment method = pm_...)
  processor_customer_id text,
  processor_payment_method text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index payments_subscription_id_idx on payments (subscription_id);

alter table payments enable row level security;

-- Owners may read their own payment methods (scoped through the subscription).
-- Writes go only through the service role (server / processor webhooks), which bypasses RLS.
create policy "payments_select_own" on payments
  for select using (
    exists (
      select 1 from subscriptions
      where subscriptions.id = payments.subscription_id
        and subscriptions.user_id = auth.uid()
    )
  );

-- ═══════════════════════════════════════════════════════
-- invoices: one row per charge (amount, when, status, discount, processor trace IDs)
-- ═══════════════════════════════════════════════════════
create table invoices (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions(id) on delete restrict,
  -- which payment method on file was charged for this invoice
  payment_id uuid references payments(id) on delete set null,
  -- discount code applied at purchase, if any (kept even if the code is later removed)
  discount_code_id uuid references discount_codes(id) on delete set null,

  -- amount actually charged, in the smallest currency unit (processor-native). $228.00 -> 22800.
  amount_cents int not null check (amount_cents >= 0),
  currency text not null default 'usd',

  status text not null default 'succeeded'
    check (status in ('pending', 'succeeded', 'failed', 'refunded', 'disputed')),
  -- when funds actually changed hands; null while pending
  paid_at timestamptz,

  -- processor identifiers for dispute resolution & settlement reconciliation:
  --   payment_intent      (pi_...)  the payment attempt
  --   charge              (ch_...)  what a dispute attaches to
  --   balance_transaction (txn_...) the settlement record
  -- (the paying account lives on payments.processor_customer_id)
  processor_payment_intent_id text,
  processor_charge_id text,
  processor_balance_transaction_id text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index invoices_subscription_id_idx on invoices (subscription_id);
create index invoices_payment_id_idx on invoices (payment_id);
create index invoices_processor_charge_id_idx on invoices (processor_charge_id);
-- one ledger row per processor payment intent (guards against duplicate webhook inserts)
create unique index invoices_processor_payment_intent_id_key
  on invoices (processor_payment_intent_id)
  where processor_payment_intent_id is not null;

alter table invoices enable row level security;

create policy "invoices_select_own" on invoices
  for select using (
    exists (
      select 1 from subscriptions
      where subscriptions.id = invoices.subscription_id
        and subscriptions.user_id = auth.uid()
    )
  );

-- ═══════════════════════════════════════════════════════
-- subscriptions: add coverage, active window, current payment-method link
-- (plan_type stays the source of truth for duration: annual/five_year/ten_year/archive)
-- ═══════════════════════════════════════════════════════
alter table subscriptions
  add column coverage text not null default 'single'
    check (coverage in ('single', 'both')),
  add column activated_at timestamptz,
  add column expires_at timestamptz,
  add column current_payment_id uuid references payments(id) on delete set null;
