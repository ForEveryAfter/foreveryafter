import {
  publicEncrypt,
  privateDecrypt,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  generateKeyPairSync,
  constants
} from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';

// ─── ENCRYPT (used for write) ─────────────────

export function hybridEncrypt(
  plaintext: Buffer,
  rsaPublicKeyPem: string
): {
  encryptedData: string      // base64
  encryptedAesKey: string    // base64
} {
  // 1. Generate random AES-256 session key
  const aesKey = randomBytes(32);  // 256 bits
  const iv = randomBytes(16);       // 128 bit IV

  // 2. Encrypt the payload with AES-256-CBC
  const cipher = createCipheriv('aes-256-cbc', aesKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext),
    cipher.final()
  ]);

  // Prepend IV to encrypted data
  const encryptedWithIv = Buffer.concat([iv, encrypted]);

  // 3. Encrypt the AES key with RSA public key
  const encryptedAesKey = publicEncrypt(
    {
      key: rsaPublicKeyPem,
      padding: constants.RSA_PKCS1_OAEP_PADDING
    },
    aesKey
  );

  // 4. Discard aesKey from memory
  aesKey.fill(0);

  return {
    encryptedData: encryptedWithIv.toString('base64'),
    encryptedAesKey: encryptedAesKey.toString('base64')
  };
}

// ─── DECRYPT (release-time only) ──────────────
// Inverse of hybridEncrypt: unwrap AES key with RSA private key, then AES-256-CBC
// decrypt with IV from first 16 bytes of encryptedData.
export function hybridDecrypt(
  encryptedData: string,    // base64
  encryptedAesKey: string,  // base64
  rsaPrivateKeyPem: string
): Buffer {
  // 1. Unwrap the AES key.
  const aesKey = privateDecrypt(
    {
      key: rsaPrivateKeyPem,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
    },
    Buffer.from(encryptedAesKey, 'base64')
  );

  // 2. Split IV (first 16 bytes) and ciphertext.
  const blob = Buffer.from(encryptedData, 'base64');
  if (blob.length < 16) {
    aesKey.fill(0);
    throw new Error('hybridDecrypt: payload too short to contain IV');
  }
  const iv = blob.subarray(0, 16);
  const ciphertext = blob.subarray(16);

  // 3. AES-256-CBC decrypt.
  const decipher = createDecipheriv('aes-256-cbc', aesKey, iv);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  // 4. Zero the AES key.
  aesKey.fill(0);
  return plaintext;
}

// ─── FETCH PARENT PUBLIC KEY ──────────────────

export async function getParentPublicKey(
  parentGuid: string,
  supabase: SupabaseClient
): Promise<string> {
  const { data, error } = await supabase
    .from('parent_keys')
    .select('public_key')
    .eq('parent_guid', parentGuid)
    .single();

  if (error || !data) {
    throw new Error(`No public key found for parent ${parentGuid}`);
  }

  return data.public_key;
}

// ─── ENSURE PARENT PUBLIC KEY (lazy create) ────────
// Returns the parent's RSA public key. If none exists yet, generates a fresh
// 2048-bit keypair, stores the private key in Supabase Vault, and writes the
// public key + vault_key_id to parent_keys. Idempotent — calling twice in
// parallel may race (Vault store is not transactional with the parent_keys
// insert), so the second caller will read the now-existing row on retry.
//
// This exists because users created before identity/onboard was wired (or who
// somehow skipped that step) end up without a keypair, and every encrypted
// path — Accounts entry save, document upload, etc. — would otherwise hard-fail
// with "Encryption key not found for this account".
export async function ensureParentPublicKey(
  parentGuid: string,
  supabase: SupabaseClient
): Promise<string> {
  // Fast path: existing row.
  const { data: existing } = await supabase
    .from('parent_keys')
    .select('public_key')
    .eq('parent_guid', parentGuid)
    .maybeSingle();
  if (existing?.public_key) return existing.public_key;

  // Generate a 2048-bit RSA keypair in PEM format (same shape identity/onboard uses).
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  // Store private key in Vault via the public.vault_store RPC wrapper
  // (migration 20260611000001_vault_store_rpc.sql). PostgREST exposes only the
  // public schema, so we cannot reach vault.create_secret directly — the wrapper
  // is required. If the RPC errors with "function vault.create_secret does not
  // exist", the supabase_vault extension isn't enabled; enable it in Studio.
  const { data: rpcData, error: rpcErr } = await supabase.rpc('vault_store', {
    secret: privateKey,
    name: `parent_private_key_${parentGuid}`,
    description: `RSA private key for parent ${parentGuid}`,
  });
  if (rpcErr) {
    throw new Error(`Vault store failed for parent ${parentGuid}: ${rpcErr.message}`);
  }
  const vaultKeyId = typeof rpcData === 'string' ? rpcData : (rpcData as any)?.id;
  if (!vaultKeyId) {
    throw new Error(`Vault store returned no id for parent ${parentGuid}`);
  }

  // Persist parent_keys. If a concurrent caller already inserted, prefer the
  // existing row (the Vault secret we just wrote becomes orphaned — acceptable
  // for the rare race; the keypair we generated is also wiped from memory below).
  const { error: insertErr } = await supabase
    .from('parent_keys')
    .insert({ parent_guid: parentGuid, public_key: publicKey, vault_key_id: vaultKeyId });
  if (insertErr) {
    const { data: maybe } = await supabase
      .from('parent_keys')
      .select('public_key')
      .eq('parent_guid', parentGuid)
      .maybeSingle();
    if (maybe?.public_key) return maybe.public_key;
    throw new Error(`Failed to persist parent_keys for ${parentGuid}: ${insertErr.message}`);
  }
  return publicKey;
}

// ─── FETCH PARENT PRIVATE KEY (Vault) ────────────
// Private key lives in Supabase Vault. parent_keys.vault_key_id is the lookup id —
// returns the PEM string from vault.decrypted_secrets. Service-role only; never
// surface this to the client (or even log it).
export async function getParentPrivateKey(
  parentGuid: string,
  supabase: SupabaseClient
): Promise<string> {
  const { data: row, error } = await supabase
    .from('parent_keys')
    .select('vault_key_id')
    .eq('parent_guid', parentGuid)
    .single();
  if (error || !row?.vault_key_id) {
    throw new Error(`No vault_key_id for parent ${parentGuid}`);
  }
  // Vault decrypted_secrets is exposed as a view to the service role.
  const { data: secret, error: vErr } = await supabase
    .schema('vault')
    .from('decrypted_secrets')
    .select('decrypted_secret')
    .eq('id', row.vault_key_id)
    .single();
  if (vErr || !secret?.decrypted_secret) {
    throw new Error(`Vault secret ${row.vault_key_id} not retrievable for parent ${parentGuid}`);
  }
  return secret.decrypted_secret as string;
}
