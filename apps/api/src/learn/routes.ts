import { Router } from 'express';
import { supabase } from '../shared/supabase';

const router = Router();

// GET /videos
// Returns all learn_videos where is_active = true
// Ordered by category, display_order
router.get('/videos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('learn_videos')
      .select('video_path, duration_seconds, title, description, category, document_type')
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('display_order', { ascending: true });

    if (error) throw error;

    res.json(data);
  } catch (err: any) {
    console.error('Fetch learn videos error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
