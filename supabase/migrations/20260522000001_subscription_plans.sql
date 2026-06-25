-- subscription_plans: the plan catalog the Payments page renders from.
-- This replaces the hardcoded PLANS array in the frontend. Pricing/coverage that
-- a user has actually bought lives in `subscriptions`; this table is the menu.
--
-- ids match subscriptions.plan_type ('annual' | 'five_year' | 'ten_year') so the
-- current plan can be matched directly. Amounts are in cents (smallest unit),
-- consistent with invoices.amount_cents. Stripe price IDs can be added later.

create table subscription_plans (
  id                 text primary key,
  name               text not null,
  price_cents        int  not null check (price_cents >= 0),
  spouse_addon_cents int  not null default 0 check (spouse_addon_cents >= 0),
  period             text not null,                       -- '/year' | 'one-time'
  features           jsonb not null default '[]'::jsonb,  -- array of strings
  sort_order         int  not null default 0,
  is_active          boolean not null default true,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

alter table subscription_plans enable row level security;

-- The catalog is non-sensitive; allow read access. Writes go through the
-- service role (which bypasses RLS), so there is no write policy.
create policy "subscription_plans_select_all" on subscription_plans
  for select using (true);

insert into subscription_plans (id, name, price_cents, spouse_addon_cents, period, features, sort_order) values
  ('annual',    'Annual',  4900,  1900, '/year',    '["Unlimited stories", "Secure vault"]'::jsonb, 1),
  ('five_year', '5-Year',  17900, 4900, 'one-time', '["Unlimited stories", "Secure vault"]'::jsonb, 2),
  ('ten_year',  '10-Year', 29900, 6900, 'one-time', '["Unlimited stories", "Secure vault"]'::jsonb, 3)
on conflict (id) do nothing;
