import { Router } from 'express';
import { supabase } from '../shared/supabase';
import { getStorageAdapter } from '../shared/storage';
import { audioUpload, videoUpload, uploadRateLimiter, validateTextLength } from '../shared/upload-limits';

const router = Router();
const storage = getStorageAdapter();

const auth = async (req: any, res: any, next: any) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  req.userId = userId;
  next();
};

// ─── GET /letters/recipients ──────────────────────────────────────────────────
// Returns family_members for this parent, grouped for the UI
router.get('/recipients', auth, async (req: any, res) => {
  try {
    const { data: members, error } = await supabase
      .from('family_members')
      .select('id, member_guid, first_name, last_name, relationship, email, mobile, sort_order')
      .eq('parent_guid', req.userId)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    const immediate = members.filter(m =>
      ['spouse', 'partner', 'child'].includes(m.relationship.toLowerCase())
    );
    const siblings = members.filter(m =>
      m.relationship.toLowerCase() === 'sibling'
    );
    const additional = members.filter(m =>
      !['spouse', 'partner', 'child', 'sibling'].includes(m.relationship.toLowerCase())
    );

    // TODO: When executor is built, check if executor_guid matches any member_guid
    // and conditionally omit the trusted friend slot. For now always include it.
    const showTrustedFriendSlot = true;

    res.json({
      immediate,
      siblings,
      show_trusted_friend_slot: showTrustedFriendSlot,
      additional,
    });
  } catch (err: any) {
    console.error('Recipients error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /letters ─────────────────────────────────────────────────────────────
// Returns all letter rows for this parent
router.get('/', auth, async (req: any, res) => {
  try {
    const { data, error } = await supabase
      .from('letters_to_loved_ones')
      .select('id, recipient_guid, format, content_text, audio_path, video_path, status, updated_at')
      .eq('parent_guid', req.userId);

    if (error) throw error;
    res.json(data || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /letters/:recipient_guid ───────────────────────────────────────────
// Upsert typed/status update
router.post('/:recipient_guid', auth, validateTextLength('content_text'), async (req: any, res) => {
  const { recipient_guid } = req.params;
  const { format, content_text, status } = req.body;

  try {
    const { data, error } = await supabase
      .from('letters_to_loved_ones')
      .upsert(
        {
          parent_guid: req.userId,
          recipient_guid,
          ...(format !== undefined && { format }),
          ...(content_text !== undefined && { content_text }),
          ...(status !== undefined && { status }),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'parent_guid,recipient_guid' }
      )
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /letters/:recipient_guid/audio ─────────────────────────────────────
router.post('/:recipient_guid/audio', auth, uploadRateLimiter, audioUpload.single('audio'), async (req: any, res) => {
  const { recipient_guid } = req.params;
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No audio file' });

  try {
    const filePath = `web/private/${req.userId}/letters/${recipient_guid}.wav`;
    await storage.save(filePath, file.buffer, file.mimetype || 'audio/webm');

    const { data, error } = await supabase
      .from('letters_to_loved_ones')
      .upsert(
        {
          parent_guid: req.userId,
          recipient_guid,
          format: 'audio',
          audio_path: filePath,
          video_path: null,
          content_text: null,
          status: 'complete',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'parent_guid,recipient_guid' }
      )
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    console.error('Letter audio upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /letters/:recipient_guid/video ─────────────────────────────────────
router.post('/:recipient_guid/video', auth, uploadRateLimiter, videoUpload.single('video'), async (req: any, res) => {
  const { recipient_guid } = req.params;
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No video file' });

  try {
    const filePath = `web/private/${req.userId}/letters/${recipient_guid}.mp4`;
    await storage.save(filePath, file.buffer, file.mimetype || 'video/webm');

    const { data, error } = await supabase
      .from('letters_to_loved_ones')
      .upsert(
        {
          parent_guid: req.userId,
          recipient_guid,
          format: 'video',
          video_path: filePath,
          audio_path: null,
          content_text: null,
          status: 'complete',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'parent_guid,recipient_guid' }
      )
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    console.error('Letter video upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /family-members ─────────────────────────────────────────────────────
// Add a new family member from Group 3 "Add person" slot
router.post('/family-members', auth, async (req: any, res) => {
  const { first_name, last_name, relationship, email, mobile } = req.body;
  if (!first_name || !relationship) {
    return res.status(400).json({ error: 'first_name and relationship are required' });
  }

  try {
    const { data, error } = await supabase
      .from('family_members')
      .insert({
        parent_guid: req.userId,
        first_name,
        last_name: last_name || null,
        relationship,
        email: email || null,
        mobile: mobile || null,
        sort_order: 100, // additional members go to the end
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
