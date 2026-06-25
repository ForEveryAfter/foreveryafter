// Email worker endpoint. pg_cron fires every minute → pg_net POSTs here with the
// shared secret → we drain up to 25 pending `notifications` rows by calling the
// existing sendEmail() (Resend, key from .env). No secrets in Postgres beyond the
// worker secret itself.
//
// Why this isn't a simple setInterval inside the API: pg_cron lives in the DB, so
// the schedule survives API redeploys and Supabase shows you the cron history
// — but the WORK still runs in TypeScript where Resend, templates, and logs
// already live.

import { Router } from 'express';
import { supabase } from '../shared/supabase';
import { sendEmail } from '../shared/email';

const router = Router();

const WORKER_SECRET = process.env.WORKER_SECRET || '';
const BATCH_SIZE = 25;

// Bare-minimum guard. Same pattern as the check-in monitor endpoint.
router.post('/drain-emails', async (req, res) => {
  const supplied = req.headers['x-worker-secret'];
  if (!WORKER_SECRET || supplied !== WORKER_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Claim atomically: each row we flip to 'processing' is ours.
    // (Postgres-style FOR UPDATE SKIP LOCKED isn't exposed by PostgREST, but the
    //  same effect comes from: select pending → conditional update with `.eq('status', 'pending')`.
    //  Concurrent calls might pick the same row id, but only one wins the
    //  conditional update and only that one will then call Resend.)
    const { data: rows } = await supabase
      .from('notifications')
      .select('id, payload')
      .eq('channel', 'email')
      .eq('status', 'pending')
      .order('created_at')
      .limit(BATCH_SIZE);

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const r of rows ?? []) {
      // Race-safe claim: only flip if it's still pending.
      const claim = await supabase
        .from('notifications')
        .update({ status: 'processing' })
        .eq('id', r.id)
        .eq('status', 'pending')
        .select('id');
      if (!claim.data || claim.data.length === 0) {
        // Another concurrent worker already claimed it — skip.
        skipped++;
        continue;
      }

      const p: any = r.payload || {};
      if (!p.to || !p.subject) {
        await supabase.from('notifications').update({
          status: 'failed',
          error: 'payload missing to/subject',
          sent_at: new Date().toISOString(),
        }).eq('id', r.id);
        failed++;
        continue;
      }

      const result = await sendEmail({
        to: p.to,
        subject: p.subject,
        text: p.text || '',
        html: p.html,
        replyTo: p.replyTo,
      });

      await supabase.from('notifications').update({
        status: result.sent ? 'done' : 'failed',
        error: result.sent ? null : (result.reason || 'send_failed'),
        sent_at: new Date().toISOString(),
      }).eq('id', r.id);

      if (result.sent) sent++;
      else failed++;
    }

    res.json({ scanned: rows?.length ?? 0, sent, failed, skipped });
  } catch (err: any) {
    console.error('[workers/drain-emails] error:', err?.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
