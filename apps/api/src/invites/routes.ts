import { Router } from 'express';
import { randomBytes } from 'crypto';
import { supabase } from '../shared/supabase';

const router = Router();

const requireUser = (req: any, res: any, next: any) => {
  if (!req.isAuthenticated?.() || !req.user?.userId) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }
  next();
};

// POST /invites — the logged-in user invites someone to create a guide.
// Returns a tokenized link the invitee follows; acceptance + relationship linkage
// happen on their login (see auth/routes.ts acceptInvite).
router.post('/', requireUser, async (req: any, res) => {
  try {
    const token = randomBytes(24).toString('base64url');
    const { inviteeEmail, relationship } = req.body || {};
    const { data, error } = await supabase
      .from('invites')
      .insert({
        token,
        inviter_user_id: req.user.userId,
        invitee_email: typeof inviteeEmail === 'string' ? inviteeEmail : null,
        invitee_role: 'parent',
        relationship: typeof relationship === 'string' ? relationship : 'parent',
      })
      .select('token')
      .single();
    if (error) throw error;

    const webBase = process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000';
    res.json({ token: data.token, link: `${webBase}/invite/${data.token}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
