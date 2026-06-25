-- Make Supabase Vault reachable from the API. PostgREST exposes only the `public`
-- schema, so the API can't call `vault.create_secret(...)` directly — the call
-- fails with "Invalid schema: vault". This migration adds a SECURITY DEFINER
-- wrapper in public that the service_role can call via supabase.rpc('vault_store').
--
-- The API uses this from:
--   apps/api/src/utils/encryption.ts → ensureParentPublicKey()
--     (lazy keypair provisioning when a parent saves their first encrypted entry)
--   apps/api/src/identity/routes.ts → /onboard
--     (the original parent-onboarding keypair generation)
--
-- Prereq: the `supabase_vault` extension must be enabled (Studio → Database →
-- Extensions). Without it `vault.create_secret` won't exist and this function
-- will fail at call time with a clear "function vault.create_secret does not
-- exist" — that's the signal to enable Vault.

create or replace function public.vault_store(
  secret text,
  name text,
  description text default ''
)
returns uuid
language plpgsql
security definer
-- search_path forced so the function resolves vault.create_secret even when the
-- caller's search_path doesn't include vault.
set search_path = vault, public
as $$
declare
  v_id uuid;
begin
  -- vault.create_secret returns the new secret's uuid. Argument names vary across
  -- Vault versions; positional binding is portable.
  v_id := vault.create_secret(secret, name, description);
  return v_id;
end;
$$;

-- Lock down: only the service_role (the API's key) should call this. Public /
-- authenticated / anon callers must not be able to mint Vault secrets.
revoke all on function public.vault_store(text, text, text) from public;
grant execute on function public.vault_store(text, text, text) to service_role;

comment on function public.vault_store(text, text, text) is
  'SECURITY DEFINER wrapper around vault.create_secret(). Called by the API to store parent RSA private keys in Vault. Returns the new secret''s uuid.';
