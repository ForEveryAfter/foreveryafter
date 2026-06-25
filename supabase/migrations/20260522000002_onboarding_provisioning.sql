-- Onboarding & provisioning support.
--
-- 1) Decouple profiles from Supabase Auth so passport OAuth users can be created
--    directly (generated user_id + guid). Login is passport-based; we are not
--    using Supabase Auth, so the auth.users FK no longer fits. Harold's existing
--    row references a real auth.users id and is unaffected by dropping the FK.
-- 2) Add fields the signup flow captures (profiles.phone, family_members.phone,
--    subscriptions.billing_owner).
-- 3) Mark the established user (Harold) onboarding-complete so the new flag-gated
--    routing sends him to the dashboard rather than back through signup.

-- ── 1) drop profiles.user_id -> auth.users FK; let user_id self-generate ──
do $$
declare c text;
begin
  select conname into c
    from pg_constraint
   where conrelid = 'public.profiles'::regclass
     and contype = 'f'
     and conkey = (
       select array_agg(attnum)
         from pg_attribute
        where attrelid = 'public.profiles'::regclass and attname = 'user_id'
     );
  if c is not null then execute format('alter table profiles drop constraint %I', c); end if;
end $$;

alter table profiles alter column user_id set default gen_random_uuid();

-- ── 2) fields captured during signup ──
alter table profiles       add column if not exists phone text;
alter table family_members add column if not exists phone text;
alter table subscriptions  add column if not exists billing_owner text not null default 'self'
  check (billing_owner in ('self', 'child'));

-- ── 3) the established user is already set up ──
update profiles
   set onboarding_completed_at = coalesce(onboarding_completed_at, now())
 where user_id = '2891f294-80ea-439a-bb4d-8f00adb05252';
