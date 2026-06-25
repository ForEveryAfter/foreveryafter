import dotenv from 'dotenv';
dotenv.config();

// Whisper is opt-in via OPENAI_API_KEY in apps/api/.env. Without it, endpoints that
// depend on transcription silently skip (no charge, no spinner that never ends) and
// the user just won't see a transcript appear.
export const isWhisperConfigured = () => !!process.env.OPENAI_API_KEY;

// Retries up to MAX_ATTEMPTS times before giving up. Whisper failures are usually
// transient (rate limits, upstream blips, brief network hiccups) and this runs in
// the background, so a few retries with a small backoff catches most of them.
const MAX_ATTEMPTS = 3;

async function transcribeOnce(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<string> {
  const key = process.env.OPENAI_API_KEY!;
  const form = new FormData();
  // Uint8Array (not Node Buffer) keeps the TS Blob types happy across node/lib versions.
  form.set('file', new Blob([new Uint8Array(buffer)], { type: mimeType || 'audio/wav' }), filename);
  form.set('model', 'whisper-1');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form as any,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Whisper API ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { text?: string };
  return data.text ?? '';
}

// POST the audio buffer to OpenAI's /audio/transcriptions and return the text. Whisper
// auto-detects language; whisper-1 accepts mp3/mp4/m4a/wav/webm/etc. up to 25MB. Retries
// transient failures up to MAX_ATTEMPTS with 1s, 2s backoff before throwing.
export async function transcribeAudio(
  buffer: Buffer,
  mimeType: string,
  filename = 'audio.wav'
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');

  let lastErr: any;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await transcribeOnce(buffer, mimeType, filename);
    } catch (err: any) {
      lastErr = err;
      console.warn(`[Whisper] attempt ${attempt}/${MAX_ATTEMPTS} failed: ${err?.message}`);
      if (attempt < MAX_ATTEMPTS) {
        // 1s, then 2s — quick enough to keep the "transcribing" badge responsive.
        await new Promise((r) => setTimeout(r, attempt * 1000));
      }
    }
  }
  throw lastErr;
}
