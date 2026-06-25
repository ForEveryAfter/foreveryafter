// Recipient-facing download surface.
//   POST /packages/:id/request-code  — resends the OTP via SMS (rate-limited).
//   POST /packages/:id/download      — verifies OTP, unwraps the AES key with the
//     parent's Vault private key, GCM-decrypts the ciphertext, streams the .zip
//     attachment back. Server-PROXIED — no signed R2/S3 URL is ever handed out.

import { Router, Response } from 'express';
import { Readable } from 'stream';
import { supabase } from '../shared/supabase';
import { getStorageAdapter } from '../shared/storage';
import { sendSms } from '../shared/twilio';
import { getParentPrivateKey } from '../utils/encryption';
import { createPackageDecryptStream, unwrapAesKey } from './package-crypto';
import { verifyOtpAgainstHash, generateOtpCode, makeOtpHash, OTP_POLICY } from './otp';
import { otpSmsBody } from './condolence-template';

const router = Router();
const storage = getStorageAdapter();

// Same session-auth gate the rest of the API uses. The recipient logs in (their
// own profile), then hits these endpoints. There is no `dev-profile-001` pattern
// in this codebase — real auth via req.user.userId. We still structure the
// recipient-match check so a per-route guard (e.g. magic-link claim flow) can
// drop in later without changing the body of either handler.
const requireUser = (req: any, res: any, next: any) => {
  if (!req.isAuthenticated?.() || !req.user?.userId) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }
  next();
};

// In-memory rate limit for /request-code so a single recipient can't spam SMS.
// Reset on process restart; persist later if abuse is real.
const sendCooldowns = new Map<string, number>();
const SEND_COOLDOWN_MS = 60_000; // one resend per minute per package
const SEND_DAILY_CAP = 5;
const sendDaily = new Map<string, { count: number; resetAt: number }>();

type PackageLoad =
  | { ok: false; status: number }
  | { ok: true; pkg: any };

async function loadPackageForRecipient(packageId: string, callerUserId: string): Promise<PackageLoad> {
  const { data } = await supabase
    .from('release_packages')
    .select('id, release_event_id, recipient_profile_id, r2_object_key, wrapped_aes_key, aes_iv, gcm_tag, byte_size, otp_hash, otp_attempts, otp_locked_until, status, storage_tier, first_downloaded_at')
    .eq('id', packageId)
    .maybeSingle();
  if (!data) return { ok: false, status: 404 };
  if (data.recipient_profile_id !== callerUserId) return { ok: false, status: 403 };
  return { ok: true, pkg: data };
}

// ─── POST /packages/:id/request-code ─────────────────────────────────────────────
router.post('/:id/request-code', requireUser, async (req: any, res) => {
  try {
    const loaded = await loadPackageForRecipient(req.params.id, req.user.userId);
    if (!loaded.ok) return res.status(loaded.status).json({ error: loaded.status === 404 ? 'Not found' : 'Not allowed' });
    const pkg = loaded.pkg;

    // Rate limit.
    const now = Date.now();
    const last = sendCooldowns.get(pkg.id) || 0;
    if (now - last < SEND_COOLDOWN_MS) {
      const wait = Math.ceil((SEND_COOLDOWN_MS - (now - last)) / 1000);
      return res.status(429).json({ error: `Please wait ${wait}s before requesting another code.` });
    }
    let bucket = sendDaily.get(pkg.id);
    if (!bucket || bucket.resetAt < now) {
      bucket = { count: 0, resetAt: now + 86_400_000 };
      sendDaily.set(pkg.id, bucket);
    }
    if (bucket.count >= SEND_DAILY_CAP) {
      return res.status(429).json({ error: 'Too many code requests today. Please contact support.' });
    }

    // Look up the recipient's phone (family_members row keyed by the parent guide).
    const { data: ev } = await supabase
      .from('release_events')
      .select('guide_id')
      .eq('id', pkg.release_event_id)
      .single();
    const { data: guide } = await supabase
      .from('guides')
      .select('parent_user_id')
      .eq('id', ev?.guide_id)
      .single();
    const { data: fm } = await supabase
      .from('family_members')
      .select('phone')
      .eq('parent_guid', guide?.parent_user_id)
      .eq('member_guid', pkg.recipient_profile_id)
      .maybeSingle();
    const phone = fm?.phone;
    if (!phone) {
      // TODO(otp-no-phone-fallback): identity-question fallback (see packaging.ts).
      return res.status(409).json({ error: 'No phone on file for this recipient. Please contact support to verify your identity.' });
    }

    // Generate a fresh code, rotate the stored hash, reset attempts/lockout.
    const code = generateOtpCode();
    const newHash = makeOtpHash(code);
    await supabase
      .from('release_packages')
      .update({ otp_hash: newHash, otp_attempts: 0, otp_locked_until: null })
      .eq('id', pkg.id);

    // Look up the parent's name for the SMS body. Best-effort — falls back to a
    // generic phrase if profiles can't be reached.
    const { data: ownerProfile } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', guide?.parent_user_id)
      .maybeSingle();
    const parentName =
      [ownerProfile?.first_name, ownerProfile?.last_name].filter(Boolean).join(' ').trim() ||
      "your family member's";

    const sms = await sendSms({ to: phone, body: otpSmsBody(code, parentName) });
    sendCooldowns.set(pkg.id, now);
    bucket.count++;
    if (!sms.sent) {
      return res.status(502).json({ error: 'Could not send the code right now. Please try again shortly.' });
    }
    res.json({ sent: true });
  } catch (err: any) {
    console.error('[packages] request-code error:', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /packages/:id/download ─────────────────────────────────────────────────
router.post('/:id/download', requireUser, async (req: any, res: Response) => {
  try {
    const loaded = await loadPackageForRecipient(req.params.id, req.user.userId);
    if (!loaded.ok) return res.status(loaded.status).json({ error: loaded.status === 404 ? 'Not found' : 'Not allowed' });
    const pkg = loaded.pkg;

    // Spec: storage_tier branch hook. MVP code never sets this off 'standard';
    // when the post-MVP cold-storage migration job is built, this is where the
    // recipient is told to come back later.
    if (pkg.storage_tier !== 'standard') {
      return res.status(202).json({
        retrieving: true,
        message: "Your package is being retrieved from storage. We'll notify you when it's ready.",
      });
    }

    // Lockout check.
    if (OTP_POLICY.isLocked(pkg.otp_locked_until)) {
      return res.status(429).json({
        error: 'Too many wrong codes. Please try again later.',
        retryAfter: pkg.otp_locked_until,
      });
    }

    const code = String(req.body?.code || '').trim();
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Enter the 6-digit code we sent.' });
    }

    // Verify code. On miss: increment attempts; at the cap, set lockout.
    const ok = verifyOtpAgainstHash(code, pkg.otp_hash);
    if (!ok) {
      const next = (pkg.otp_attempts || 0) + 1;
      const lockUntil = next >= OTP_POLICY.MAX_ATTEMPTS ? OTP_POLICY.lockUntil().toISOString() : null;
      await supabase
        .from('release_packages')
        .update({ otp_attempts: next, otp_locked_until: lockUntil })
        .eq('id', pkg.id);
      if (lockUntil) {
        return res.status(429).json({ error: 'Too many wrong codes. Please try again later.' });
      }
      return res.status(401).json({ error: 'Wrong code.', attemptsLeft: OTP_POLICY.MAX_ATTEMPTS - next });
    }

    // Reset attempts on success.
    await supabase
      .from('release_packages')
      .update({ otp_attempts: 0, otp_locked_until: null })
      .eq('id', pkg.id);

    // Resolve the parent's RSA private key from Vault → unwrap the per-package
    // AES key → GCM-decrypt the ciphertext → stream back as an attachment.
    const { data: ev } = await supabase
      .from('release_events')
      .select('guide_id')
      .eq('id', pkg.release_event_id)
      .single();
    const { data: guide } = await supabase
      .from('guides')
      .select('parent_user_id')
      .eq('id', ev?.guide_id)
      .single();
    if (!guide?.parent_user_id) return res.status(500).json({ error: 'Could not resolve key holder.' });

    const parentPrivateKey = await getParentPrivateKey(guide.parent_user_id, supabase as any);
    const aesKey = unwrapAesKey(pkg.wrapped_aes_key, parentPrivateKey);
    const iv = Buffer.from(pkg.aes_iv, 'base64');
    const tag = Buffer.from(pkg.gcm_tag, 'base64');

    const ciphertext = await storage.get(pkg.r2_object_key);

    // GCM decrypt. We do one-shot (in-memory) to match the one-shot encrypt; for
    // very large packages, switch the put + get layer to a true streaming
    // pipeline (S3 multipart upload + getObject stream). The Transform produces
    // an error event on tag mismatch — wire that to abort the response.
    const decipher = createPackageDecryptStream({ aesKey, iv }, tag);
    let plaintext: Buffer;
    try {
      plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch (e: any) {
      console.error('[packages] GCM verification failed:', e?.message);
      return res.status(409).json({ error: 'Package failed integrity check. Please contact support.' });
    } finally {
      aesKey.fill(0);
    }

    // Mark first download success.
    const update: Record<string, any> = { status: 'downloaded' };
    if (!pkg.first_downloaded_at) update.first_downloaded_at = new Date().toISOString();
    await supabase.from('release_packages').update(update).eq('id', pkg.id);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="legacy-package-${pkg.id}.zip"`);
    res.setHeader('Content-Length', String(plaintext.length));
    Readable.from(plaintext).pipe(res);
    // After flush, GC reclaims plaintext; nothing persists.
  } catch (err: any) {
    console.error('[packages] download error:', err?.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
