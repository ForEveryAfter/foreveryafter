// Per-PACKAGE crypto. Distinct from utils/encryption.ts which is per-FIELD AES-CBC
// for sensitive_entries. Here we wrap the whole release ZIP as one AES-256-GCM
// blob, with the AES key RSA-wrapped by the parent's existing public key. There
// are NO new managed keys: unwrap at download time via the parent's RSA private
// key (Vault).

import {
  randomBytes,
  publicEncrypt,
  privateDecrypt,
  createCipheriv,
  createDecipheriv,
  constants,
  type CipherGCM,
  type DecipherGCM,
} from 'crypto';

// GCM standard IV is 96 bits (12 bytes). Tag is 128 bits (16 bytes).
const GCM_IV_BYTES = 12;
const AES_KEY_BYTES = 32; // AES-256

export interface PackageKeyMaterial {
  aesKey: Buffer;   // 32 bytes — random per package, zeroed after use
  iv: Buffer;       // 12 bytes — random per package
}

export function generatePackageKey(): PackageKeyMaterial {
  return {
    aesKey: randomBytes(AES_KEY_BYTES),
    iv: randomBytes(GCM_IV_BYTES),
  };
}

// Wrap the per-package AES key with the parent's RSA public key. Returned as
// base64 for DB storage (parallels the existing utils/encryption.ts pattern).
export function wrapAesKey(aesKey: Buffer, parentRsaPublicKeyPem: string): string {
  const wrapped = publicEncrypt(
    { key: parentRsaPublicKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING },
    aesKey
  );
  return wrapped.toString('base64');
}

// Unwrap on download using the parent's RSA private key (Vault).
export function unwrapAesKey(
  wrappedBase64: string,
  parentRsaPrivateKeyPem: string
): Buffer {
  return privateDecrypt(
    { key: parentRsaPrivateKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING },
    Buffer.from(wrappedBase64, 'base64')
  );
}

// Transform stream that encrypts the ZIP bytes. Auth tag is available via
// cipher.getAuthTag() AFTER cipher.final() — typically inside a 'finish'/'end'
// handler. Caller stores the tag alongside the package row.
export function createPackageEncryptStream(key: PackageKeyMaterial): CipherGCM {
  return createCipheriv('aes-256-gcm', key.aesKey, key.iv) as CipherGCM;
}

// Transform stream that decrypts. Caller MUST call setAuthTag(tag) BEFORE any
// data is read; GCM verifies on .final(). If the tag is wrong / data is
// tampered, the stream emits an error and the response should be aborted.
export function createPackageDecryptStream(
  key: PackageKeyMaterial,
  authTag: Buffer
): DecipherGCM {
  const d = createDecipheriv('aes-256-gcm', key.aesKey, key.iv) as DecipherGCM;
  d.setAuthTag(authTag);
  return d;
}
