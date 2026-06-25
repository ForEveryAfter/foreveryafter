import { Router } from 'express';
import { supabase } from '../shared/supabase';
import { enqueueNotification } from '../shared/notifications-queue';
import { executeRelease } from './core';
import { RELEASE_HOLD_HOURS, CHECKIN_MONITOR_SECRET } from './config';
import {
  releaseRequestedEmailForGuideOwner,
  releaseRequestedInAppForGuideOwner,
  releaseRequestedEmailForOtherRep,
  releaseRequestedInAppForOtherRep,
  type ReleaseRequestedCtx,
} from './notification-templates';

const router = Router();

// Same session-auth pattern as the rest of the API. Structured so a per-route
// TR check (assertCallerIsTR) can layer on top; auth itself uses req.user.userId
// from passport — there is no `dev-profile-001` pattern in this codebase, so the
// spec's note about that doesn't apply here. (Confirmed by greping the repo.)
const requireUser = (req: any, res: any, next: any) => {
  if (!req.isAuthenticated?.() || !req.user?.userId) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }
  next();
};

type GuideRow = {
  id: string;
  parent_user_id: string;
  primary_ti_member_id: string | null;
  secondary_ti_member_id: string | null;
  release_status: string | null;
  release_executes_at: string | null;
  released_at: string | null;
};

// Load a guide and check whether the caller is a designated Trusted Representative
// for it. Returns null when not found; { isTR } describes the caller's authority.
async function loadGuideAndTRStatus(guideId: string, callerUserId: string, callerEmail: string): Promise<{ guide: GuideRow; isTR: boolean } | null> {
  const { data: guide } = await supabase
    .from('guides')
    .select('id, parent_user_id, primary_ti_member_id, secondary_ti_member_id, release_status, release_executes_at, released_at')
    .eq('id', guideId)
    .maybeSingle();
  if (!guide) return null;

  // The caller is a TR iff a family_members row designated as primary or secondary
  // ti for this guide matches the caller (by email, the auth identity).
  const { data: mine } = await supabase
    .from('family_members')
    .select('id')
    .eq('parent_guid', guide.parent_user_id)
    .ilike('email', callerEmail || '___no_match___');
  const myIds = new Set((mine || []).map((m) => m.id));
  const isTR =
    (!!guide.primary_ti_member_id && myIds.has(guide.primary_ti_member_id)) ||
    (!!guide.secondary_ti_member_id && myIds.has(guide.secondary_ti_member_id));

  return { guide: guide as GuideRow, isTR };
}

// ─── GET /release/:guideId/status — TR-only ──────────────────────────────────────
router.get('/:guideId/status', requireUser, async (req: any, res) => {
  try {
    const loaded = await loadGuideAndTRStatus(req.params.guideId, req.user.userId, (req.user.email || '').toLowerCase());
    if (!loaded) return res.status(404).json({ error: 'Guide not found' });
    if (!loaded.isTR) return res.status(403).json({ error: 'Only a trusted individual can view this.' });
    const { data: ev } = await supabase
      .from('release_events')
      .select('id, status, requested_at, executes_at, executed_at, canceled_at')
      .eq('guide_id', loaded.guide.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    res.json({
      released: loaded.guide.release_status === 'released',
      releaseStatus: loaded.guide.release_status,
      releasedAt: loaded.guide.released_at,
      releaseExecutesAt: loaded.guide.release_executes_at,
      holdHours: RELEASE_HOLD_HOURS,
      event: ev || null,
    });
  } catch (err: any) {
    console.error('[Release] status error:', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /release/:guideId — TR-triggered release request (manual) ──────────────
// If RELEASE_HOLD_HOURS == 0, this calls executeRelease immediately. Otherwise it
// creates a 'pending' release_event and notifies the guide owner + the OTHER TR(s),
// and the check-in monitor will pick up the event once executes_at is in the past.
router.post('/:guideId', requireUser, async (req: any, res) => {
  try {
    const loaded = await loadGuideAndTRStatus(req.params.guideId, req.user.userId, (req.user.email || '').toLowerCase());
    if (!loaded) return res.status(404).json({ error: 'Guide not found' });
    if (!loaded.isTR) return res.status(403).json({ error: 'Only a trusted individual can release this guide.' });

    const { guide } = loaded;
    if (guide.release_status === 'released') {
      return res.status(409).json({ error: 'This guide has already been released.', released: true });
    }
    if (guide.release_status === 'release_pending') {
      return res.status(409).json({ error: 'A release is already pending for this guide.', pending: true });
    }

    const requestedAt = new Date();
    const executesAt = new Date(requestedAt.getTime() + RELEASE_HOLD_HOURS * 3_600_000);

    // Create the release_event row (partial unique blocks a concurrent second).
    const { data: event, error: evtError } = await supabase
      .from('release_events')
      .insert({
        guide_id: guide.id,
        reason: 'manual_trusted_rep',
        requested_by_profile_id: req.user.userId,
        status: 'pending',
        requested_at: requestedAt.toISOString(),
        executes_at: executesAt.toISOString(),
      })
      .select('id')
      .single();
    if (evtError) {
      // 23505 -> someone created one between our checks.
      if ((evtError as any).code === '23505') {
        return res.status(409).json({ error: 'A release is already pending for this guide.', pending: true });
      }
      throw evtError;
    }

    // Flip guide to 'release_pending'.
    await supabase
      .from('guides')
      .update({
        release_status: 'release_pending',
        release_reason: 'manual_trusted_rep',
        release_requested_at: requestedAt.toISOString(),
        release_executes_at: executesAt.toISOString(),
      })
      .eq('id', guide.id);

    // Hold == 0: execute now.
    if (RELEASE_HOLD_HOURS === 0) {
      const result = await executeRelease(guide.id, 'manual_trusted_rep', req.user.userId);
      return res.json({
        status: 'executed',
        releaseEventId: event.id,
        executedAt: new Date().toISOString(),
        refundCents: result.refundCents ?? null,
      });
    }

    // Hold > 0: notify owner (cancel link) + other TR(s); leave for monitor.
    await enqueueRequestedNotifications(guide, event.id, req.user.userId, executesAt.toISOString());

    res.json({
      status: 'pending',
      releaseEventId: event.id,
      executesAt: executesAt.toISOString(),
      holdHours: RELEASE_HOLD_HOURS,
    });
  } catch (err: any) {
    console.error('[Release] trigger error:', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /release/:guideId/cancel — guide owner only, during hold window ────────
router.post('/:guideId/cancel', requireUser, async (req: any, res) => {
  try {
    const { data: guide } = await supabase
      .from('guides')
      .select('id, parent_user_id, release_status')
      .eq('id', req.params.guideId)
      .maybeSingle();
    if (!guide) return res.status(404).json({ error: 'Guide not found' });
    if (guide.parent_user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Only the guide owner can cancel a release.' });
    }
    if (guide.release_status !== 'release_pending') {
      return res.status(409).json({ error: `Cannot cancel — release_status is ${guide.release_status}.` });
    }

    const nowIso = new Date().toISOString();
    await supabase
      .from('release_events')
      .update({ status: 'canceled', canceled_at: nowIso, canceled_by_profile_id: req.user.userId })
      .eq('guide_id', guide.id)
      .eq('status', 'pending');
    await supabase
      .from('guides')
      .update({ release_status: 'release_canceled', release_requested_at: null, release_executes_at: null })
      .eq('id', guide.id);

    res.json({ status: 'canceled' });
  } catch (err: any) {
    console.error('[Release] cancel error:', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /release/internal/execute-due — check-in monitor entrypoint ────────────
// Shared-secret guarded (NOT session-authed). The monitor calls this every minute
// (or whatever cadence) and we execute any pending events whose hold window has
// elapsed. This is the spec's "expose a stub the monitor can call."
router.post('/internal/execute-due', async (req, res) => {
  const supplied = req.headers['x-monitor-secret'];
  if (!CHECKIN_MONITOR_SECRET || supplied !== CHECKIN_MONITOR_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const { data: due } = await supabase
      .from('release_events')
      .select('id, guide_id, reason')
      .eq('status', 'pending')
      .lte('executes_at', new Date().toISOString())
      .limit(50);

    let executed = 0;
    for (const ev of due || []) {
      try {
        const result = await executeRelease(
          ev.guide_id,
          (ev.reason as 'checkin_expired' | 'manual_trusted_rep') || 'checkin_expired',
          null
        );
        if (result.released) executed++;
      } catch (e: any) {
        console.error('[Release] monitor execute failed for event', ev.id, e?.message);
      }
    }
    res.json({ scanned: (due || []).length, executed });
  } catch (err: any) {
    console.error('[Release] internal execute-due error:', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────────
//  Helpers used by routes
// ────────────────────────────────────────────────────────────────────────────────

async function enqueueRequestedNotifications(
  guide: GuideRow,
  releaseEventId: string,
  triggeredByProfileId: string,
  executesAtIso: string
) {
  // Look up the guide owner for name + email + cancel URL.
  const { data: owner } = await supabase
    .from('profiles')
    .select('user_id, email, first_name, last_name')
    .eq('user_id', guide.parent_user_id)
    .maybeSingle();
  const ownerName = [owner?.first_name, owner?.last_name].filter(Boolean).join(' ').trim() || 'Your family member';
  const webBase = process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000';
  const ctx: ReleaseRequestedCtx = {
    guideOwnerName: ownerName,
    cancelUrl: `${webBase}/dashboard/payments?releaseCancel=${guide.id}`,
    executesAtIso,
  };

  // Owner — email + in_app with cancel link.
  if (owner?.email) {
    await enqueueNotification({
      userId: owner.user_id,
      type: 'release_requested_owner',
      channel: 'email',
      recipientRole: 'subscription_owner',
      stripeEventId: `release:${releaseEventId}:owner_email`,
      payload: { to: owner.email, ...releaseRequestedEmailForGuideOwner(ctx) },
    });
  }
  await enqueueNotification({
    userId: guide.parent_user_id,
    type: 'release_requested_owner',
    channel: 'in_app',
    recipientRole: 'subscription_owner',
    stripeEventId: `release:${releaseEventId}:owner_inapp`,
    payload: releaseRequestedInAppForGuideOwner(ctx),
  });

  // Other TR(s) — neutral.
  const tiMemberIds = [guide.primary_ti_member_id, guide.secondary_ti_member_id].filter((x): x is string => !!x);
  if (tiMemberIds.length) {
    const { data: members } = await supabase
      .from('family_members')
      .select('id, member_guid, email')
      .in('id', tiMemberIds);
    for (const m of members || []) {
      if (!m.member_guid || m.member_guid === triggeredByProfileId) continue;
      const repProfile = await supabase
        .from('profiles')
        .select('email')
        .eq('user_id', m.member_guid)
        .maybeSingle();
      const email = repProfile.data?.email || m.email;
      if (email) {
        await enqueueNotification({
          userId: m.member_guid,
          type: 'release_requested_other_rep',
          channel: 'email',
          recipientRole: 'trusted_representative',
          stripeEventId: `release:${releaseEventId}:otherrep_email_${m.member_guid}`,
          payload: { to: email, ...releaseRequestedEmailForOtherRep(ctx) },
        });
      }
      await enqueueNotification({
        userId: m.member_guid,
        type: 'release_requested_other_rep',
        channel: 'in_app',
        recipientRole: 'trusted_representative',
        stripeEventId: `release:${releaseEventId}:otherrep_inapp_${m.member_guid}`,
        payload: releaseRequestedInAppForOtherRep(ctx),
      });
    }
  }
}

export default router;
