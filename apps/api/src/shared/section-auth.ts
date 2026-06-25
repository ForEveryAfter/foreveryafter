import { supabase } from './supabase';

// The 7 guide sections (must match the tiles.tile_type CHECK constraint).
const VALID_TILES = ['life_story', 'accounts', 'health', 'wills', 'final_wishes', 'letters', 'occasions'];

// Mark a tile "started" (in_progress) for the user's guide when they enter data.
// Idempotent + race-safe via upsert on the unique (guide_id, tile_type) constraint
// added in migration 20260613000001. The previous select-then-insert version
// raced under concurrent writes and produced multiple rows for the same tile.
//
// Semantics: on first call → insert with status='in_progress'. On subsequent
// calls → bump last_accessed_at + updated_at but DON'T regress 'complete' back
// to 'in_progress'. We accomplish the latter by only sending status on insert,
// using ignoreDuplicates=false with the resolution merging just the timestamp
// columns.
export async function markTileStarted(userId: string, tileType: string) {
  if (!VALID_TILES.includes(tileType)) return;
  const { data: guide } = await supabase.from('guides').select('id').eq('parent_user_id', userId).maybeSingle();
  if (!guide) return;

  const now = new Date().toISOString();
  // Read current status so we know whether to set it on the upsert. Either we
  // insert fresh (status='in_progress') or update an existing row (preserve
  // its status — 'in_progress' stays, 'complete' isn't regressed).
  const { data: existing } = await supabase
    .from('tiles')
    .select('status')
    .eq('guide_id', guide.id)
    .eq('tile_type', tileType)
    .maybeSingle();

  const status = existing?.status === 'complete' ? 'complete' : 'in_progress';
  const { error } = await supabase
    .from('tiles')
    .upsert(
      {
        guide_id: guide.id,
        tile_type: tileType,
        status,
        completion_percentage: existing ? undefined : 0,
        last_accessed_at: now,
        updated_at: now,
      },
      { onConflict: 'guide_id,tile_type' }
    );
  if (error) console.error('[tiles] upsert failed:', error.message);
}

// Gate /storage/*: require a session and serve only files the requester owns.
// File keys are scoped differently per section — by the user id, the guide's
// internal id (occasions), or the public guide guid (interview) — so accept a
// path whose scope segment is ANY of the requester's own ids.
export async function requireStorageAccess(req: any, res: any, next: any) {
  if (!req.isAuthenticated?.() || !req.user?.userId) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }
  const key: string = String(req.params?.[0] || '').replace(/^\/+/, '');
  const segs = key.split('/');

  let scopeId: string | undefined;
  if (segs[0] === 'guides') scopeId = segs[1]; // guides/{guideGuid}/...
  else if (segs[0] === 'web' && segs[1] === 'private') scopeId = segs[2]; // web/private/{userId|guideId}/...
  else scopeId = segs[0];

  const { data: guide } = await supabase
    .from('guides')
    .select('id, guid')
    .eq('parent_user_id', req.user.userId)
    .maybeSingle();
  const owned = new Set([req.user.userId, guide?.id, guide?.guid].filter(Boolean));

  if (!scopeId || !owned.has(scopeId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

// Repoint the legacy x-user-id section routes onto the real OAuth session user
// without touching each route's internals: require a session, then overwrite the
// x-user-id header (which the existing route code reads) with the real user id.
// On a write, mark the section's tile started. tileType may be a string or a
// function of the request (interview serves both life_story and health).
export function sectionAuth(tileType: string | ((req: any) => string)) {
  return (req: any, res: any, next: any) => {
    if (!req.isAuthenticated?.() || !req.user?.userId) {
      return res.status(401).json({ error: 'Unauthenticated' });
    }
    req.headers['x-user-id'] = req.user.userId;
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      const t = typeof tileType === 'function' ? tileType(req) : tileType;
      markTileStarted(req.user.userId, t).catch((e: any) =>
        console.error('[tiles] markTileStarted failed:', e?.message)
      );
    }
    next();
  };
}
