// Per-recipient entitlement. The cardinal rule (spec Part 1): wrong-recipient
// leakage is the highest-severity bug. So every package is built from an EXPLICIT
// per-recipient query — never "everything, filtered later."
//
//   Guide recipients (children / designated family) → receive the GUIDE content
//     (My Story, Family & Friends, Final Wishes, etc.) PLUS any of their addressed
//     letters and occasions.
//   Non-child recipients → receive ONLY their addressed letters/occasions; NEVER
//     the guide.
//
// Returns a manifest of { recipientProfileId → ManifestItem[] }. Each ManifestItem
// is the recipe for one zip entry: where to fetch source bytes, whether they're
// encrypted, and the zip-entry path.

import { supabase } from '../shared/supabase';

export type SourceKind =
  | 's3_plain'        // bytes in S3, no decryption needed (e.g. recordings)
  | 's3_db_text'      // a text column in the row (transcript_path/text_content) — already-rendered
  | 'db_encrypted'    // encrypted_data column on a DB row; needs hybridDecrypt
  | 'db_text';        // plain text in a DB row

export interface ManifestItem {
  zipPath: string;                  // folder-as-name, e.g. "My Story/Chapter 01/Q03.txt"
  source: SourceKind;
  storagePath?: string;             // for s3_plain / s3_db_text
  encryptedData?: string;           // for db_encrypted (base64 — stays so until decrypt)
  encryptedAesKey?: string;         // for db_encrypted (base64)
  text?: string;                    // for db_text
  contentType?: string;             // optional hint (defaulted by extension)
}

export interface RecipientManifest {
  recipientProfileId: string;
  items: ManifestItem[];
  receivesGuide: boolean;           // for the audit log + the "non-child recipient" rule
}

// Recipient roster for a guide. A "child recipient" = a family_members row whose
// relationship is son/daughter (or any other guide-recipient class your product
// settles on). A "letter-only recipient" is anyone with a letter/occasion addressed
// to them who isn't a child recipient.
const GUIDE_RECIPIENT_RELATIONSHIPS = new Set(['son', 'daughter', 'spouse']);

export async function buildManifestsForRelease(releaseEventId: string): Promise<{
  guideId: string;
  parentUserId: string;
  manifests: RecipientManifest[];
}> {
  // 1) Resolve the release_event → guide + parent.
  const { data: ev } = await supabase
    .from('release_events')
    .select('id, guide_id')
    .eq('id', releaseEventId)
    .maybeSingle();
  if (!ev) throw new Error(`release_event not found: ${releaseEventId}`);

  const { data: guide } = await supabase
    .from('guides')
    .select('id, parent_user_id, guid')
    .eq('id', ev.guide_id)
    .maybeSingle();
  if (!guide) throw new Error(`guide not found for release_event ${releaseEventId}`);

  // 2) Family members on this guide. We work in member_guid (= the profile.user_id
  //    once provisioned). Recipients without a member_guid can't be packaged yet —
  //    they need to log in / be invited.
  const { data: members } = await supabase
    .from('family_members')
    .select('id, member_guid, relationship, display_name')
    .eq('parent_guid', guide.parent_user_id);

  // 3) Classify into guide-recipients vs letter-only recipients.
  const guideRecipientProfileIds = new Set<string>();
  const recipientProfileIds = new Set<string>();
  for (const m of members || []) {
    if (!m.member_guid) continue;
    recipientProfileIds.add(m.member_guid);
    if (GUIDE_RECIPIENT_RELATIONSHIPS.has((m.relationship || '').toLowerCase())) {
      guideRecipientProfileIds.add(m.member_guid);
    }
  }

  // 4) Per-recipient manifest construction. Each query is keyed on the recipient.
  const manifests: RecipientManifest[] = [];

  // 4a) Guide content — ONE shared body of items used only for guide_recipients.
  //     Built once and reused; the entitlement check below decides who gets it.
  const guideItems = await buildGuideManifestItems(guide.parent_user_id);

  for (const recipientProfileId of recipientProfileIds) {
    const items: ManifestItem[] = [];
    const isGuideRecipient = guideRecipientProfileIds.has(recipientProfileId);
    if (isGuideRecipient) {
      items.push(...guideItems);
    }

    // 4b) Letters: STRICT — only those addressed to this recipient.
    const { data: letters } = await supabase
      .from('letters_to_loved_ones')
      .select('id, format, content_text, audio_path, video_path')
      .eq('parent_guid', guide.parent_user_id)
      .eq('recipient_guid', recipientProfileId);
    for (const l of letters || []) {
      const stem = `Letter for you/${l.id}`;
      if (l.format === 'typed' && l.content_text) {
        items.push({ zipPath: `${stem}/letter.txt`, source: 'db_text', text: l.content_text });
      }
      if (l.format === 'audio' && l.audio_path) {
        items.push({ zipPath: `${stem}/letter.audio`, source: 's3_plain', storagePath: l.audio_path });
      }
      if (l.format === 'video' && l.video_path) {
        items.push({ zipPath: `${stem}/letter.video`, source: 's3_plain', storagePath: l.video_path });
      }
    }

    // 4c) Occasions: schema currently has no recipient column on `occasions`
    //     (only guide_id/title/date/occasion_type). Per spec Part 1, each
    //     occasion item is supposed to be addressed to a specific profile —
    //     that addressing model needs a schema change (`occasion_recipients` or
    //     `recipient_guid`) before we can entitle here. For MVP, occasions are
    //     OMITTED from per-recipient packages until that linkage exists, so we
    //     never leak someone's occasion into someone else's package.
    // TODO(occasions-recipient-link): add an occasion_recipients table or
    //     recipient_guid column to `occasions`, then mirror the letters loop
    //     above here.

    manifests.push({
      recipientProfileId,
      items,
      receivesGuide: isGuideRecipient,
    });
  }

  return {
    guideId: guide.id,
    parentUserId: guide.parent_user_id,
    manifests,
  };
}

// Guide content: the guide owner's own answers across the 7 sections, plus
// sensitive_entries (encrypted-at-rest accounts). Each entry knows whether the
// source is plain in S3 or encrypted in the DB so the packager picks the right
// fetch+decrypt path.
async function buildGuideManifestItems(parentUserId: string): Promise<ManifestItem[]> {
  const items: ManifestItem[] = [];

  // ── Guide questions: text + audio + video → S3 paths via user_question_responses ──
  const { data: responses } = await supabase
    .from('user_question_responses')
    .select('question_id, audio_path, video_path, transcript_path, text_content, recorded_at')
    .eq('parent_guid', parentUserId);
  if (responses && responses.length) {
    // Resolve question metadata once to build readable zip paths.
    const qIds = responses.map((r) => r.question_id);
    const { data: questions } = await supabase
      .from('questions')
      .select('id, order, chapter_id, slug')
      .in('id', qIds);
    const qById = new Map((questions || []).map((q) => [q.id, q]));

    const chIds = [...new Set((questions || []).map((q) => q.chapter_id).filter(Boolean))];
    const { data: chapters } = chIds.length
      ? await supabase.from('chapters').select('id, order, section, slug, title').in('id', chIds)
      : { data: [] };
    const chById = new Map((chapters || []).map((c) => [c.id, c]));

    for (const r of responses) {
      const q = qById.get(r.question_id);
      const c = q?.chapter_id ? chById.get(q.chapter_id) : null;
      const sectionFolder = c?.section === 'health_legacy' ? 'Health Legacy' : 'My Story';
      const chapterFolder = c ? `Chapter ${String(c.order ?? 0).padStart(2, '0')} — ${c.title || c.slug || 'chapter'}` : 'Chapter 00';
      const qLabel = `Q${String(q?.order ?? 0).padStart(2, '0')} ${q?.slug || ''}`.trim();
      const baseDir = `${sectionFolder}/${chapterFolder}/${qLabel}`;
      if (r.transcript_path) {
        items.push({ zipPath: `${baseDir}/transcript.txt`, source: 's3_db_text', storagePath: r.transcript_path });
      } else if (r.text_content) {
        items.push({ zipPath: `${baseDir}/answer.txt`, source: 'db_text', text: r.text_content });
      }
      if (r.audio_path) items.push({ zipPath: `${baseDir}/${basename(r.audio_path)}`, source: 's3_plain', storagePath: r.audio_path });
      if (r.video_path) items.push({ zipPath: `${baseDir}/${basename(r.video_path)}`, source: 's3_plain', storagePath: r.video_path });
    }
  }

  // ── Sensitive entries (accounts) — DB-encrypted via the existing hybrid scheme ──
  const { data: sensitives } = await supabase
    .from('sensitive_entries')
    .select('id, category, label, encrypted_data')
    .eq('parent_guid', parentUserId)
    .not('encrypted_data', 'is', null);
  for (const s of sensitives || []) {
    // encrypted_data on sensitive_entries is a base64 JSON-ish blob using the
    // existing hybridEncrypt format ({encryptedData, encryptedAesKey} joined).
    // Persisted as a single TEXT column — convention here is `<encAesKey>.<encData>`
    // (matches accounts/routes.ts). We split and pass both to hybridDecrypt at
    // packaging time.
    const stored = String(s.encrypted_data || '');
    const dotIdx = stored.indexOf('.');
    if (dotIdx <= 0) continue; // malformed — skip rather than leak format errors
    items.push({
      zipPath: `Accounts/${s.category || 'misc'}/${s.label}.txt`,
      source: 'db_encrypted',
      encryptedAesKey: stored.slice(0, dotIdx),
      encryptedData: stored.slice(dotIdx + 1),
    });
  }

  // TODO(release-recipients-deliver-extras): wills_documents + final_wishes when
  //   their schemas are wired the same way. Hooked in here when their tables exist.

  return items;
}

function basename(p: string): string {
  const ix = p.lastIndexOf('/');
  return ix >= 0 ? p.slice(ix + 1) : p;
}
