import { Router } from 'express';
import passport from 'passport';
import { supabase } from '../shared/supabase';
import type { SessionUser } from './passport';

const router = Router();

const webBase = () => process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000';

// Capture signup intent (trial / invite token) before redirecting to the OAuth
// provider. The cookie is set on the API origin, so it survives the round-trip and
// is readable in the callback (a web-origin cookie would not be sent to the API).
function captureIntent(req: any, res: any, next: any) {
  if (req.query.intent === 'trial') {
    res.cookie('lb_intent', 'trial', { maxAge: 10 * 60 * 1000, httpOnly: true });
  }
  if (typeof req.query.invite === 'string' && req.query.invite) {
    res.cookie('lb_invite', req.query.invite, { maxAge: 30 * 60 * 1000, httpOnly: true });
  }
  next();
}

// Make sure an incomplete user has a guide for onboarding data to attach to.
async function ensureGuide(userId: string) {
  const { data } = await supabase.from('guides').select('id').eq('parent_user_id', userId).maybeSingle();
  if (!data) {
    await supabase.from('guides').insert({ parent_user_id: userId });
  }
}

// Accept a guide invitation: mark it accepted and link the new guide owner to the
// inviter via the relationships table. Default: the invitee is the new parent/guide
// owner and the inviter is their relative (child).
async function acceptInvite(token: string, inviteeUserId: string) {
  const { data: invite } = await supabase
    .from('invites')
    .select('id, inviter_user_id, invitee_role, relationship')
    .eq('token', token)
    .eq('status', 'pending')
    .maybeSingle();
  if (!invite || invite.inviter_user_id === inviteeUserId) return;

  await supabase
    .from('invites')
    .update({ status: 'accepted', accepted_by_user_id: inviteeUserId, accepted_at: new Date().toISOString() })
    .eq('id', invite.id);

  const inviteeIsChild = invite.invitee_role === 'child' || (invite.relationship || '').toLowerCase() === 'child';
  const parentId = inviteeIsChild ? invite.inviter_user_id : inviteeUserId;
  const childId = inviteeIsChild ? inviteeUserId : invite.inviter_user_id;
  if (parentId === childId) return;

  const { data: existing } = await supabase
    .from('relationships')
    .select('id')
    .eq('parent_user_id', parentId)
    .eq('child_user_id', childId)
    .maybeSingle();
  if (!existing) {
    await supabase.from('relationships').insert({
      parent_user_id: parentId,
      child_user_id: childId,
      status: 'active',
      accepted_at: new Date().toISOString(),
    });
  }
}

// Same "immediate family" set the /relationships/parent-guides endpoint uses to
// decide what shows up on the child overview. Kept in sync deliberately so the
// landing decision can't disagree with what the destination page would actually
// render.
const IMMEDIATE_FOR_LANDING = ['son', 'daughter', 'spouse'];

// Is the user meaningfully part of someone ELSE's guide? Immediate family
// (son/daughter/spouse) or a designated trusted individual on some guide.
// Other relationships (brother, friend, neighbor, etc.) don't count — they have
// no surface on the child overview anyway, so landing them there would just
// show "you're not part of anyone's guide yet".
async function isLinkedToAnotherGuide(userEmail: string): Promise<boolean> {
  const email = (userEmail || '').toLowerCase();
  if (!email) return false;

  const { data: fams } = await supabase
    .from('family_members')
    .select('id, parent_guid, relationship')
    .ilike('email', email);
  if (!fams || fams.length === 0) return false;

  const ownerIds = Array.from(new Set(fams.map((f) => f.parent_guid)));
  for (const ownerId of ownerIds) {
    const myRows = fams.filter((f) => f.parent_guid === ownerId);
    const isImmediate = myRows.some((r) =>
      IMMEDIATE_FOR_LANDING.includes((r.relationship || '').toLowerCase())
    );
    if (isImmediate) return true;

    // TI check: is any of MY family_members ids referenced as a TI slot on the
    // guide owned by this ownerId?
    const myIds = new Set(myRows.map((r) => r.id));
    const { data: guide } = await supabase
      .from('guides')
      .select('primary_ti_member_id, secondary_ti_member_id')
      .eq('parent_user_id', ownerId)
      .maybeSingle();
    const isTI = !!guide && (
      (guide.primary_ti_member_id && myIds.has(guide.primary_ti_member_id)) ||
      (guide.secondary_ti_member_id && myIds.has(guide.secondary_ti_member_id))
    );
    if (isTI) return true;
  }
  return false;
}

// After a successful login: everyone gets their own guide and lands in it. The guide
// is read-only until they pay (payment is the gate, not onboarding) — onboarding is
// walked through AFTER the first payment, enforced by the dashboard/onboarding layouts.
// Invited children/TIs are the exception: they land on "My Parent's Guide".
async function landAfterLogin(req: any, res: any) {
  const user = req.user as SessionUser;
  const base = webBase();

  if (user?.userId) {
    // Everyone (children included) gets their own guide — read-only until they pay.
    try {
      await ensureGuide(user.userId);
    } catch (e: any) {
      console.error('[Auth] ensureGuide failed:', e?.message);
    }

    // Trial intent → flag the account (kept for the "free trial" CTA; read-only is now
    // driven purely by subscription state, so this flag no longer gates anything).
    if (req.cookies?.lb_intent === 'trial' && !user.isTrial) {
      try {
        await supabase.from('profiles').update({ is_trial: true, updated_at: new Date().toISOString() }).eq('user_id', user.userId);
        user.isTrial = true;
        if ((req.session as any)?.passport?.user) (req.session as any).passport.user.isTrial = true;
      } catch (e: any) {
        console.error('[Auth] set trial failed:', e?.message);
      }
    }
    if (req.cookies?.lb_intent) res.clearCookie('lb_intent');

    // Invite acceptance → link the new guide owner to the inviter.
    if (req.cookies?.lb_invite) {
      try {
        await acceptInvite(req.cookies.lb_invite, user.userId);
      } catch (e: any) {
        console.error('[Auth] accept invite failed:', e?.message);
      }
      res.clearCookie('lb_invite');
    }
  }

  // A pending invite takes priority: the multi-step invite-flow page has to finish
  // before the user has a complete relationship row.
  if (user?.inviteFlowStatus === 'pending') return res.redirect(`${base}/invite-flow`);

  // Everyone else lands at /dashboard unless they're ACTUALLY linked to someone
  // else's guide right now. Using live DB state (family_members + guides TI slots)
  // instead of the historical inviteFlowStatus flag: a user whose linkage was
  // never created, or was later removed, lands at their own guide where there's
  // something to do — not at the child overview that would just say "you're not
  // part of anyone's guide yet."
  let landAtChildOverview = false;
  if (user?.email) {
    try {
      landAtChildOverview = await isLinkedToAnotherGuide(user.email);
    } catch (e: any) {
      console.error('[Auth] link check failed; falling back to inviteFlowStatus:', e?.message);
      landAtChildOverview = user.inviteFlowStatus === 'completed';
    }
  }
  if (landAtChildOverview) return res.redirect(`${base}/dashboard/child/overview`);

  // Their own guide. Dashboard layout decides read-only (unpaid) vs. post-payment
  // onboarding vs. full read-write from the session's subscriptionActive.
  const dest = `${base}/dashboard`;
  if (req.session?.save) req.session.save(() => res.redirect(dest));
  else res.redirect(dest);
}

router.get('/test', (req, res) => res.json({ authenticated: req.isAuthenticated() }));

// ─── Google ───────────────────────────────────────────
router.get('/google', captureIntent, passport.authenticate('google', {
  scope: ['profile', 'email'],
  accessType: 'offline',
  prompt: 'consent',
} as any));

router.get('/google/callback',
  (req, res, next) => passport.authenticate('google', {
    failureRedirect: `${webBase()}/login?error=google_failed`,
  })(req, res, next),
  (req, res) => landAfterLogin(req, res),
);

// ─── Microsoft ────────────────────────────────────────
router.get('/microsoft', captureIntent, passport.authenticate('microsoft', {
  prompt: 'select_account',
} as any));

router.get('/microsoft/callback', (req, res, next) => {
  passport.authenticate('microsoft', (err: any, user: any, info: any) => {
    if (err || !user) {
      console.error('[Auth] Microsoft sign-in failed:', JSON.stringify({
        err: err?.message || err,
        oauthError: err?.oauthError?.data || err?.oauthError,
        info,
        query: req.query,
      }, null, 2));
      return res.redirect(`${webBase()}/login?error=microsoft_failed`);
    }
    req.logIn(user, (loginErr) => {
      if (loginErr) {
        console.error('[Auth] Microsoft req.logIn failed:', loginErr);
        return res.redirect(`${webBase()}/login?error=microsoft_failed`);
      }
      return landAfterLogin(req, res);
    });
  })(req, res, next);
});

// Calculated: does the user have an ACTIVE, unexpired subscription? Drives the
// guide's read-only mode — a free/lapsed/past-due account can read but not edit.
async function hasActiveSubscription(userId: string): Promise<boolean> {
  if (!userId) return false;
  const { data } = await supabase
    .from('subscriptions')
    .select('expires_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return false;
  return !data.expires_at || new Date(data.expires_at) > new Date();
}

// ─── Session helpers ──────────────────────────────────
router.get('/me', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthenticated' });
  // Never expose the internal user_id. The frontend works off the public guid.
  const { userId, ...publicUser } = (req.user || {}) as any;
  let subscriptionActive = false;
  try {
    subscriptionActive = await hasActiveSubscription(userId);
  } catch (e: any) {
    console.error('[Auth] subscriptionActive check failed:', e?.message);
  }
  res.json({ user: { ...publicUser, subscriptionActive } });
});

router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.json({ success: true });
  });
});

export default router;
