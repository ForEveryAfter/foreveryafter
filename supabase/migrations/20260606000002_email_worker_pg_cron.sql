-- pg_cron email worker — HYBRID design (revised from the in-SQL version).
--
-- pg_cron is the scheduler; pg_net is the trigger; the WORK happens in the API
-- (POST /workers/drain-emails), where RESEND_API_KEY already lives in .env. The
-- only thing Postgres needs to know is WHERE to call (URL) and how to prove it's
-- legit (shared secret). Both live in Supabase Vault so they can rotate without
-- a migration.
--
-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  TODO(email-worker-config): NOT YET CONFIGURED — pg_cron will silently no-op║
-- ║  until BOTH of these are set:                                                ║
-- ║                                                                              ║
-- ║    1) Vault secrets WORKER_API_URL + WORKER_SECRET (see SQL below).         ║
-- ║    2) WORKER_SECRET in apps/api/.env matching the Vault value.              ║
-- ║                                                                              ║
-- ║  Until then, queued email notifications accumulate in the `notifications`   ║
-- ║  table with status='pending' and never go out. Direct sendEmail() calls     ║
-- ║  from Node code (TI invite, takeover request, condolence-from-packaging,    ║
-- ║  etc.) are UNAFFECTED — they bypass the queue entirely and use Resend       ║
-- ║  straight from .env.                                                         ║
-- ║                                                                              ║
-- ║  Path forward when ready to deploy: pick a real API URL (prod) or an ngrok  ║
-- ║  tunnel (dev), then run the vault.create_secret() calls below.              ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝
--
-- PREREQUISITES (run these once via the Supabase Studio Database → Extensions
-- UI; extension installs need admin privileges and can't go in a migration):
--   - pg_net      (HTTP from Postgres)
--   - pg_cron     (cron-style scheduling)
--   - pgsodium    (used by Vault — usually already enabled)
--
-- THEN store the worker URL + secret in Vault (run once in the SQL editor):
--   select vault.create_secret('https://YOUR_API_HOST',  'WORKER_API_URL');
--   select vault.create_secret('<long random string>',   'WORKER_SECRET');
-- The API reads the same secret from process.env.WORKER_SECRET in apps/api/.env;
-- the values MUST match.

-- ────────────────────────────────────────────────────────────────────────────────
-- 1) TRIGGER — fires every minute, POSTs to the API with the shared secret.
--    The API decides what to drain and reports a count. pg_net is async; the
--    response lands in net._http_response and we don't need to read it (the API
--    is authoritative).
-- ────────────────────────────────────────────────────────────────────────────────
create or replace function public.trigger_email_worker()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'WORKER_API_URL' limit 1;
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'WORKER_SECRET' limit 1;

  if v_url is null or v_secret is null then
    raise notice 'trigger_email_worker: WORKER_API_URL / WORKER_SECRET not set in vault';
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/workers/drain-emails',
    headers := jsonb_build_object(
      'x-worker-secret', v_secret,
      'Content-Type',    'application/json'
    ),
    body    := '{}'::jsonb
  );
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────────
-- 2) SCHEDULE — every minute. cron.schedule is idempotent on job name so re-runs
--    of this migration are safe.
-- ────────────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'trigger-email-worker',
      '* * * * *',
      $cron$ select public.trigger_email_worker(); $cron$
    );
  else
    raise notice 'pg_cron not installed — schedule trigger_email_worker manually after enabling the extension';
  end if;
end $$;
