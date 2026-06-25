import { Router } from 'express';
import { supabase } from '../shared/supabase';
import { getStorageAdapter } from '../shared/storage';
import {
  audioUpload,
  videoUpload,
  uploadRateLimiter,
  validateTextLength,
  LIMITS,
  mediaDurationSeconds,
  formatDuration,
} from '../shared/upload-limits';

const router = Router();
const storage = getStorageAdapter();

const auth = async (req: any, res: any, next: any) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  req.userId = userId;
  next();
};

// Helper: get guide_id for this parent
async function getGuideId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('guides')
    .select('id')
    .eq('parent_user_id', userId)
    .single();
  if (error || !data) return null;
  return data.id;
}

// ─── GET /recipients ─────────────────────────────────────────────────────────
// Pulls the parent's real family_members and groups them the way the UI wants
// (Letters-style: immediate / siblings / additional) plus a synthetic
// "family" entry the wizard uses to mean is_family_message=true.
//
// IMPORTANT: the id we return as `id` and `member_guid` is the
// family_members.id uuid — the same value used as occasions.recipient_guid
// (which has a FK to family_members.id). The old hardcoded mock used string
// ids like 'hc-2' which caused "invalid input syntax for type uuid" on save.
const IMMEDIATE_REL = new Set(['spouse', 'partner', 'son', 'daughter', 'child', 'mother', 'father', 'parent']);
const SIBLING_REL = new Set(['brother', 'sister', 'sibling']);

function splitDisplayName(s: string): { first: string; last: string | null } {
  const parts = (s || '').trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return { first: '', last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

router.get('/recipients', auth, async (req: any, res) => {
  try {
    const { data: members, error } = await supabase
      .from('family_members')
      .select('id, display_name, relationship, email, phone, created_at')
      .eq('parent_guid', req.userId)
      .order('created_at', { ascending: true });
    if (error) throw error;

    const toUi = (m: any, sortOrder: number) => {
      const { first, last } = splitDisplayName(m.display_name);
      return {
        id: m.id,
        member_guid: m.id,
        first_name: first,
        last_name: last,
        relationship: (m.relationship || 'other').toLowerCase(),
        email: m.email,
        mobile: m.phone,
        sort_order: sortOrder,
      };
    };

    const list = (members || []).map((m, i) => toUi(m, i + 1));
    const immediate = list.filter((m) => IMMEDIATE_REL.has(m.relationship));
    const siblings = list.filter((m) => SIBLING_REL.has(m.relationship));
    const additional = list.filter(
      (m) => !IMMEDIATE_REL.has(m.relationship) && !SIBLING_REL.has(m.relationship)
    );

    res.json({
      // Synthetic entry — id/member_guid both null so the wizard knows to set
      // is_family_message=true and recipient_guid=null on the occasion row.
      family: {
        id: 'family-target',
        member_guid: null,
        first_name: 'The Family',
        last_name: null,
        relationship: 'family',
        email: null,
        mobile: null,
        sort_order: 0,
      },
      immediate,
      siblings,
      show_trusted_friend_slot: true,
      additional,
    });
  } catch (err: any) {
    console.error('Occasions recipients error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET / ───────────────────────────────────────────────────────────────────
// Return all occasions for this parent's guide
router.get('/', auth, async (req: any, res) => {
  try {
    const guideId = await getGuideId(req.userId);
    if (!guideId) return res.json([]);

    const { data, error } = await supabase
      .from('occasions')
      .select('id, guide_id, recipient_guid, is_family_message, title, occasion_date, format, content_text, audio_path, video_path, status, created_at, updated_at')
      .eq('guide_id', guideId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (err: any) {
    console.error('Fetch occasions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST / ──────────────────────────────────────────────────────────────────
// Create a new occasion
router.post('/', auth, validateTextLength('content_text'), async (req: any, res) => {
  const { title, recipient_guid, is_family_message, occasion_date, format, content_text } = req.body;

  if (!title || !format) {
    return res.status(400).json({ error: 'title and format are required' });
  }

  try {
    const guideId = await getGuideId(req.userId);
    if (!guideId) return res.status(400).json({ error: 'No guide found for this user' });

    const { data, error } = await supabase
      .from('occasions')
      .insert({
        guide_id: guideId,
        title,
        recipient_guid: is_family_message ? null : recipient_guid,
        is_family_message: !!is_family_message,
        occasion_date: occasion_date || null,
        format,
        content_text: format === 'text' ? (content_text || null) : null,
        status: (format === 'text' && content_text) ? 'complete' : 'not_started',
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    console.error('Create occasion error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /:occasion_id ─────────────────────────────────────────────────────
// Update an occasion (title, date, content, format, status)
router.patch('/:occasion_id', auth, validateTextLength('content_text'), async (req: any, res) => {
  const { occasion_id } = req.params;
  const { title, occasion_date, format, content_text, status } = req.body;

  try {
    const guideId = await getGuideId(req.userId);
    if (!guideId) return res.status(400).json({ error: 'No guide found' });

    const updates: any = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title;
    if (occasion_date !== undefined) updates.occasion_date = occasion_date || null;
    if (format !== undefined) updates.format = format;
    if (content_text !== undefined) updates.content_text = content_text;
    if (status !== undefined) updates.status = status;

    // If switching to text format, clear file paths
    if (format === 'text') {
      updates.audio_path = null;
      updates.video_path = null;
    }

    const { data, error } = await supabase
      .from('occasions')
      .update(updates)
      .eq('id', occasion_id)
      .eq('guide_id', guideId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    console.error('Update occasion error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:occasion_id/audio ────────────────────────────────────────────────
router.post('/:occasion_id/audio', auth, uploadRateLimiter, audioUpload.single('audio'), async (req: any, res) => {
  const { occasion_id } = req.params;
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No audio file' });

  // Duration cap ("too long"): audio caps at 5 min. Multer already enforced size.
  const duration = await mediaDurationSeconds(file.buffer, file.mimetype || 'audio/webm');
  if (duration !== null && duration > LIMITS.AUDIO_MAX_DURATION_TOLERANCE) {
    return res.status(413).json({
      error: `Recording is too long (${formatDuration(duration)}) — over the ${LIMITS.AUDIO_MAX_DURATION_SECONDS / 60}-minute limit. Please record a shorter clip.`,
    });
  }

  try {
    const guideId = await getGuideId(req.userId);
    if (!guideId) return res.status(400).json({ error: 'No guide found' });

    const filePath = `web/private/${guideId}/occasions/${occasion_id}.wav`;
    await storage.save(filePath, file.buffer, file.mimetype || 'audio/webm');

    const { data, error } = await supabase
      .from('occasions')
      .update({
        format: 'audio',
        audio_path: filePath,
        video_path: null,
        content_text: null,
        status: 'complete',
        updated_at: new Date().toISOString(),
      })
      .eq('id', occasion_id)
      .eq('guide_id', guideId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    console.error('Occasion audio upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:occasion_id/video ────────────────────────────────────────────────
router.post('/:occasion_id/video', auth, uploadRateLimiter, videoUpload.single('video'), async (req: any, res) => {
  const { occasion_id } = req.params;
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No video file' });

  // Duration cap ("too long"): video caps at 10 min (2× audio). Multer already
  // enforced the 200 MB size cap above (handleMulterError).
  const duration = await mediaDurationSeconds(file.buffer, file.mimetype || 'video/webm');
  if (duration !== null && duration > LIMITS.VIDEO_MAX_DURATION_TOLERANCE) {
    return res.status(413).json({
      error: `Video is too long (${formatDuration(duration)}) — over the ${LIMITS.VIDEO_MAX_DURATION_SECONDS / 60}-minute limit. Please record a shorter clip.`,
    });
  }

  try {
    const guideId = await getGuideId(req.userId);
    if (!guideId) return res.status(400).json({ error: 'No guide found' });

    const filePath = `web/private/${guideId}/occasions/${occasion_id}.mp4`;
    await storage.save(filePath, file.buffer, file.mimetype || 'video/webm');

    const { data, error } = await supabase
      .from('occasions')
      .update({
        format: 'video',
        video_path: filePath,
        audio_path: null,
        content_text: null,
        status: 'complete',
        updated_at: new Date().toISOString(),
      })
      .eq('id', occasion_id)
      .eq('guide_id', guideId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    console.error('Occasion video upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /:occasion_id ────────────────────────────────────────────────────
router.delete('/:occasion_id', auth, async (req: any, res) => {
  const { occasion_id } = req.params;

  try {
    const guideId = await getGuideId(req.userId);
    if (!guideId) return res.status(400).json({ error: 'No guide found' });

    // Fetch to clean up storage
    const { data: occasion, error: fetchError } = await supabase
      .from('occasions')
      .select('audio_path, video_path')
      .eq('id', occasion_id)
      .eq('guide_id', guideId)
      .single();

    if (fetchError) throw fetchError;

    if (occasion?.audio_path) {
      await storage.delete(occasion.audio_path).catch(() => {});
    }
    if (occasion?.video_path) {
      await storage.delete(occasion.video_path).catch(() => {});
    }

    const { error: deleteError } = await supabase
      .from('occasions')
      .delete()
      .eq('id', occasion_id)
      .eq('guide_id', guideId);

    if (deleteError) throw deleteError;
    res.json({ success: true });
  } catch (err: any) {
    console.error('Delete occasion error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
