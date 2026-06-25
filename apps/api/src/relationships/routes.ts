import { Router } from 'express';
import { supabase } from '../shared/supabase';

const router = Router();

const requireUser = (req: any, res: any, next: any) => {
  if (!req.isAuthenticated?.() || !req.user?.userId) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }
  next();
};

// Immediate family that should see a parent's guide. Other relationships (brother,
// friend, neighbor, etc.) are excluded unless they're a named trusted individual.
const IMMEDIATE = ['son', 'daughter', 'spouse'];

// GET /relationships/parent-guides — guides the logged-in user is part of, either as
// a trusted individual or immediate family. Shaped to the dashboard's ParentRelationship.
router.get('/parent-guides', requireUser, async (req: any, res) => {
  try {
    const myEmail = (req.user.email || '').toLowerCase();
    if (!myEmail) return res.json([]);

    // family_member rows that are me (matched by email, case-insensitive).
    const { data: fams } = await supabase
      .from('family_members')
      .select('id, parent_guid, relationship')
      .ilike('email', myEmail);
    if (!fams || fams.length === 0) return res.json([]);

    const ownerIds = Array.from(new Set(fams.map((f) => f.parent_guid)));
    const out: any[] = [];

    for (const ownerId of ownerIds) {
      const myRows = fams.filter((f) => f.parent_guid === ownerId);
      const myIds = new Set(myRows.map((r) => r.id));

      const { data: guide } = await supabase
        .from('guides')
        .select('id, primary_ti_member_id, secondary_ti_member_id, created_at, updated_at')
        .eq('parent_user_id', ownerId)
        .maybeSingle();

      const isChild = myRows.some((r) => ['son', 'daughter'].includes((r.relationship || '').toLowerCase()));
      const isImmediate = myRows.some((r) => IMMEDIATE.includes((r.relationship || '').toLowerCase()));
      const isTI = !!guide && (
        (guide.primary_ti_member_id && myIds.has(guide.primary_ti_member_id)) ||
        (guide.secondary_ti_member_id && myIds.has(guide.secondary_ti_member_id))
      );

      // Exclude non-immediate relationships that aren't a trusted individual.
      if (!isImmediate && !isTI) continue;

      const roles: string[] = [];
      if (isChild) roles.push('child');
      if (isTI) roles.push('trusted_rep');

      const { data: owner } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('user_id', ownerId)
        .maybeSingle();

      // Who currently pays for this guide? ('self' = the owner; else a payer's user_id.)
      // Also: is the guide's subscription active+unexpired? A TI can only release an
      // active guide — an expired/unpaid guide must be reactivated first.
      const { data: ownerSub } = await supabase
        .from('subscriptions')
        .select('billing_owner, status, expires_at')
        .eq('user_id', ownerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const isCurrentPayer = (ownerSub?.billing_owner || 'self') === req.user.userId;
      const guideSubscriptionActive =
        ownerSub?.status === 'active' && (!ownerSub.expires_at || new Date(ownerSub.expires_at) > new Date());

      let nextDue: string | null = null;
      let lastResp: string | null = null;
      if (guide) {
        const { data: cis } = await supabase
          .from('check_in_settings')
          .select('next_due_at, parent_response_at')
          .eq('guide_id', guide.id)
          .maybeSingle();
        nextDue = cis?.next_due_at ?? null;
        lastResp = cis?.parent_response_at ?? null;
      }
      const now = Date.now();
      const nextMs = nextDue ? new Date(nextDue).getTime() : now;
      const daysUntil = Math.ceil((nextMs - now) / 86_400_000);

      out.push({
        parentId: ownerId,
        guideId: guide?.id || null,
        parentFirstName: owner?.first_name || 'Your parent',
        parentLastName: owner?.last_name || '',
        roles,
        isCurrentPayer,
        guideSubscriptionActive: !!guideSubscriptionActive,
        designatedAt: '',
        status: {
          lastCheckInAt: lastResp || guide?.created_at || new Date().toISOString(),
          nextCheckInDueAt: nextDue || new Date().toISOString(),
          isOverdue: !!nextDue && nextMs < now,
          daysUntilNextCheckIn: daysUntil,
          secondTrustedRepExists: !!guide?.secondary_ti_member_id,
        },
        // Not yet backed by real tables — render as empty states for now.
        obituary: {
          parentWrittenContent: null, parentWrittenAt: null,
          aiDraftContent: null, aiDraftTone: null, aiDraftGeneratedAt: null,
          kidVersionContent: null, kidVersionUpdatedAt: null,
          photos: [], hasMemorialVideo: false,
        },
        parentGuide: { lastSavedAt: guide?.updated_at || new Date().toISOString(), askedQuestions: [] },
        pendingPaymentTransfers: [],
        pendingShareAcknowledgmentFromOtherTR: false,
      });
    }

    res.json(out);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
