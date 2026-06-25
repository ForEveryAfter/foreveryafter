# Release packaging — verification

Per spec Part 8, the high-severity properties to demonstrate are:

1. **Entitlement isolation** — a letter addressed to A never appears in B's manifest/package.
2. **Idempotency** — second run yields zero new packages, zero new condolence emails, zero new S3 objects.
3. **OTP** — wrong code increments attempts; 6th attempt locks; correct code after lockout window succeeds.
4. **Round-trip** — build → AES-GCM encrypt → store → unwrap → GCM-decrypt yields byte-identical, openable ZIP.
5. **No plaintext on disk** — decrypt/decode happens in memory only.

## 1) Entitlement isolation

```sql
-- Set up: two recipients on the same guide. Letter L1 addressed to A; letter L2 to B.
-- Then trigger the release and inspect each recipient's manifest BEFORE the encrypted
-- blob is built.
\set guide_id    '''YOUR_GUIDE_UUID'''
\set recipient_a '''A_PROFILE_UUID'''
\set recipient_b '''B_PROFILE_UUID'''

select id, recipient_guid, format
  from letters_to_loved_ones
 where parent_guid = (select parent_user_id from guides where id = :guide_id);
-- expect: L1 / recipient_a / 'typed', L2 / recipient_b / 'audio' (etc.)

-- After buildPackagesForRelease has run:
select rp.recipient_profile_id, rp.byte_size, rp.gcm_tag is not null as has_tag
  from release_packages rp
  join release_events re on re.id = rp.release_event_id
 where re.guide_id = :guide_id;
-- expect: exactly 2 rows (one per recipient).
```

To prove L2 didn't leak into A's package (and vice-versa), assert directly against
the *manifest* the orchestrator built. The most reliable check is to download and
unzip each recipient's package via the `/packages/:id/download` route (with the
correct OTP) and grep the entry names — L2's filename should appear only in B's
zip, never in A's.

A unit test sketch (run from `apps/api/`):

```js
// integration test (not run by default — wire into your harness if you want):
import { buildManifestsForRelease } from './src/release/entitlement';
const { manifests } = await buildManifestsForRelease(RELEASE_EVENT_ID);
const a = manifests.find(m => m.recipientProfileId === 'A_PROFILE_UUID');
const b = manifests.find(m => m.recipientProfileId === 'B_PROFILE_UUID');
// A must have L1 entries, never L2 entries; B vice-versa.
expect(a.items.find(i => i.zipPath.includes('/L1/'))).toBeTruthy();
expect(a.items.find(i => i.zipPath.includes('/L2/'))).toBeFalsy();
expect(b.items.find(i => i.zipPath.includes('/L2/'))).toBeTruthy();
expect(b.items.find(i => i.zipPath.includes('/L1/'))).toBeFalsy();
```

**Schema gap to know about**: `occasions` has no `recipient_guid` column today.
I marked this in [entitlement.ts](../src/release/entitlement.ts) with a `TODO(occasions-recipient-link)` and *omit occasions entirely* from per-recipient packages until that linkage exists. This is safer than the alternative — there's no way for an occasion to leak into the wrong package because there are no occasion entries in any package at all yet.

## 2) Idempotency

```sql
-- Before:
select count(*) as pkgs_before   from release_packages   where release_event_id = :event_id;
select count(*) as notifs_before from notifications      where stripe_event_id like concat('release:', :event_id, ':%');

-- Trigger executeRelease the second time (manually call /release/internal/execute-due
-- with a 'pending' event, or just hit /release/:guideId again — both go through
-- executeRelease which is guarded against double-release).

-- After:
select count(*) as pkgs_after   from release_packages   where release_event_id = :event_id;
select count(*) as notifs_after from notifications      where stripe_event_id like concat('release:', :event_id, ':%');
-- pkgs_after == pkgs_before  (UNIQUE(release_event_id, recipient_profile_id))
-- notifs_after == notifs_before  (notifications UNIQUE on (stripe_event_id, user_id, channel))
```

Layered idempotency:
- `release_events` partial unique prevents two pending/executed events for the same guide.
- `release_packages` UNIQUE prevents two packages for the same (event, recipient).
- `notifications` UNIQUE prevents two condolence emails for the same (event, recipient, channel).
- Refund is gated by `release_events.refund_id IS NULL` — the second pass sees it set and skips.

## 3) OTP — wrong code, attempts, lockout

```sql
\set pkg_id '''YOUR_PACKAGE_UUID'''

-- 5 wrong attempts in a row from the download endpoint (curl below) should leave
-- otp_locked_until populated:
select otp_attempts, otp_locked_until from release_packages where id = :pkg_id;
-- expect: attempts >= MAX_OTP_ATTEMPTS (5), locked_until ~ now() + 15min
```

```bash
# 5 wrong-code calls — last one should 429 with lockout:
for i in 1 2 3 4 5; do
  curl -s -w " %{http_code}\n" -X POST \
    -H 'Content-Type: application/json' \
    -d '{"code":"000000"}' \
    https://YOUR_API/packages/$PKG_ID/download
done

# After the lockout window elapses, /request-code rotates the hash and resets
# attempts. Then a correct code succeeds:
curl -X POST https://YOUR_API/packages/$PKG_ID/request-code
# (wait for SMS, then…)
curl -X POST -H 'Content-Type: application/json' \
  -d '{"code":"<CODE FROM SMS>"}' \
  https://YOUR_API/packages/$PKG_ID/download
# → 200 with application/zip body.
```

## 4) Round-trip (the proof in `node`)

I ran this against the same primitives the code uses — verified in the build run:

```
hybridDecrypt round-trip: OK            # RSA-wrapped AES-256-CBC unwrap+decrypt of utils/encryption.ts
GCM round-trip: OK                       # per-package AES-256-GCM cipher + decipher with setAuthTag
GCM tamper detection: OK (rejected)      # flip one ciphertext byte → final() throws on tag mismatch
crc32("hello") = 3610a686 (matches spec) # the zip-builder CRC primitive
```

The `release_packages.gcm_tag` is captured *after* `cipher.final()` and stored as
base64. `createPackageDecryptStream(km, tag).setAuthTag(tag)` rejects with an
error if a byte changes anywhere between put → get. The download route catches
that and returns a 409 with `"Package failed integrity check."`

## 5) No plaintext on disk

Audit grep — there should be NO write to disk in any of the new files:

```bash
cd apps/api
grep -nE "writeFile|createWriteStream|fs\.write|require\('fs'\)|from 'fs'" \
  src/release/packaging.ts src/release/zip-builder.ts \
  src/release/package-crypto.ts src/release/packages-routes.ts \
  src/utils/encryption.ts
# expect: no matches.
```

The data path is:

```
S3 GET (ciphertext bytes) → Buffer
                          ↓
          hybridDecrypt (in heap)  [or no-decrypt for s3_plain]
                          ↓
          MinimalZipWriter.addFile (heap)
                          ↓
            zip.finish() returns Buffer
                          ↓
   AES-256-GCM encrypt (heap) + getAuthTag()
                          ↓
                S3 PUT (ciphertext)
                          ↓
       buffer.fill(0)  (plaintext heap cleared)
```

Note the deliberate `.fill(0)` calls after each plaintext buffer is consumed in [packaging.ts](../src/release/packaging.ts).

## Architecture seam: storage_tier for post-MVP cold storage

Per the spec's mid-prompt addition: `release_packages.storage_tier` defaults to
`'standard'` and is **never** changed by MVP code. The download route in
[packages-routes.ts](../src/release/packages-routes.ts) has this seam:

```ts
if (pkg.storage_tier !== 'standard') {
  return res.status(202).json({
    retrieving: true,
    message: "Your package is being retrieved from storage. We'll notify you when it's ready.",
  });
}
```

In MVP this branch is unreachable. When the cold-storage migration job is built later, it'll:
- Flip packages with no successful download in CLAIM_WINDOW_DAYS to `'cold'`.
- On `request-code` / `download` for a `'cold'` package, kick off a restore job and flip to `'restoring'`, returning the same `202`.
- When restore completes, flip back to `'standard'`.

No schema change required — the column is already there.

## What I had to make decisions on (compared to the literal spec)

| Spec said | What I built | Why |
|---|---|---|
| Cloudflare R2 | Existing S3 adapter (`STORAGE_PROVIDER=s3`, AWS keys) | Codebase is on AWS S3. Same SDK works for R2; swap endpoint in env later. |
| dev-profile-001 auth pattern | `req.user.userId` (real OAuth/passport via `requireUser`) | dev-profile-001 doesn't exist anywhere in this codebase. Same situation as the previous spec turns. |
| `messages` table for "special messages" | Used `letters_to_loved_ones` only | `messages` is interview-chat (user/assistant) — wrong table. Letters carry the addressed-message semantic. |
| Per-recipient occasions | OMITTED from packages | `occasions` has no recipient column. Surfacing as `TODO(occasions-recipient-link)` is safer than guessing the linkage. |
| Background worker (not Vercel) | Inline in `executeRelease`, fire-and-forget | API is a long-lived Node/Express process, not Vercel serverless — 10s timeout doesn't apply. If you move to a queue later, the orchestrator function is the same call site. |
| Constant-memory streaming pipeline | One-shot in-memory build + GCM + PUT | Multi-hundred-MB packages will briefly live in Node heap (not on disk — verified by audit grep). True streaming pipeline (S3 multipart + transform chain) is the next optimization; the format I produce is identical so the swap is purely IO plumbing. |

## Operational

After pushing the migration ([20260607000001_release_packages.sql](../../../supabase/migrations/20260607000001_release_packages.sql)):

```bash
supabase login
supabase db push
```

Set these in `apps/api/.env`:
```
OTP_PEPPER=<long random string>         # extra defense against DB-leak brute-force
# Twilio + Resend keys are already wired from earlier rounds.
```

End-to-end flow once a release executes (via either trigger):
1. `executeRelease` flips DB state, runs Stripe transitions, enqueues role notifications.
2. **Fire-and-forget**: `buildPackagesForRelease(release_event_id)` builds each recipient's ZIP, GCM-encrypts, uploads to `release-packages/<uuid>.bin`, inserts `release_packages` rows, sends OTP via SMS, enqueues condolence email (per recipient).
3. Recipient logs in, hits `POST /packages/:id/request-code` (rate-limited; SMS resend), enters the code at `POST /packages/:id/download`.
4. Server unwraps AES key from Vault, GCM-decrypts in memory, streams the ZIP attachment back.
