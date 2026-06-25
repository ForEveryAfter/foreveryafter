-- Per-recipient encrypted package the recipient downloads after the release executes.
-- One row per (release_event, recipient). The row id is also the S3/R2 object key —
-- never email-derived or sequential. Plaintext content lives nowhere; the ciphertext
-- sits in S3 and the wrap material (RSA-wrapped per-package AES key + IV + GCM tag)
-- lives here. Useless without the parent's RSA private key in Vault.

create table release_packages (
  -- Also the storage object key (so a guessed/leaked id never decrypts).
  id uuid primary key default gen_random_uuid(),

  release_event_id uuid not null references release_events(id) on delete cascade,
  -- Loose ref to profiles.user_id, matching the codebase's pattern (the strict FK
  -- was dropped from profiles itself in an earlier migration).
  recipient_profile_id uuid not null,

  -- Where the AES-256-GCM ciphertext is stored (mirrors id, but kept as its own
  -- column so the storage layout can change without renaming primary keys).
  r2_object_key text not null,

  -- Hybrid wrap. Per spec: there are NO new managed/Vault keys. The per-package
  -- AES key is random; we RSA-wrap it with the parent's existing public key. On
  -- download we unwrap with the parent's private key from Vault, then stream-
  -- decrypt. Stored as base64 text (matches utils/encryption.ts pattern).
  wrapped_aes_key text not null,
  aes_iv          text not null,
  gcm_tag         text not null,

  byte_size bigint not null default 0,

  -- One 6-digit code per package. We store ONLY a salted SHA-256 hash. The raw
  -- code is delivered out-of-band by SMS and never logged or persisted.
  otp_hash text not null,
  otp_attempts int not null default 0,
  otp_locked_until timestamptz,

  -- 'available' until the first successful download flips it to 'downloaded' (but
  -- re-download stays allowed — recipients lose files; we just re-gate the OTP).
  status text not null default 'available'
    check (status in ('available', 'downloaded')),

  -- Post-MVP cold-storage hook. MVP code never sets this off 'standard'; the download
  -- route returns a "package is being retrieved, you'll be notified when ready"
  -- response if it ever sees anything else. Live cold-tier migration is a future job.
  storage_tier text not null default 'standard'
    check (storage_tier in ('standard', 'cold', 'restoring')),

  first_downloaded_at timestamptz,
  created_at timestamptz not null default now(),

  -- IDEMPOTENCY: at most one package per (release_event, recipient). Calling the
  -- packaging step twice on the same release produces zero duplicates.
  unique (release_event_id, recipient_profile_id)
);

create index release_packages_recipient_idx on release_packages (recipient_profile_id);
create index release_packages_event_idx on release_packages (release_event_id);

alter table release_packages enable row level security;
-- Server-only access (service role bypasses RLS) — matches the other server-owned
-- tables in this codebase.
