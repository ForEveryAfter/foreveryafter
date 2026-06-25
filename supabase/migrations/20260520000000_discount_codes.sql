-- Discount codes table for pricing pages.
-- Supports fixed dollar amount or percentage discounts.

create table discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null check (discount_type in ('fixed', 'percentage')),
  discount_value numeric not null check (discount_value > 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  max_uses int,
  current_uses int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table discount_codes enable row level security;

-- Public can validate codes (read-only, active only)
create policy "discount_codes_select_active" on discount_codes
  for select using (status = 'active');

-- Seed some test codes
insert into discount_codes (code, discount_type, discount_value, status, starts_at, expires_at) values
  ('LEGACY20', 'fixed', 20, 'active', now(), now() + interval '1 year'),
  ('FAMILY100', 'percentage', 100, 'active', now(), now() + interval '6 months'),
  ('SAVE50', 'percentage', 50, 'active', now(), now() + interval '1 year'),
  ('EXPIRED10', 'fixed', 10, 'active', '2025-01-01', '2025-12-31');
