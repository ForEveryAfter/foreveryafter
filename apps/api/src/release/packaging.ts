// Orchestrator: builds one encrypted ZIP package per entitled recipient and
// enqueues their condolence email + SMS-delivered OTP. Idempotent — re-running
// produces zero duplicates because release_packages has UNIQUE(release_event_id,
// recipient_profile_id) and the notifications table has its own UNIQUE on
// (stripe_event_id, user_id, channel) with synthetic ids
//   'release:{release_event_id}:{recipient_profile_id}:email'.
//
// Plaintext NEVER touches disk. Buffers are .fill(0)'d as soon as they're no
// longer needed.

import { createCipheriv } from 'crypto';
import { supabase } from '../shared/supabase';
import { getStorageAdapter } from '../shared/storage';
import { enqueueNotification } from '../shared/notifications-queue';
import { sendSms } from '../shared/twilio';
import {
  hybridDecrypt,
  getParentPrivateKey,
  getParentPublicKey,
} from '../utils/encryption';
import {
  generatePackageKey,
  wrapAesKey,
} from './package-crypto';
import { buildManifestsForRelease, type ManifestItem } from './entitlement';
import { MinimalZipWriter } from './zip-builder';
import { generateOtpCode, makeOtpHash } from './otp';
import { condolenceEmail, condolenceInApp, otpSmsBody } from './condolence-template';

const storage = getStorageAdapter();

const webBase = () => process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000';
const synth = (releaseEventId: string, recipientProfileId: string, channel: 'email' | 'in_app') =>
  `release:${releaseEventId}:${recipientProfileId}:${channel}`;

export async function buildPackagesForRelease(releaseEventId: string): Promise<{
  built: number;
  skippedDup: number;
  skippedEmpty: number;
}> {
  const { guideId, parentUserId, manifests } = await buildManifestsForRelease(releaseEventId);
  if (!manifests.length) return { built: 0, skippedDup: 0, skippedEmpty: 0 };

  // Fetch parent key material ONCE per release — used to RSA-wrap every per-
  // recipient AES key and to decrypt every sensitive_entries item.
  const parentPublicKey = await getParentPublicKey(parentUserId, supabase as any);
  // Private key is loaded lazily — only if ANY manifest item is db_encrypted.
  let parentPrivateKey: string | null = null;
  const ensurePrivateKey = async () => {
    if (!parentPrivateKey) {
      parentPrivateKey = await getParentPrivateKey(parentUserId, supabase as any);
    }
    return parentPrivateKey!;
  };

  const owner = await loadProfile(parentUserId);
  const parentName = fullName(owner) || 'Your family member';

  let built = 0;
  let skippedDup = 0;
  let skippedEmpty = 0;

  for (const m of manifests) {
    if (!m.items.length) { skippedEmpty++; continue; }

    // 1) Build the ZIP in memory, decrypting / decoding each manifest item as we go.
    const zip = new MinimalZipWriter();
    for (const item of m.items) {
      const bytes = await materialize(item, ensurePrivateKey);
      if (bytes.length === 0) continue;
      zip.addFile(item.zipPath, bytes);
      bytes.fill(0); // discard plaintext from heap immediately
    }
    const zipBytes = zip.finish();

    // 2) Generate per-package AES-256-GCM key, encrypt zip as one blob, capture tag.
    const km = generatePackageKey();
    const cipher = createCipheriv('aes-256-gcm', km.aesKey, km.iv);
    const cipherChunks = [cipher.update(zipBytes), cipher.final()];
    const ciphertext = Buffer.concat(cipherChunks);
    const tag = cipher.getAuthTag();
    // Wipe plaintext zip + AES key immediately. Wrap key first.
    const wrappedAesKey = wrapAesKey(km.aesKey, parentPublicKey);
    km.aesKey.fill(0);
    zipBytes.fill(0);

    // 3) Insert release_packages row (UNIQUE blocks duplicates). r2_object_key
    //    mirrors the row id so a leaked id alone never decrypts anything.
    const rawOtp = generateOtpCode();
    const otpHash = makeOtpHash(rawOtp);

    const { data: inserted, error: insErr } = await supabase
      .from('release_packages')
      .insert({
        release_event_id: releaseEventId,
        recipient_profile_id: m.recipientProfileId,
        // We let Postgres generate the id; we use it as the object key below.
        r2_object_key: 'PENDING',
        wrapped_aes_key: wrappedAesKey,
        aes_iv: km.iv.toString('base64'),
        gcm_tag: tag.toString('base64'),
        byte_size: ciphertext.length,
        otp_hash: otpHash,
        otp_attempts: 0,
        status: 'available',
      })
      .select('id')
      .single();
    if (insErr) {
      if ((insErr as any).code === '23505') { skippedDup++; continue; }
      console.error('[packaging] insert failed:', insErr.message);
      continue;
    }

    // 4) Upload ciphertext to storage at id == object key.
    const objectKey = `release-packages/${inserted.id}.bin`;
    try {
      await storage.save(objectKey, ciphertext, 'application/octet-stream');
    } catch (e: any) {
      console.error('[packaging] storage put failed for', inserted.id, e?.message);
      // Roll the row back so a retry doesn't end up with a row pointing at a
      // missing object. UNIQUE means the retry will succeed.
      await supabase.from('release_packages').delete().eq('id', inserted.id);
      continue;
    }
    await supabase.from('release_packages').update({ r2_object_key: objectKey }).eq('id', inserted.id);

    built++;

    // 5) Send the OTP via SMS, OUT OF BAND from the condolence email. If the
    //    recipient has no phone on file, document and skip — they'll need an
    //    in-account identity step (TODO below).
    const recipientProfile = await loadProfile(m.recipientProfileId);
    const recipientFamily = await loadFamilyMember(parentUserId, m.recipientProfileId);
    const recipientPhone = recipientFamily?.phone || null;
    if (recipientPhone) {
      sendSms({ to: recipientPhone, body: otpSmsBody(rawOtp, parentName) }).catch(() => {});
    } else {
      // TODO(otp-no-phone-fallback): show the code in-account after an identity
      // step (e.g. confirm DOB or last 4 of phone) before revealing it. For MVP,
      // a recipient without a phone on file simply can't receive the code via
      // SMS and must contact support — surface this in the condolence email
      // copy if it becomes common.
      console.warn(
        `[packaging] no phone on file for recipient ${m.recipientProfileId}; ` +
        `OTP code generated but not deliverable via SMS`
      );
    }

    // 6) Condolence email + in_app via existing notifications queue. NO OTP.
    const link = `${webBase()}/login`;
    const recipientFirst = (recipientProfile?.first_name || recipientFamily?.display_name?.split(/\s+/)[0] || '').trim();
    const ctx = { parentName, recipientFirstName: recipientFirst, accountLink: link };
    if (recipientProfile?.email) {
      await enqueueNotification({
        userId: m.recipientProfileId,
        type: 'release_condolence',
        channel: 'email',
        recipientRole: 'trusted_representative', // closest existing enum value
        stripeEventId: synth(releaseEventId, m.recipientProfileId, 'email'),
        payload: { to: recipientProfile.email, ...condolenceEmail(ctx) },
      });
    }
    await enqueueNotification({
      userId: m.recipientProfileId,
      type: 'release_condolence',
      channel: 'in_app',
      recipientRole: 'trusted_representative',
      stripeEventId: synth(releaseEventId, m.recipientProfileId, 'in_app'),
      payload: condolenceInApp(ctx),
    });

    // Don't keep the raw code in a closure variable any longer than needed.
    // (Local string GCs naturally; no DB/log carries it.)
  }

  return { built, skippedDup, skippedEmpty };
}

// ────────────────────────────────────────────────────────────────────────────────
//  Fetch + decrypt/decode a single manifest item into a plaintext Buffer.
// ────────────────────────────────────────────────────────────────────────────────
async function materialize(
  item: ManifestItem,
  ensurePrivateKey: () => Promise<string>
): Promise<Buffer> {
  switch (item.source) {
    case 'db_text':
      return Buffer.from(item.text || '', 'utf8');
    case 's3_plain': {
      if (!item.storagePath) return Buffer.alloc(0);
      return await storage.get(item.storagePath);
    }
    case 's3_db_text': {
      // Stored at a known path in S3; the file is already plain text (transcript).
      if (!item.storagePath) return Buffer.alloc(0);
      return await storage.get(item.storagePath);
    }
    case 'db_encrypted': {
      if (!item.encryptedData || !item.encryptedAesKey) return Buffer.alloc(0);
      const privKey = await ensurePrivateKey();
      return hybridDecrypt(item.encryptedData, item.encryptedAesKey, privKey);
    }
  }
}

async function loadProfile(userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('user_id, email, first_name, last_name')
    .eq('user_id', userId)
    .maybeSingle();
  return data;
}

async function loadFamilyMember(parentGuid: string, memberGuid: string) {
  const { data } = await supabase
    .from('family_members')
    .select('display_name, email, phone')
    .eq('parent_guid', parentGuid)
    .eq('member_guid', memberGuid)
    .maybeSingle();
  return data;
}

const fullName = (p: { first_name: string | null; last_name: string | null } | null | undefined) =>
  p ? [p.first_name, p.last_name].filter(Boolean).join(' ').trim() : '';
