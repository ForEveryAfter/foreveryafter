import { Router } from 'express';
import { supabase } from '../shared/supabase';

const router = Router();

// Session-authed; scoped to the logged-in user's own notifications.
const requireUser = (req: any, res: any, next: any) => {
  if (!req.isAuthenticated?.() || !req.user?.userId) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }
  next();
};

// GET /notifications — the user's notifications, newest first.
router.get('/', requireUser, async (req: any, res) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, title, content, is_read, created_at')
      .eq('user_id', req.user.userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /notifications/read — mark the user's unread notifications as read.
router.post('/read', requireUser, async (req: any, res) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', req.user.userId)
      .eq('is_read', false);
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── In-app feed (spec Part 5) ───────────────────────────────────────────────────
// Stricter variants of the existing GET / + POST /read that:
//   - explicitly filter on channel='in_app' (the worker only touches channel='email'
//     rows, but this keeps the fetch path scoped even if other channels are added)
//   - return unread only (read_at IS NULL)
//   - return the structured `payload` so a richer UI can render title/body/href.
// The legacy GET / + POST /read paths above stay unchanged.

router.get('/in-app', requireUser, async (req: any, res) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, title, content, payload, created_at')
      .eq('user_id', req.user.userId)
      .eq('channel', 'in_app')
      .is('read_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Mark one in-app row read. Scoped to the caller's user_id so a stray id from a
// different user is a no-op (eq on user_id excludes it).
router.post('/in-app/:id/read', requireUser, async (req: any, res) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString(), is_read: true })
      .eq('id', req.params.id)
      .eq('user_id', req.user.userId)
      .eq('channel', 'in_app');
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
