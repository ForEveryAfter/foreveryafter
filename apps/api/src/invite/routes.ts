import { Router } from 'express';
import { supabase } from '../shared/supabase';

const router = Router();

const requireUser = (req: any, res: any, next: any) => {
  if (!req.isAuthenticated?.() || !req.user?.userId) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }
  next();
};

const VIDEO_FLAG = 'invite_video_seen';

// Resolve the invitee's context: are they a trusted individual (TI flow) or just a
// child/family member (child flow), and which parent invited them.
async function resolveInvite(userId: string, email: string) {
  const lower = (email || '').toLowerCase();
  const [{ data: byGuid }, { data: byEmail }] = await Promise.all([
    supabase.from('family_members').select('id, parent_guid, display_name, relationship').eq('member_guid', userId),
    supabase.from('family_members').select('id, parent_guid, display_name, relationship').ilike('email', lower),
  ]);
  const fams = [...(byGuid || []), ...(byEmail || [])].filter(
    (f, i, arr) => arr.findIndex((x) => x.id === f.id) === i
  );
  if (fams.length === 0) return { role: 'child' as const, parentGuid: null as string | null };

  // Is any of my family_member rows a trusted individual on its guide?
  let isTI = false;
  let parentGuid = fams[0].parent_guid;
  for (const f of fams) {
    const { data: guide } = await supabase
      .from('guides')
      .select('primary_ti_member_id, secondary_ti_member_id')
      .eq('parent_user_id', f.parent_guid)
      .maybeSingle();
    if (guide && (guide.primary_ti_member_id === f.id || guide.secondary_ti_member_id === f.id)) {
      isTI = true;
      parentGuid = f.parent_guid; // prefer the guide where they're a TI
      break;
    }
  }
  return { role: isTI ? ('trusted' as const) : ('child' as const), parentGuid };
}

// GET /invite/info — what the invitee reviews, plus which flow to run.
router.get('/info', requireUser, async (req: any, res) => {
  try {
    const { role, parentGuid } = await resolveInvite(req.user.userId, req.user.email);

    const { data: me } = await supabase
      .from('profiles')
      .select('first_name, last_name, email, phone, invite_flow_status')
      .eq('user_id', req.user.userId)
      .single();

    let parentFirstName: string | null = null;
    if (parentGuid) {
      const { data: parent } = await supabase.from('profiles').select('first_name').eq('user_id', parentGuid).maybeSingle();
      parentFirstName = parent?.first_name ?? null;
    }

    const { data: flag } = await supabase
      .from('user_flags')
      .select('flag')
      .eq('user_guid', req.user.userId)
      .eq('flag', VIDEO_FLAG)
      .maybeSingle();

    res.json({
      role, // 'child' | 'trusted'
      firstName: me?.first_name ?? null,
      lastName: me?.last_name ?? null,
      email: me?.email ?? req.user.email ?? null,
      phone: me?.phone ?? null,
      parentFirstName,
      inviteFlowStatus: me?.invite_flow_status ?? null,
      videoSeen: !!flag,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /invite/info — the TI flow requires a phone; email stays the login identity.
router.patch('/info', requireUser, async (req: any, res) => {
  try {
    const updates: Record<string, string> = {};
    if (typeof req.body?.phone === 'string') updates.phone = req.body.phone.trim();
    if (typeof req.body?.firstName === 'string') updates.first_name = req.body.firstName.trim();
    if (typeof req.body?.lastName === 'string') updates.last_name = req.body.lastName.trim();
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nothing to update' });
    const { error } = await supabase
      .from('profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('user_id', req.user.userId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /invite/video-seen — the welcome/TI video plays once.
router.post('/video-seen', requireUser, async (req: any, res) => {
  try {
    await supabase.from('user_flags').upsert(
      { user_guid: req.user.userId, flag: VIDEO_FLAG },
      { onConflict: 'user_guid,flag' }
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /invite/complete — mark the invite flow finished; reflect in the live session.
router.post('/complete', requireUser, async (req: any, res) => {
  try {
    await supabase
      .from('profiles')
      .update({ invite_flow_status: 'completed', updated_at: new Date().toISOString() })
      .eq('user_id', req.user.userId);
    if ((req.session as any)?.passport?.user) (req.session as any).passport.user.inviteFlowStatus = 'completed';
    if (req.user) (req.user as any).inviteFlowStatus = 'completed';
    if (req.session?.save) req.session.save(() => res.json({ success: true }));
    else res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
