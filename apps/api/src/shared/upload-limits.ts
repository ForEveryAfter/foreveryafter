import multer from 'multer';
import { Request, Response, NextFunction } from 'express';

// ─── Size Limits ──────────────────────────────────────────────────────────────

export const LIMITS = {
  // Video caps are 2× audio — longer-form video memories (occasions).
  VIDEO_MAX_BYTES: 200 * 1024 * 1024,   // 200 MB
  AUDIO_MAX_BYTES: 10 * 1024 * 1024,    // 10 MB
  PHOTO_MAX_BYTES: 5 * 1024 * 1024,     // 5 MB
  TEXT_MAX_CHARS: 10_000,                // 10,000 characters
  TEXT_MAX_BYTES: 50 * 1024,             // 50 KB
  DOCUMENT_MAX_BYTES: 25 * 1024 * 1024,  // 25 MB (PDFs)
  // Duration is per-type. _SECONDS is the spec, _TOLERANCE is the actual reject
  // threshold (adds 5s for encoder flush drift past the frontend auto-stop).
  AUDIO_MAX_DURATION_SECONDS: 300,        // 5 minutes
  AUDIO_MAX_DURATION_TOLERANCE: 305,
  VIDEO_MAX_DURATION_SECONDS: 600,        // 10 minutes
  VIDEO_MAX_DURATION_TOLERANCE: 605,
  MAX_PHOTOS_PER_PARENT: 3,
  STORAGE_QUOTA_BYTES: 10 * 1024 * 1024 * 1024, // 10 GB
  STORAGE_WARNING_BYTES: 8 * 1024 * 1024 * 1024, // 8 GB
  RATE_UPLOADS_PER_HOUR: 20,
  RATE_UPLOADS_PER_DAY: 50,
} as const;

// ─── Allowed MIME Types ───────────────────────────────────────────────────────

export const ALLOWED_MIMES = {
  video: ['video/webm', 'video/mp4', 'video/quicktime'],
  audio: ['audio/webm', 'audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/ogg'],
  photo: ['image/jpeg', 'image/png'],
  document: ['application/pdf'],
} as const;

// ─── JPEG/PNG Magic Bytes ─────────────────────────────────────────────────────

const JPEG_MAGIC = Buffer.from([0xFF, 0xD8, 0xFF]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

export function verifyImageMagicBytes(buffer: Buffer): 'jpeg' | 'png' | null {
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(JPEG_MAGIC)) return 'jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_MAGIC)) return 'png';
  return null;
}

// ─── Multer Configs ───────────────────────────────────────────────────────────

// Browser MediaRecorder uploads send a full type like
//   video/webm;codecs="vp8,opus"  or  audio/webm;codecs=opus
// Match on the BASE type only so the allow-list doesn't have to enumerate every
// codec variant. Lower-cased + trimmed for safety against odd whitespace.
function baseMime(mimetype: string): string {
  return (mimetype || '').split(';')[0].trim().toLowerCase();
}

// Filename-extension fallbacks for when the browser sends a useless Content-Type
// (some browser+MediaRecorder combos serialize the multipart part as
// text/plain or application/octet-stream even when the source Blob was tagged
// video/webm). These are deliberately narrow — the magic-bytes check elsewhere
// in this file enforces the actual file shape for photos; if you ever add
// magic-bytes validation for videos, this fallback can be removed.
const EXT_TO_VIDEO_MIME: Record<string, string> = {
  webm: 'video/webm', mp4: 'video/mp4', m4v: 'video/mp4',
  mov: 'video/quicktime', qt: 'video/quicktime',
};
const EXT_TO_AUDIO_MIME: Record<string, string> = {
  webm: 'audio/webm', wav: 'audio/wav', mp3: 'audio/mpeg',
  m4a: 'audio/mp4', mp4: 'audio/mp4', ogg: 'audio/ogg', oga: 'audio/ogg',
};
function extOf(filename: string): string {
  return (filename || '').split('.').pop()?.toLowerCase() || '';
}

export const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITS.VIDEO_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const mime = baseMime(file.mimetype);
    if (ALLOWED_MIMES.video.includes(mime as any)) return cb(null, true);
    // Fallback: trust filename extension when the MIME is one of the bogus
    // defaults browsers may pick. Coerce the displayed mimetype too so the
    // downstream storage.save() call labels the file correctly.
    if ((mime === 'text/plain' || mime === 'application/octet-stream' || mime === '') &&
        EXT_TO_VIDEO_MIME[extOf(file.originalname)]) {
      file.mimetype = EXT_TO_VIDEO_MIME[extOf(file.originalname)];
      return cb(null, true);
    }
    cb(new Error(`Invalid video type: ${file.mimetype}. Allowed: ${ALLOWED_MIMES.video.join(', ')}`));
  },
});

export const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITS.AUDIO_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const mime = baseMime(file.mimetype);
    if (ALLOWED_MIMES.audio.includes(mime as any)) return cb(null, true);
    if ((mime === 'text/plain' || mime === 'application/octet-stream' || mime === '') &&
        EXT_TO_AUDIO_MIME[extOf(file.originalname)]) {
      file.mimetype = EXT_TO_AUDIO_MIME[extOf(file.originalname)];
      return cb(null, true);
    }
    cb(new Error(`Invalid audio type: ${file.mimetype}. Allowed: ${ALLOWED_MIMES.audio.join(', ')}`));
  },
});

export const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITS.PHOTO_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.photo.includes(file.mimetype as any)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid photo type: ${file.mimetype}. Allowed: JPEG, PNG only.`));
    }
  },
});

export const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITS.DOCUMENT_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed.'));
    }
  },
});

// ─── Text Validation Middleware ────────────────────────────────────────────────

export function validateTextLength(field: string = 'content_text') {
  return (req: Request, res: Response, next: NextFunction) => {
    const text = req.body?.[field];
    if (text && typeof text === 'string') {
      if (text.length > LIMITS.TEXT_MAX_CHARS) {
        return res.status(400).json({
          error: `Text exceeds maximum length of ${LIMITS.TEXT_MAX_CHARS.toLocaleString()} characters.`,
        });
      }
      if (Buffer.byteLength(text, 'utf8') > LIMITS.TEXT_MAX_BYTES) {
        return res.status(400).json({
          error: `Text exceeds maximum size of ${LIMITS.TEXT_MAX_BYTES / 1024}KB.`,
        });
      }
    }
    next();
  };
}

// ─── Photo Magic-Byte Validation Middleware ────────────────────────────────────

export function validatePhotoMagicBytes(fieldName: string = 'photo') {
  return (req: Request, res: Response, next: NextFunction) => {
    const file = (req as any).file;
    if (!file) return next();

    const detected = verifyImageMagicBytes(file.buffer);
    if (!detected) {
      return res.status(400).json({
        error: 'File does not appear to be a valid JPEG or PNG image.',
      });
    }

    // Cross-check magic bytes vs declared MIME
    const mimeToMagic: Record<string, string> = {
      'image/jpeg': 'jpeg',
      'image/png': 'png',
    };
    if (mimeToMagic[file.mimetype] && mimeToMagic[file.mimetype] !== detected) {
      return res.status(400).json({
        error: `File extension says ${file.mimetype} but content is ${detected}.`,
      });
    }

    next();
  };
}

// ─── Media Duration Parsing ───────────────────────────────────────────────────
// Pure-JS parser (music-metadata) reads the container header (WebM/Matroska, MP4,
// WAV, MP3, …) and reports the duration in seconds. Dynamic import keeps the
// ESM-only module compatible with this CommonJS build. Returns null when parsing
// can't read this buffer — the byte cap still backstops in that case.
export async function mediaDurationSeconds(buf: Buffer, mimeType: string): Promise<number | null> {
  try {
    const mm: any = await import('music-metadata');
    const meta = await mm.parseBuffer(new Uint8Array(buf), mimeType || 'application/octet-stream', { duration: true });
    const d = meta?.format?.duration;
    return typeof d === 'number' ? d : null;
  } catch (e: any) {
    console.warn('[upload-limits] duration parse failed:', e?.message);
    return null;
  }
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s === 0 ? `${m} min` : `${m} min ${s} sec`;
}

// ─── Base64 Size Validation (for interview/save route) ────────────────────────

export function validateBase64Size(field: string = 'data', mediaType: 'audio' | 'video') {
  return (req: Request, res: Response, next: NextFunction) => {
    const base64 = req.body?.[field];
    if (!base64 || typeof base64 !== 'string') return next();

    // Base64 is ~4/3 of original size
    const estimatedBytes = Math.ceil(base64.length * 3 / 4);
    const maxBytes = mediaType === 'video' ? LIMITS.VIDEO_MAX_BYTES : LIMITS.AUDIO_MAX_BYTES;
    const label = `${maxBytes / (1024 * 1024)}MB`;

    if (estimatedBytes > maxBytes) {
      return res.status(400).json({
        error: `${mediaType} file exceeds maximum size of ${label}.`,
      });
    }
    next();
  };
}

// ─── Rate Limiter (in-memory, per user) ───────────────────────────────────────
// TODO: Replace with Redis-backed rate limiter in production

interface RateEntry {
  hourly: { count: number; resetAt: number };
  daily: { count: number; resetAt: number };
}

const rateLimits = new Map<string, RateEntry>();

export function uploadRateLimiter(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any).userId || (req as any).user?.id || req.headers['x-user-id'];
  if (!userId) return next(); // Auth middleware will catch this

  const now = Date.now();
  let entry = rateLimits.get(userId as string);

  if (!entry) {
    entry = {
      hourly: { count: 0, resetAt: now + 3600_000 },
      daily: { count: 0, resetAt: now + 86400_000 },
    };
    rateLimits.set(userId as string, entry);
  }

  // Reset windows if expired
  if (now > entry.hourly.resetAt) {
    entry.hourly = { count: 0, resetAt: now + 3600_000 };
  }
  if (now > entry.daily.resetAt) {
    entry.daily = { count: 0, resetAt: now + 86400_000 };
  }

  if (entry.hourly.count >= LIMITS.RATE_UPLOADS_PER_HOUR) {
    return res.status(429).json({ error: 'Upload rate limit exceeded. Maximum 20 uploads per hour.' });
  }
  if (entry.daily.count >= LIMITS.RATE_UPLOADS_PER_DAY) {
    return res.status(429).json({ error: 'Daily upload limit exceeded. Maximum 50 uploads per day.' });
  }

  entry.hourly.count++;
  entry.daily.count++;
  next();
}

// ─── Multer Error Handler ─────────────────────────────────────────────────────

export function handleMulterError(err: any, req: Request, res: Response, next: NextFunction) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      // Field name distinguishes which limit was hit (audio vs video / photo / doc).
      const isVideo = err.field === 'video';
      const isAudio = err.field === 'audio';
      const what = isVideo ? 'Video' : isAudio ? 'Recording' : 'File';
      const limit = isVideo
        ? `${LIMITS.VIDEO_MAX_BYTES / (1024 * 1024)} MB`
        : isAudio
          ? `${LIMITS.AUDIO_MAX_BYTES / (1024 * 1024)} MB`
          : 'the upload limit';
      // Content-Length is close to the file size for single-file multipart uploads —
      // gives the user a concrete number without us reading the rejected body.
      const cl = Number(req.headers['content-length']) || 0;
      const sizeHint = cl ? ` (${(cl / (1024 * 1024)).toFixed(1)} MB)` : '';
      return res.status(413).json({
        error: `${what} is too big${sizeHint} — over the ${limit} limit. Please record a shorter clip.`,
      });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err?.message?.includes('Invalid') || err?.message?.includes('Only')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
}
