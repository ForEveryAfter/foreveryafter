import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../shared/supabase';
import { getStorageAdapter } from '../shared/storage';
import { videoUpload, photoUpload, uploadRateLimiter, validateTextLength, validatePhotoMagicBytes } from '../shared/upload-limits';

const router = Router();
const storage = getStorageAdapter();

// Auth middleware (same simple pattern as documents)
const authMiddleware = async (req: any, res: any, next: any) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  req.userId = userId;
  next();
};

// ─── GET / ─── fetch the user's final wishes record
router.get('/', authMiddleware, async (req: any, res) => {
  try {
    const { data, error } = await supabase
      .from('final_wishes')
      .select('*')
      .eq('parent_guid', req.userId)
      .maybeSingle();

    if (error) throw error;
    res.json(data || {});
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST / ─── upsert (auto-save)
router.post('/', authMiddleware, validateTextLength('service_notes'), validateTextLength('body_notes'), validateTextLength('obituary_own_words'), async (req: any, res) => {
  const {
    service_type,
    service_notes,
    body_preference,
    body_notes,
    service_video_url,
    obituary_own_words,
    obituary_ai_generated,
    notify_list
  } = req.body;

  try {
    const { data, error } = await supabase
      .from('final_wishes')
      .upsert(
        {
          parent_guid: req.userId,
          ...(service_type !== undefined && { service_type }),
          ...(service_notes !== undefined && { service_notes }),
          ...(body_preference !== undefined && { body_preference }),
          ...(body_notes !== undefined && { body_notes }),
          ...(service_video_url !== undefined && { service_video_url }),
          ...(obituary_own_words !== undefined && { obituary_own_words }),
          ...(obituary_ai_generated !== undefined && { obituary_ai_generated }),
          ...(notify_list !== undefined && { notify_list }),
          updated_at: new Date().toISOString()
        },
        { onConflict: 'parent_guid' }
      )
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /video ─── upload service video
router.post('/video', authMiddleware, uploadRateLimiter, videoUpload.single('video'), async (req: any, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No video file provided' });

  try {
    const ext = file.originalname.split('.').pop()?.toLowerCase() || 'mp4';
    const filePath = `web/private/${req.userId}/final-wishes/service-video.${ext}`;
    await storage.save(filePath, file.buffer, file.mimetype);

    // Persist path in DB
    const { error } = await supabase
      .from('final_wishes')
      .upsert(
        {
          parent_guid: req.userId,
          service_video_path: filePath,
          service_video_url: null,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'parent_guid' }
      );

    if (error) throw error;
    res.json({ success: true, file_name: file.originalname, path: filePath });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /video ─── remove service video
router.delete('/video', authMiddleware, async (req: any, res) => {
  try {
    // Get current path so we can delete from storage
    const { data, error: fetchError } = await supabase
      .from('final_wishes')
      .select('service_video_path')
      .eq('parent_guid', req.userId)
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (data?.service_video_path) {
      await storage.delete(data.service_video_path).catch(() => {});
    }

    const { error } = await supabase
      .from('final_wishes')
      .upsert(
        {
          parent_guid: req.userId,
          service_video_path: null,
          service_video_url: null,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'parent_guid' }
      );

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /photo/:tag ─── upload obituary or funeral_program photo
router.post('/photo/:tag', authMiddleware, uploadRateLimiter, photoUpload.single('photo'), validatePhotoMagicBytes('photo'), async (req: any, res) => {
  const { tag } = req.params;
  const file = req.file;

  if (!['obituary', 'funeral_program'].includes(tag)) {
    return res.status(400).json({ error: 'Invalid photo tag. Must be "obituary" or "funeral_program".' });
  }
  if (!file) return res.status(400).json({ error: 'No photo file provided' });

  try {
    const ext = file.originalname.split('.').pop()?.toLowerCase() || 'jpg';
    const filePath = `web/private/${req.userId}/final-wishes/${tag}-photo.${ext}`;
    await storage.save(filePath, file.buffer, file.mimetype);

    const column = tag === 'obituary' ? 'obituary_photo_path' : 'funeral_program_photo_path';
    const { error } = await supabase
      .from('final_wishes')
      .upsert(
        {
          parent_guid: req.userId,
          [column]: filePath,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'parent_guid' }
      );

    if (error) throw error;
    res.json({ success: true, path: filePath });
  } catch (err: any) {
    console.error('Photo upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /photo/:tag ─── remove a photo
router.delete('/photo/:tag', authMiddleware, async (req: any, res) => {
  const { tag } = req.params;
  if (!['obituary', 'funeral_program'].includes(tag)) {
    return res.status(400).json({ error: 'Invalid photo tag.' });
  }

  try {
    const column = tag === 'obituary' ? 'obituary_photo_path' : 'funeral_program_photo_path';

    const { data, error: fetchError } = await supabase
      .from('final_wishes')
      .select(column)
      .eq('parent_guid', req.userId)
      .maybeSingle();

    if (fetchError) throw fetchError;

    const pathValue = data ? (data as any)[column] : null;
    if (pathValue) {
      await storage.delete(pathValue).catch(() => {});
    }

    const { error } = await supabase
      .from('final_wishes')
      .upsert(
        {
          parent_guid: req.userId,
          [column]: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'parent_guid' }
      );

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    console.error('Photo delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /obituary ─── Anthropic AI generation (server-side only)
router.post('/obituary', authMiddleware, async (req: any, res) => {
  const {
    service_type,
    service_notes,
    body_preference,
    body_notes,
    obituary_own_words,
    notify_list
  } = req.body;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Anthropic API key not configured' });
  }

  // Build a context block from whatever is filled in
  const contextLines: string[] = [];
  if (service_type) contextLines.push(`Preferred service type: ${service_type}`);
  if (service_notes) contextLines.push(`Service wishes: ${service_notes}`);
  if (body_preference) contextLines.push(`Wishes for remains: ${body_preference}`);
  if (body_notes) contextLines.push(`Additional wishes: ${body_notes}`);
  if (obituary_own_words) contextLines.push(`\nIn their own words:\n${obituary_own_words}`);
  if (notify_list && Array.isArray(notify_list) && notify_list.length > 0) {
    const names = notify_list.map((n: any) => n.name).filter(Boolean).join(', ');
    if (names) contextLines.push(`Loved ones who should be notified: ${names}`);
  }

  const context = contextLines.length > 0
    ? contextLines.join('\n')
    : 'Very little information was provided.';

  const prompt = `You are helping a family write an obituary for a loved one who has passed.

Here is what we know about this person from the information they left behind:

${context}

Write a warm, dignified obituary in exactly 3 paragraphs. Follow these rules:
- Do not invent facts, names, dates, or details not provided.
- If information is sparse, write warmly and generally — something any family would treasure.
- Do not include a title, header, or preamble. Start directly with the first paragraph.
- Do not use phrases like "Here is the obituary" or "Certainly".
- Keep a warm, human, gentle tone throughout.
- Each paragraph should be 3–5 sentences.`;

  try {
    const anthropic = new Anthropic({ apiKey });

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }]
    });

    const generated = (message.content[0] as any).text as string;

    // Persist the AI result
    await supabase
      .from('final_wishes')
      .upsert(
        {
          parent_guid: req.userId,
          obituary_ai_generated: generated,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'parent_guid' }
      );

    res.json({ obituary: generated });
  } catch (err: any) {
    console.error('Anthropic error:', err);
    res.status(500).json({ error: err.message || 'AI generation failed' });
  }
});

export default router;
