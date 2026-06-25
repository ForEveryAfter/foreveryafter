import { Router } from 'express';
import { supabase } from '../shared/supabase';
import { getStorageAdapter } from '../shared/storage';
import { uploadRateLimiter, LIMITS, mediaDurationSeconds, formatDuration } from '../shared/upload-limits';
import { isWhisperConfigured, transcribeAudio } from '../shared/whisper';

const router = Router();
const storage = getStorageAdapter();

// S3 key prefix for a question's answer, mirroring the guide hierarchy:
//   guides/{guideGuid}/{tile}/{chapterOrder}/{questionOrder}
// tile + chapter order are derived from the question's chapter; the guide GUID is
// the public handle (never the internal guide id). Returns null if no guide.
async function questionStoragePrefix(userId: string, questionId: string): Promise<string | null> {
  const { data: guide } = await supabase.from('guides').select('guid').eq('parent_user_id', userId).maybeSingle();
  if (!guide?.guid) return null;
  const { data: q } = await supabase.from('questions').select('*').eq('id', questionId).maybeSingle();
  if (!q) return null;
  let chapterOrder = 0;
  let sectionName = 'mystory';
  if (q.chapter_id) {
    const { data: ch } = await supabase.from('chapters').select('*').eq('id', q.chapter_id).maybeSingle();
    chapterOrder = ch?.order ?? 0;
    sectionName = ch?.section ?? 'mystory';
  }
  const tile = sectionName === 'health_legacy' ? 'health' : 'life_story';
  return `guides/${guide.guid}/${tile}/${chapterOrder}/${q.order ?? 0}`;
}

// Download the audio from S3, run Whisper, write transcript.txt to S3, update the row.
// Used both as a fire-and-forget after a /save and synchronously from /transcribe (retry).
// Throws on failure so the caller can decide whether to surface the error; this function
// itself ALSO writes a failure transcript+status so the UI can show "Transcription failed."
async function runTranscription(
  userId: string,
  questionId: string,
  audioPath: string,
  mimeType: string
): Promise<{ text: string; transcriptPath: string }> {
  const prefix = await questionStoragePrefix(userId, questionId);
  if (!prefix) throw new Error('No storage prefix for this question.');
  const transcriptPath = `${prefix}/transcript.txt`;

  try {
    const buffer = await storage.get(audioPath);
    // Use the actual filename from the storage key so the multipart upload tells Whisper
    // the right format (e.g. audio.webm) — the bytes follow the extension.
    const filename = audioPath.split('/').pop() || 'audio.wav';
    const text = await transcribeAudio(buffer, mimeType || 'audio/webm', filename);
    await storage.save(transcriptPath, Buffer.from(text, 'utf8'), 'text/plain');
    await supabase
      .from('user_question_responses')
      .update({ transcript_path: transcriptPath, transcript_status: 'ready' })
      .eq('parent_guid', userId)
      .eq('question_id', questionId);
    return { text, transcriptPath };
  } catch (err: any) {
    console.error('[Whisper] transcription failed:', err?.message);
    // Per spec: on failure, the text box shows "Transcription failed." (and the user
    // can edit it to type their answer instead).
    const failureText = 'Transcription failed. You can type your answer here instead.';
    await storage.save(transcriptPath, Buffer.from(failureText, 'utf8'), 'text/plain');
    await supabase
      .from('user_question_responses')
      .update({ transcript_path: transcriptPath, transcript_status: 'failed' })
      .eq('parent_guid', userId)
      .eq('question_id', questionId);
    throw err;
  }
}

// Session-aware: sectionAuth (mounted at /interview in index.ts) verifies the session
// cookie and overwrites x-user-id with the real profiles.user_id. We just expose it as
// req.user.id for the handlers below (keeping the legacy shape they read).
// No dummy bearer token required.
const authMiddleware = async (req: any, res: any, next: any) => {
  const userId = (req.headers['x-user-id'] as string) || req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthenticated' });
  req.user = { ...(req.user || {}), id: userId };
  next();
};

// GET Chapters
router.get('/chapters', authMiddleware, async (req, res) => {
  const section = req.query.section as string || 'mystory';
  const { data, error } = await supabase
    .from('chapters')
    .select('*')
    .eq('section', section)
    .eq('is_active', true)
    .order('section_order', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET Questions
router.get('/questions', authMiddleware, async (req, res) => {
  const section = req.query.section as string || 'mystory';
  
  const { data: chapters, error: chaptersError } = await supabase
    .from('chapters')
    .select('id')
    .eq('section', section)
    .eq('is_active', true);

  if (chaptersError) return res.status(500).json({ error: chaptersError.message });
  
  const chapterIds = chapters.map(c => c.id);

  if (chapterIds.length === 0) {
    return res.json([]);
  }

  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .in('chapter_id', chapterIds)
    .eq('is_active', true)
    .order('order', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET User Responses
router.get('/responses', authMiddleware, async (req: any, res) => {
  const { data, error } = await supabase
    .from('user_question_responses')
    .select('*')
    .eq('parent_guid', req.user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST Save Response (Audio/Video)
router.post('/save', authMiddleware, uploadRateLimiter, async (req: any, res) => {
  const { questionId, slug, type, data, mimeType, section = 'mystory' } = req.body; // data is base64 string for simplicity in Pass 8
  const userId = req.user.id;

  if (!data || !questionId || !slug || !type) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Size cap ("too big"): pre-validated from the base64 length so we don't decode an
  // already-oversized payload into memory.
  if (typeof data === 'string') {
    const estimatedBytes = Math.ceil(data.length * 3 / 4);
    const maxBytes = type === 'video' ? LIMITS.VIDEO_MAX_BYTES : LIMITS.AUDIO_MAX_BYTES;
    const maxLabel = `${maxBytes / (1024 * 1024)} MB`;
    if (estimatedBytes > maxBytes) {
      const sizeMb = (estimatedBytes / (1024 * 1024)).toFixed(1);
      const what = type === 'video' ? 'Video' : 'Recording';
      return res.status(413).json({
        error: `${what} is too big (${sizeMb} MB) — over the ${maxLabel} limit. Please record a shorter clip.`,
      });
    }
  }

  const buffer = Buffer.from(data, 'base64');

  // Duration cap ("too long"): the Recorder caps client-side (5:00 audio, 10:00 video)
  // and this enforces the same server-side in case the client was tampered with.
  // Parser failure → skip (the byte cap is the fallback).
  if (type === 'audio' || type === 'video') {
    const duration = await mediaDurationSeconds(buffer, mimeType);
    const isVideo = type === 'video';
    const tolerance = isVideo ? LIMITS.VIDEO_MAX_DURATION_TOLERANCE : LIMITS.AUDIO_MAX_DURATION_TOLERANCE;
    if (duration !== null && duration > tolerance) {
      const what = isVideo ? 'Video' : 'Recording';
      const limitMin = isVideo ? LIMITS.VIDEO_MAX_DURATION_SECONDS / 60 : LIMITS.AUDIO_MAX_DURATION_SECONDS / 60;
      return res.status(413).json({
        error: `${what} is too long (${formatDuration(duration)}) — over the ${limitMin}-minute limit. Please record a shorter clip.`,
      });
    }
  }
  // Derive the extension from the actual MIME (browser MediaRecorder usually produces
  // audio/webm or video/webm with codec params). Falls back to the legacy default.
  const subtype = String(mimeType || '').split(';')[0].split('/')[1] || '';
  const ext = subtype || (type === 'video' ? 'mp4' : 'wav');
  const prefix = await questionStoragePrefix(userId, questionId);
  if (!prefix) return res.status(400).json({ error: 'No guide found for user' });
  const filePath = `${prefix}/${type === 'video' ? 'video' : 'audio'}.${ext}`;

  try {
    // Recording goes to storage (S3); the DB only keeps the pointer + recorded_at.
    await storage.save(filePath, buffer, mimeType);

    // For audio: kick off background Whisper transcription so the transcript appears on
    // its own (the page polls and updates if the user is still there, otherwise the
    // transcript is just there when they come back). Video is NOT auto-transcribed.
    const autoTranscribe = type === 'audio' && isWhisperConfigured();

    const { data: response, error: dbError } = await supabase
      .from('user_question_responses')
      .upsert({
        parent_guid: userId,
        question_id: questionId,
        audio_path: type === 'audio' ? filePath : null,
        video_path: type === 'video' ? filePath : null,
        recorded_at: new Date().toISOString(),
        // 'transcribing' is set eagerly so the response already reflects the in-flight
        // background job; runTranscription updates to 'ready' or 'failed' on completion.
        transcript_status: autoTranscribe ? 'transcribing' : null,
        // 'everyone' is the only value the CHECK constraint
        // user_question_responses_audience_check accepts today; it's also the
        // column default. Audience-targeting (family / spouse / specific person /
        // etc.) is still TODO — when that ships, broaden the CHECK in a migration
        // and start setting the right value here based on the user's choice.
        audience: 'everyone',
        audience_user_id: null
      }, { onConflict: 'parent_guid,question_id' })
      .select()
      .single();

    if (dbError) throw dbError;

    if (autoTranscribe) {
      // Fire-and-forget. runTranscription handles both success and failure (it writes
      // the appropriate transcript.txt + status itself).
      runTranscription(userId, questionId, filePath, mimeType).catch(() => {});
    }

    res.json(response);
  } catch (error: any) {
    console.error('Save error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE the saved audio recording for a question. Removes the file from storage and
// clears audio_path + transcript_status on the row — but KEEPS the transcript_path +
// text content so the user's typed/transcribed answer isn't lost. If they record again,
// auto-transcription will overwrite the transcript text per the spec.
router.delete('/recording', authMiddleware, async (req: any, res) => {
  const questionId = String(req.query.questionId || '');
  if (!questionId) return res.status(400).json({ error: 'Missing questionId' });
  const userId = req.user.id;

  try {
    const { data: existing } = await supabase
      .from('user_question_responses')
      .select('audio_path')
      .eq('parent_guid', userId)
      .eq('question_id', questionId)
      .maybeSingle();
    if (!existing) return res.status(404).json({ error: 'Response not found' });

    if (existing.audio_path) {
      try {
        await storage.delete(existing.audio_path);
      } catch (e: any) {
        // The DB pointer is the source of truth — log + continue if the file's already
        // gone (could be a partial earlier delete, an external sweep, etc.).
        console.error('[interview] storage delete failed:', e?.message);
      }
    }

    const { data: updated, error } = await supabase
      .from('user_question_responses')
      .update({ audio_path: null, transcript_status: null })
      .eq('parent_guid', userId)
      .eq('question_id', questionId)
      .select()
      .single();
    if (error) throw error;
    res.json(updated);
  } catch (err: any) {
    console.error('Delete recording error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET User Flags
router.get('/flags', authMiddleware, async (req: any, res) => {
  const { data, error } = await supabase
    .from('user_flags')
    .select('*')
    .eq('user_guid', req.user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST Set Flag
router.post('/flags', authMiddleware, async (req: any, res) => {
  const { flag } = req.body;
  const userId = req.user.id;

  const { data, error } = await supabase
    .from('user_flags')
    .upsert({ user_guid: userId, flag }, { onConflict: 'user_guid,flag' })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST Save Text Content for a question
router.post('/save-text', authMiddleware, async (req: any, res) => {
  const { questionId, textContent } = req.body;
  const userId = req.user.id;

  if (!questionId) {
    return res.status(400).json({ error: 'Missing questionId' });
  }

  // Enforce text length limit
  if (textContent && textContent.length > 10000) {
    return res.status(400).json({ error: 'Text exceeds 10,000 character limit.' });
  }

  try {
    // The answer text is content → store it in S3; the DB keeps only the pointer.
    const prefix = await questionStoragePrefix(userId, questionId);
    if (!prefix) return res.status(400).json({ error: 'No guide found for user' });
    const transcriptPath = `${prefix}/transcript.txt`;
    await storage.save(transcriptPath, Buffer.from(textContent || '', 'utf8'), 'text/plain');

    const { data, error } = await supabase
      .from('user_question_responses')
      .upsert({
        parent_guid: userId,
        question_id: questionId,
        transcript_path: transcriptPath,
        recorded_at: new Date().toISOString(),
      }, { onConflict: 'parent_guid,question_id' })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    console.error('Save text error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST Transcribe audio to text — synchronous retry. The save path already kicks off
// transcription automatically; this is for re-running it (e.g. after a 'failed' state)
// or running it on demand for an existing recording.
router.post('/transcribe', authMiddleware, async (req: any, res) => {
  const { questionId } = req.body;
  const userId = req.user.id;
  if (!questionId) return res.status(400).json({ error: 'Missing questionId' });
  if (!isWhisperConfigured()) {
    return res.status(503).json({ error: 'Transcription isn’t set up yet (OPENAI_API_KEY missing).' });
  }

  try {
    const { data: response, error } = await supabase
      .from('user_question_responses')
      .select('audio_path')
      .eq('parent_guid', userId)
      .eq('question_id', questionId)
      .single();
    if (error || !response?.audio_path) {
      return res.status(400).json({ error: 'No audio recording found for this question.' });
    }

    await supabase
      .from('user_question_responses')
      .update({ transcript_status: 'transcribing' })
      .eq('parent_guid', userId)
      .eq('question_id', questionId);

    const { text, transcriptPath } = await runTranscription(userId, questionId, response.audio_path, 'audio/wav');

    const { data: updated } = await supabase
      .from('user_question_responses')
      .select()
      .eq('parent_guid', userId)
      .eq('question_id', questionId)
      .single();

    res.json({ text, transcriptPath, response: updated });
  } catch (err: any) {
    console.error('Transcribe error:', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// GET Profile preferences (suppress_transcribe_warning)
router.get('/profile-preferences', authMiddleware, async (req: any, res) => {
  const userId = req.user.id;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('suppress_transcribe_warning')
      .eq('user_id', userId)
      .single();

    if (error) {
      // Profile may not exist yet for hardcoded dev user
      return res.json({ suppress_transcribe_warning: false });
    }

    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH Update profile preferences
router.patch('/profile-preferences', authMiddleware, async (req: any, res) => {
  const userId = req.user.id;
  const { suppress_transcribe_warning } = req.body;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .update({ suppress_transcribe_warning })
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      // Profile may not exist — try upsert is not possible due to FK constraint
      // Just log and return success for dev purposes
      console.warn('Profile update failed (user may not exist in auth.users):', error.message);
      return res.json({ suppress_transcribe_warning });
    }

    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
