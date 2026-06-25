import { Router } from 'express';
import { supabase } from '../shared/supabase';
import { provisionInvitee } from '../shared/provisioning';
import { sendTrustedIndividualInvite } from '../shared/notification-emails';

const router = Router();

// Session auth. Identity comes from the OAuth session (never a client header).
// req.user.userId is the INTERNAL profiles.user_id used for all queries.
// req.user.guid is the PUBLIC handle; the frontend sends it back and we match it
// for ownership on every write (see assertGuid).
const requireUser = (req: any, res: any, next: any) => {
  const u = req.user;
  if (!req.isAuthenticated?.() || !u?.userId || !u?.guid) {
    return res.status(401).json({ error: 'Unauthenticated or profile not provisioned' });
  }
  next();
};

// The guid the frontend sends with a write must match the session's guid.
// Returns false (and sends 403) on mismatch. A missing body guid is allowed —
// the session still authoritatively scopes every query to req.user.userId.
const assertGuid = (req: any, res: any): boolean => {
  const bodyGuid = req.body?.guid;
  if (bodyGuid && bodyGuid !== req.user.guid) {
    res.status(403).json({ error: 'GUID does not match the authenticated user' });
    return false;
  }
  return true;
};

// ═══════════════════════════════════════════════════════
// Notifications  (notification_settings, keyed by user_id)
// ═══════════════════════════════════════════════════════
const TOGGLES = ['check_in_reminders', 'family_activity', 'product_updates'] as const;
const DEFAULTS = { check_in_reminders: true, family_activity: true, product_updates: false };

router.get('/notifications', requireUser, async (req: any, res) => {
  try {
    const { data, error } = await supabase
      .from('notification_settings')
      .select('check_in_reminders, family_activity, product_updates')
      .eq('user_id', req.user.userId)
      .maybeSingle();
    if (error) throw error;
    res.json(data || DEFAULTS);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/notifications', requireUser, async (req: any, res) => {
  if (!assertGuid(req, res)) return;
  try {
    const updates: Record<string, boolean> = {};
    for (const key of TOGGLES) {
      if (typeof req.body?.[key] === 'boolean') updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid notification settings provided' });
    }

    const cols = 'check_in_reminders, family_activity, product_updates';
    const { data: existing } = await supabase
      .from('notification_settings')
      .select('id')
      .eq('user_id', req.user.userId)
      .maybeSingle();

    let row;
    if (existing) {
      const { data, error } = await supabase
        .from('notification_settings')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('user_id', req.user.userId)
        .select(cols)
        .single();
      if (error) throw error;
      row = data;
    } else {
      const { data, error } = await supabase
        .from('notification_settings')
        .insert({
          user_id: req.user.userId,
          name: req.user.name || req.user.email,
          email: req.user.email,
          ...updates,
        })
        .select(cols)
        .single();
      if (error) throw error;
      row = data;
    }
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
// Account  (profiles)
// ═══════════════════════════════════════════════════════
router.get('/account', requireUser, async (req: any, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('first_name, last_name, email, role')
      .eq('user_id', req.user.userId)
      .single();
    if (error) throw error;
    res.json({
      firstName: data.first_name,
      lastName: data.last_name,
      email: data.email,
      role: data.role,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/account', requireUser, async (req: any, res) => {
  if (!assertGuid(req, res)) return;
  try {
    const updates: Record<string, string> = {};
    if (typeof req.body?.firstName === 'string') updates.first_name = req.body.firstName.trim();
    if (typeof req.body?.lastName === 'string') updates.last_name = req.body.lastName.trim();
    // Email is the login identity and is not editable here.
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No editable account fields provided' });
    }
    const { data, error } = await supabase
      .from('profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('user_id', req.user.userId)
      .select('first_name, last_name, email, role')
      .single();
    if (error) throw error;
    res.json({ firstName: data.first_name, lastName: data.last_name, email: data.email, role: data.role });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
// Guide  (guides + check_in_settings + chosen Trusted Individuals)
// ═══════════════════════════════════════════════════════
const LOCK_MODES = ['checkin', 'manual', 'open'];
const INTERVALS = [3, 6, 12];

const loadGuide = async (userId: string) => {
  const { data, error } = await supabase
    .from('guides')
    .select('id, is_locked, lock_mode, completion_percentage, primary_ti_member_id, secondary_ti_member_id')
    .eq('parent_user_id', userId)
    .single();
  if (error) throw error;
  return data;
};

router.get('/guide', requireUser, async (req: any, res) => {
  try {
    const guide = await loadGuide(req.user.userId);
    const { data: cis } = await supabase
      .from('check_in_settings')
      .select('interval_months, next_due_at')
      .eq('guide_id', guide.id)
      .maybeSingle();
    res.json({
      isLocked: guide.is_locked,
      lockMode: guide.lock_mode,
      completion: guide.completion_percentage,
      primaryTiMemberId: guide.primary_ti_member_id,
      secondaryTiMemberId: guide.secondary_ti_member_id,
      intervalMonths: cis?.interval_months ?? 6,
      nextDueAt: cis?.next_due_at ?? null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/guide', requireUser, async (req: any, res) => {
  if (!assertGuid(req, res)) return;
  try {
    const guide = await loadGuide(req.user.userId);

    // ── guides columns (lock + chosen trusted individuals) ──
    const gUpdates: Record<string, any> = {};
    if (typeof req.body?.isLocked === 'boolean') gUpdates.is_locked = req.body.isLocked;
    if (typeof req.body?.lockMode === 'string') {
      if (!LOCK_MODES.includes(req.body.lockMode)) return res.status(400).json({ error: 'Invalid lockMode' });
      gUpdates.lock_mode = req.body.lockMode;
    }
    if ('primaryTiMemberId' in (req.body || {})) gUpdates.primary_ti_member_id = req.body.primaryTiMemberId || null;
    if ('secondaryTiMemberId' in (req.body || {})) gUpdates.secondary_ti_member_id = req.body.secondaryTiMemberId || null;
    if (Object.keys(gUpdates).length > 0) {
      gUpdates.updated_at = new Date().toISOString();
      const { error } = await supabase.from('guides').update(gUpdates).eq('id', guide.id);
      if (error) throw error;
    }

    // A newly designated trusted individual gets an invited account.
    const tiIds = [gUpdates.primary_ti_member_id, gUpdates.secondary_ti_member_id].filter(Boolean);
    for (const tiId of tiIds) {
      const { data: fm } = await supabase.from('family_members').select('email, display_name').eq('id', tiId).maybeSingle();
      if (fm?.email) {
        const uid = await provisionInvitee(fm.email, fm.display_name);
        if (uid) await supabase.from('family_members').update({ member_guid: uid }).eq('id', tiId);
      }
    }

    // Email any TI slot that was just NEWLY designated (skip when the same person is
    // re-saved, or when a slot is being cleared). Mirrors the email sent at the end
    // of parent onboarding. Best-effort — a delivery hiccup doesn't fail the PATCH.
    const newlyDesignatedTiIds: string[] = [];
    if ('primaryTiMemberId' in (req.body || {}) && gUpdates.primary_ti_member_id && gUpdates.primary_ti_member_id !== guide.primary_ti_member_id) {
      newlyDesignatedTiIds.push(gUpdates.primary_ti_member_id);
    }
    if ('secondaryTiMemberId' in (req.body || {}) && gUpdates.secondary_ti_member_id && gUpdates.secondary_ti_member_id !== guide.secondary_ti_member_id) {
      newlyDesignatedTiIds.push(gUpdates.secondary_ti_member_id);
    }
    if (newlyDesignatedTiIds.length > 0) {
      const { data: parent } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('user_id', req.user.userId)
        .maybeSingle();
      const parentFirst = parent?.first_name?.trim() || 'Your family member';
      const parentFull = `${parent?.first_name || ''} ${parent?.last_name || ''}`.trim() || parentFirst;
      const loginUrl = `${process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000'}/login`;
      for (const tiId of newlyDesignatedTiIds) {
        const { data: fm } = await supabase.from('family_members').select('email').eq('id', tiId).maybeSingle();
        if (fm?.email) {
          sendTrustedIndividualInvite({
            to: fm.email,
            parentFirstName: parentFirst,
            parentFullName: parentFull,
            loginUrl,
          }).catch(() => {});
        }
      }
    }

    // ── check-in cadence ──
    if (req.body?.intervalMonths != null) {
      const months = Number(req.body.intervalMonths);
      if (!INTERVALS.includes(months)) return res.status(400).json({ error: 'Invalid intervalMonths' });
      const next = new Date();
      next.setMonth(next.getMonth() + months);
      const { error } = await supabase
        .from('check_in_settings')
        .upsert(
          { guide_id: guide.id, interval_months: months, next_due_at: next.toISOString(), updated_at: new Date().toISOString() },
          { onConflict: 'guide_id' }
        );
      if (error) throw error;
    }

    // Return the fresh combined state.
    const fresh = await loadGuide(req.user.userId);
    const { data: cis } = await supabase
      .from('check_in_settings')
      .select('interval_months, next_due_at')
      .eq('guide_id', fresh.id)
      .maybeSingle();
    res.json({
      isLocked: fresh.is_locked,
      lockMode: fresh.lock_mode,
      completion: fresh.completion_percentage,
      primaryTiMemberId: fresh.primary_ti_member_id,
      secondaryTiMemberId: fresh.secondary_ti_member_id,
      intervalMonths: cis?.interval_months ?? 6,
      nextDueAt: cis?.next_due_at ?? null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
// Check-in  (manual "I'm OK" — advances next_due_at + logs to access_events)
// ═══════════════════════════════════════════════════════
// Two callers:
//   1. The PARENT themselves (no body) — resolves their own guide via the session.
//   2. A TRUSTED INDIVIDUAL ({ parentUserId }) — checks in ON BEHALF OF that parent.
//      The TI status is verified by walking family_members → guides.primary/secondary_ti_member_id
//      (same shape used by /relationships/parent-guides), so we can't accept a TI's
//      claim about being a TI — we re-prove it from the same source of truth.
router.post('/checkin', requireUser, async (req: any, res) => {
  if (!assertGuid(req, res)) return;
  try {
    const onBehalfOfParentUserId = typeof req.body?.parentUserId === 'string' ? req.body.parentUserId : null;
    const isOnBehalfOf = !!onBehalfOfParentUserId && onBehalfOfParentUserId !== req.user.userId;

    let guide: { id: string };
    let auditSource: 'manual_dashboard' | 'trusted_individual';

    if (isOnBehalfOf) {
      // Verify the session user is a Trusted Individual for this parent. Mirrors
      // the authorization model in relationships/routes.ts so the two surfaces
      // stay in agreement about who can act on whose guide.
      const { data: g, error: gErr } = await supabase
        .from('guides')
        .select('id, primary_ti_member_id, secondary_ti_member_id')
        .eq('parent_user_id', onBehalfOfParentUserId)
        .maybeSingle();
      if (gErr) throw gErr;
      if (!g) return res.status(404).json({ error: 'No guide for that parent.' });

      const myEmail = (req.user.email || '').toLowerCase();
      if (!myEmail) return res.status(403).json({ error: 'Caller has no email — cannot verify TI status.' });
      const { data: fams } = await supabase
        .from('family_members')
        .select('id')
        .eq('parent_guid', onBehalfOfParentUserId)
        .ilike('email', myEmail);
      const myFamIds = new Set((fams || []).map((f) => f.id));
      const isTI =
        (g.primary_ti_member_id && myFamIds.has(g.primary_ti_member_id)) ||
        (g.secondary_ti_member_id && myFamIds.has(g.secondary_ti_member_id));
      if (!isTI) return res.status(403).json({ error: 'You’re not a Trusted Individual for this parent.' });

      guide = { id: g.id };
      auditSource = 'trusted_individual';
    } else {
      const g = await loadGuide(req.user.userId);
      guide = { id: g.id };
      auditSource = 'manual_dashboard';
    }

    const { data: cis } = await supabase
      .from('check_in_settings')
      .select('interval_months')
      .eq('guide_id', guide.id)
      .maybeSingle();
    const months = cis?.interval_months ?? 6;

    const now = new Date();
    const next = new Date(now);
    next.setMonth(next.getMonth() + months); // reset by the user's cadence preference

    const { error: cisErr } = await supabase
      .from('check_in_settings')
      .upsert(
        {
          guide_id: guide.id,
          interval_months: months,
          parent_response_at: now.toISOString(),
          next_due_at: next.toISOString(),
          updated_at: now.toISOString(),
        },
        { onConflict: 'guide_id' }
      );
    if (cisErr) throw cisErr;

    // Audit log: who actually checked in (the session user — TI or parent) on
    // which guide. `source` distinguishes the two paths for future reporting.
    await supabase.from('access_events').insert({
      guide_id: guide.id,
      triggered_by_user_id: req.user.userId,
      event_type: 'checkin_responded',
      metadata: { source: auditSource, ...(isOnBehalfOf ? { onBehalfOfParentUserId } : {}) },
    });

    res.json({ nextDueAt: next.toISOString(), intervalMonths: months, checkedInAt: now.toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
// Family members  (options for the Trusted Individual pickers)
// ═══════════════════════════════════════════════════════
router.get('/family', requireUser, async (req: any, res) => {
  try {
    const { data, error } = await supabase
      .from('family_members')
      .select('id, display_name, relationship, email, phone, notify')
      .eq('parent_guid', req.user.userId)
      .order('created_at');
    if (error) throw error;
    res.json(data || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /family — add a new family member. Used by surfaces like Final Wishes →
// "Add someone new" when picking from contacts: a person who isn't already on
// the parent's roster gets added with relationship='friend' (the safe default)
// and shows up in the family & friends section everywhere else automatically.
// Caller can override the relationship or notify default in the body.
router.post('/family', requireUser, async (req: any, res) => {
  try {
    const display_name = String(req.body?.display_name || '').trim();
    if (!display_name) return res.status(400).json({ error: 'display_name is required' });

    const email = req.body?.email ? String(req.body.email).trim() : null;
    const phone = req.body?.phone ? String(req.body.phone).trim() : null;
    const relationship = (req.body?.relationship ? String(req.body.relationship).trim().toLowerCase() : 'friend') || 'friend';
    // Default notify=true at the column level; only honor an explicit false
    // when the caller passes it. Most paths shouldn't override.
    const notify = req.body?.notify === false ? false : true;

    const { data, error } = await supabase
      .from('family_members')
      .insert({
        parent_guid: req.user.userId,
        display_name,
        email,
        phone,
        relationship,
        notify,
      })
      .select('id, display_name, relationship, email, phone, notify')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /family/:id — update a family member. Today only the notify field is
// patchable; extend the if-undefined chain when other editable columns are
// added (display_name, email, phone, relationship). Caller must own the row
// (enforced by the parent_guid match on the update).
router.patch('/family/:id', requireUser, async (req: any, res) => {
  try {
    const id = req.params.id;
    const updates: Record<string, any> = {};
    if (typeof req.body?.notify === 'boolean') updates.notify = req.body.notify;
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'no patchable fields provided' });
    }
    const { data, error } = await supabase
      .from('family_members')
      .update(updates)
      .eq('id', id)
      .eq('parent_guid', req.user.userId)
      .select('id, display_name, relationship, email, phone, notify')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
// Progress  (which guide sections have been started — drives the dashboard)
// ═══════════════════════════════════════════════════════
router.get('/progress', requireUser, async (req: any, res) => {
  try {
    const { data: guide } = await supabase
      .from('guides')
      .select('id')
      .eq('parent_user_id', req.user.userId)
      .maybeSingle();
    if (!guide) return res.json({ startedCount: 0, total: 7, started: [], tiles: [] });

    const { data: tilesRaw } = await supabase
      .from('tiles')
      .select('tile_type, status, completion_percentage, last_accessed_at')
      .eq('guide_id', guide.id)
      .order('last_accessed_at', { ascending: false });

    // Dedupe defensively by tile_type — keep the most recently accessed row
    // per tile. Belt: migration 20260613000001 added unique(guide_id, tile_type)
    // so this should never have to merge anything going forward, but stale
    // data from before the migration could still be lying around at read time.
    const byType = new Map<string, any>();
    for (const t of (tilesRaw || [])) {
      if (!byType.has(t.tile_type)) byType.set(t.tile_type, t);
    }
    const tiles = Array.from(byType.values());

    const started = tiles.filter((t) => t.status && t.status !== 'not_started');
    res.json({
      startedCount: started.length,
      total: 7,
      started: started.map((t) => t.tile_type),
      tiles,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
