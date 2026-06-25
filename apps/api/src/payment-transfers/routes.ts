import { Router } from 'express';
import { supabase } from '../shared/supabase';
import { stripe, isStripeConfigured } from '../shared/stripe';
import { sendEmail } from '../shared/email';
import {
  sendTakeoverRequestEmail,
  sendTakeoverRequestSms,
  takeoverRequestNotificationContent,
  sendTakeoverApprovedEmail,
  sendPaymentTakeoverCancelledEmail,
  takeoverCancelledNotificationContent,
} from '../shared/notification-emails';

const router = Router();

const webBase = () => process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000';

// Session-authed, scoped to the internal profiles.user_id (never a client header).
const requireUser = (req: any, res: any, next: any) => {
  if (!req.isAuthenticated?.() || !req.user?.userId) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }
  next();
};

// Immediate family allowed to ask to pay. Other relationships can't, unless they're a TI.
const IMMEDIATE = ['son', 'daughter', 'spouse'];

type GuideRow = {
  id: string;
  guid: string | null;
  parent_user_id: string;
  primary_ti_member_id: string | null;
  secondary_ti_member_id: string | null;
};

// Resolve a guide and the viewer's relationship to it (linked? owner? trusted individual?).
async function loadGuideContext(guideId: string, viewerUserId: string, viewerEmail: string) {
  const { data: guide } = await supabase
    .from('guides')
    .select('id, guid, parent_user_id, primary_ti_member_id, secondary_ti_member_id')
    .eq('id', guideId)
    .maybeSingle();
  if (!guide) return null;

  const { data: mine } = await supabase
    .from('family_members')
    .select('id, display_name, relationship')
    .eq('parent_guid', (guide as GuideRow).parent_user_id)
    .ilike('email', viewerEmail || '___no_match___');

  const myIds = new Set((mine || []).map((m) => m.id));
  const g = guide as GuideRow;
  const isOwner = g.parent_user_id === viewerUserId;
  const isImmediate = (mine || []).some((m) => IMMEDIATE.includes((m.relationship || '').toLowerCase()));
  const isTI =
    (!!g.primary_ti_member_id && myIds.has(g.primary_ti_member_id)) ||
    (!!g.secondary_ti_member_id && myIds.has(g.secondary_ti_member_id));
  const myDisplayName = (mine || [])[0]?.display_name || null;

  return { guide: g, isOwner, isImmediate, isTI, myDisplayName };
}

// All trusted-individual user_ids designated on a guide — primary + secondary.
// Empty if none yet. Each one is a profiles.user_id (read from family_members.member_guid).
async function tiUserIds(guide: GuideRow): Promise<string[]> {
  const memberIds = [guide.primary_ti_member_id, guide.secondary_ti_member_id]
    .filter((x): x is string => !!x);
  if (!memberIds.length) return [];
  const { data } = await supabase
    .from('family_members')
    .select('member_guid')
    .in('id', memberIds);
  return (data || []).map((r) => r.member_guid).filter((x): x is string => !!x);
}

// The guide owner's latest subscription — billing_owner ('self' = owner pays) + renewal date.
async function ownerSubscription(ownerUserId: string) {
  const { data } = await supabase
    .from('subscriptions')
    .select('id, billing_owner, status, expires_at, plan_type, coverage')
    .eq('user_id', ownerUserId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as {
    id: string;
    billing_owner: string | null;
    status: string;
    expires_at: string | null;
    plan_type: string | null;
    coverage: 'single' | 'both' | null;
  } | null;
}

// Allowed plan_type values the picker can choose from. Must stay in sync with the
// CHECK constraint on payment_transfer_requests.chosen_plan_type (see migration
// 20260610000000_takeover_chosen_plan.sql) and with subscriptions.plan_type.
const ALLOWED_PLAN_TYPES = new Set(['annual', 'five_year', 'ten_year', 'archive']);

// Email + phone for a person who is linked to a guide (the values live on the
// family_members row the guide owner created for them). Returns nulls if unknown so
// the caller can decide whether to email/SMS.
async function contactForGuide(userId: string, guideOwnerId: string): Promise<{ email: string | null; phone: string | null; name: string | null }> {
  const { data } = await supabase
    .from('family_members')
    .select('email, phone, display_name')
    .eq('parent_guid', guideOwnerId)
    .eq('member_guid', userId)
    .maybeSingle();
  return { email: data?.email || null, phone: data?.phone || null, name: data?.display_name || null };
}

// Public URLs the email/SMS deep-link to so the recipient can act.
const myParentsGuideUrl = () => `${process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000'}/dashboard/child/overview`;
const loginUrl = () => `${process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000'}/login`;

async function notify(userId: string | null, title: string, content: string) {
  if (!userId) return;
  await supabase.from('notifications').insert({ user_id: userId, title, content });
}

async function profileName(userId: string): Promise<string> {
  const { data } = await supabase.from('profiles').select('first_name, last_name').eq('user_id', userId).maybeSingle();
  return [data?.first_name, data?.last_name].filter(Boolean).join(' ').trim();
}

// Best-effort: detach a captured card from Stripe so it can never be charged again.
async function detachCard(pmId: string | null | undefined) {
  if (!pmId || !isStripeConfigured()) return;
  try {
    await stripe.paymentMethods.detach(pmId);
  } catch (e: any) {
    console.error('[PaymentTransfer] detach card failed:', e?.message);
  }
}

// Has this requester already got an in-flight (pending/approved) request for this guide?
async function inFlightFor(guideId: string, requesterUserId: string) {
  const { data } = await supabase
    .from('payment_transfer_requests')
    .select('id, status')
    .eq('guide_id', guideId)
    .eq('requester_user_id', requesterUserId)
    .in('status', ['pending', 'approved'])
    .maybeSingle();
  return data;
}

// ─── GET /payment-transfers/preview?guideId=:id ──────────────────────────────────
// Data the takeover plan-picker modal needs BEFORE the card-capture step: the
// parent's current plan + next billing date + spouse coverage, plus the catalog of
// plans the child can switch the takeover onto. Same eligibility checks as
// /checkout so we don't leak plan info to someone who couldn't take over anyway.
router.get('/preview', requireUser, async (req: any, res) => {
  try {
    const guideId = String(req.query?.guideId || '');
    if (!guideId) return res.status(400).json({ error: 'guideId is required' });

    const ctx = await loadGuideContext(guideId, req.user.userId, (req.user.email || '').toLowerCase());
    if (!ctx) return res.status(404).json({ error: 'Guide not found' });
    if (ctx.isOwner) return res.status(400).json({ error: 'You already own this guide.' });
    if (!ctx.isImmediate && !ctx.isTI) return res.status(403).json({ error: 'You are not linked to this guide.' });

    const sub = await ownerSubscription(ctx.guide.parent_user_id);
    if ((sub?.billing_owner || 'self') === req.user.userId) {
      return res.status(400).json({ error: 'You are already the payer for this guide.' });
    }

    // Parent's first name for the modal header ("Take over payments for Mary").
    const { data: parentProfile } = await supabase
      .from('profiles')
      .select('first_name')
      .eq('user_id', ctx.guide.parent_user_id)
      .maybeSingle();

    // Spouse name (cosmetic). We look it up regardless of current coverage so the
    // takeover picker can label the spouse toggle properly even when the parent's
    // sub is currently 'single' (e.g. "Add coverage for Mary"). When the parent has
    // no spouse in family_members the modal hides / fallbacks the row.
    let spouseName: string | null = null;
    {
      const { data: spouseRow } = await supabase
        .from('family_members')
        .select('display_name')
        .eq('parent_guid', ctx.guide.parent_user_id)
        .ilike('relationship', 'spouse')
        .maybeSingle();
      spouseName = spouseRow?.display_name || null;
    }

    // Plan catalog — identical to /billing/plans, copied here so the child can see
    // it without needing /billing access (their session may not have it).
    const { data: rawPlans } = await supabase
      .from('subscription_plans')
      .select('id, name, price_cents, spouse_addon_cents, period, features')
      .eq('is_active', true)
      .order('sort_order');
    const plans = (rawPlans || []).map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price_cents / 100,
      spouseAddon: p.spouse_addon_cents / 100,
      period: p.period,
      features: p.features ?? [],
    }));

    res.json({
      parentFirstName: parentProfile?.first_name || null,
      currentPlanType: sub?.plan_type || null,
      nextBillingAt: sub?.expires_at || null,
      coverage: (sub?.coverage as 'single' | 'both' | null) || 'single',
      spouseName,
      plans,
    });
  } catch (err: any) {
    console.error('[PaymentTransfer] preview error:', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /payment-transfers/checkout ─────────────────────────────────────────────
// Step 1 of a request: send the child/TI to Stripe to capture a card (setup mode, no
// charge). Eligibility is checked here; the request row itself is created on return
// (/finalize) once the card is captured.
router.post('/checkout', requireUser, async (req: any, res) => {
  if (!isStripeConfigured()) {
    return res.status(503).json({ error: 'Payments aren’t set up yet, so you can’t request a takeover right now.' });
  }
  try {
    const guideId = String(req.body?.guideId || '');
    if (!guideId) return res.status(400).json({ error: 'guideId is required' });

    const ctx = await loadGuideContext(guideId, req.user.userId, (req.user.email || '').toLowerCase());
    if (!ctx) return res.status(404).json({ error: 'Guide not found' });
    if (ctx.isOwner) return res.status(400).json({ error: 'You already own this guide.' });
    if (!ctx.isImmediate && !ctx.isTI) return res.status(403).json({ error: 'You are not linked to this guide.' });

    const sub = await ownerSubscription(ctx.guide.parent_user_id);
    if ((sub?.billing_owner || 'self') === req.user.userId) {
      return res.status(400).json({ error: 'You are already the payer for this guide.' });
    }
    if (await inFlightFor(guideId, req.user.userId)) {
      return res.status(409).json({ error: 'You already have a request in progress for this guide.' });
    }

    // Optional planType: the child chose a different plan in the picker. Empty / unset =
    // keep the parent's existing plan. We validate against the same set used by the
    // CHECK constraint so a typo (or stale client) gets a clean 400 here instead of
    // a DB error in /finalize.
    const rawPlanType = req.body?.planType;
    let planType: string | null = null;
    if (rawPlanType != null && rawPlanType !== '') {
      const candidate = String(rawPlanType).replace(/-/g, '_');
      if (!ALLOWED_PLAN_TYPES.has(candidate)) {
        return res.status(400).json({ error: 'Unknown plan' });
      }
      planType = candidate;
    }

    // Optional coverage: child toggled spouse on/off. '' / unset = inherit parent's
    // current sub coverage. When the parent's sub is already 'both' the picker UI
    // locks the toggle on, so this can only be sent as 'both' in that case — but we
    // still validate against the CHECK constraint set here for safety.
    const rawCoverage = req.body?.coverage;
    let coverage: 'single' | 'both' | null = null;
    if (rawCoverage === 'single' || rawCoverage === 'both') {
      coverage = rawCoverage;
    } else if (rawCoverage != null && rawCoverage !== '') {
      return res.status(400).json({ error: 'Invalid coverage' });
    }

    // Optional discount code. We validate live so a bad code is rejected at request
    // time (cleaner UX than approving a takeover then bouncing the renewal). We
    // store the code STRING (not the row id) on the takeover row in /finalize.
    const rawDiscount = req.body?.discountCode;
    let discountCode: string | null = null;
    if (typeof rawDiscount === 'string' && rawDiscount.trim()) {
      const code = rawDiscount.trim();
      const { data: discRow } = await supabase
        .from('discount_codes')
        .select('code, status, starts_at, expires_at, max_uses, current_uses')
        .eq('code', code)
        .eq('status', 'active')
        .maybeSingle();
      const now = new Date();
      const ok =
        !!discRow &&
        new Date(discRow.starts_at) <= now &&
        (!discRow.expires_at || new Date(discRow.expires_at) >= now) &&
        (!discRow.max_uses || discRow.current_uses < discRow.max_uses);
      if (!ok) return res.status(400).json({ error: 'Discount code is invalid or expired.' });
      discountCode = discRow!.code;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      currency: 'usd', // required for setup-mode Checkout (no line items to infer it from)
      metadata: {
        userId: req.user.userId,
        purpose: 'takeover_request',
        guideId,
        // Stripe metadata is string-keyed/string-valued; '' = "no override / inherit".
        planType: planType || '',
        coverage: coverage || '',
        discountCode: discountCode || '',
      },
      success_url: `${webBase()}/dashboard/child/overview?takeover=ok&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${webBase()}/dashboard/child/overview?takeover=cancel`,
    });
    res.json({ url: session.url });
  } catch (err: any) {
    console.error('[PaymentTransfer] checkout error:', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /payment-transfers/finalize ─────────────────────────────────────────────
// Step 2: the card was captured. Create the pending request with the card held, then
// notify the owner + primary TI. Idempotent (the unique in-flight index + the lookup
// guard against double-creation if this is called twice).
router.post('/finalize', requireUser, async (req: any, res) => {
  if (!isStripeConfigured()) return res.status(503).json({ error: 'Payments aren’t set up yet.' });
  try {
    const sessionId = String(req.body?.sessionId || '');
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const md: any = session.metadata || {};
    if (md.purpose !== 'takeover_request') return res.status(400).json({ error: 'Not a takeover session.' });
    if (md.userId !== req.user.userId) return res.status(403).json({ error: 'This session isn’t yours.' });

    const guideId = md.guideId as string;
    const ctx = await loadGuideContext(guideId, req.user.userId, (req.user.email || '').toLowerCase());
    if (!ctx) return res.status(404).json({ error: 'Guide not found' });

    // Resolve the captured card.
    const customerId = typeof session.customer === 'string' ? session.customer : (session.customer as any)?.id || null;
    let pmId: string | null = null;
    if (session.setup_intent) {
      const siId = typeof session.setup_intent === 'string' ? session.setup_intent : (session.setup_intent as any).id;
      const si = await stripe.setupIntents.retrieve(siId);
      pmId = typeof si.payment_method === 'string' ? si.payment_method : (si.payment_method as any)?.id || null;
    }
    let brand: string | null = null;
    let last4: string | null = null;
    if (pmId) {
      const pm = await stripe.paymentMethods.retrieve(pmId);
      brand = pm.card?.brand ?? null;
      last4 = pm.card?.last4 ?? null;
    }

    // Already created (e.g. double POST)? Return it and drop the duplicate card.
    const existing = await inFlightFor(guideId, req.user.userId);
    if (existing) {
      await detachCard(pmId);
      return res.json({ request: existing, alreadyExists: true });
    }

    // Picker choices that were stashed in Stripe metadata at /checkout. '' = inherit
    // (no override). We re-validate defensively in case metadata was tampered with.
    const chosenPlanType =
      typeof md.planType === 'string' && md.planType && ALLOWED_PLAN_TYPES.has(md.planType)
        ? md.planType
        : null;
    const chosenCoverage =
      md.coverage === 'single' || md.coverage === 'both' ? md.coverage : null;
    const appliedDiscountCode =
      typeof md.discountCode === 'string' && md.discountCode ? md.discountCode : null;

    const { data: created, error } = await supabase
      .from('payment_transfer_requests')
      .insert({
        guide_id: guideId,
        requester_user_id: req.user.userId,
        status: 'pending',
        payment_state: 'captured',
        processor_customer_id: customerId,
        processor_payment_method: pmId,
        card_brand: brand,
        card_last4: last4,
        chosen_plan_type: chosenPlanType,
        chosen_coverage: chosenCoverage,
        applied_discount_code: appliedDiscountCode,
      })
      .select('id, status, effective_at, created_at, card_brand, card_last4, chosen_plan_type, chosen_coverage, applied_discount_code')
      .single();
    if (error) throw error;

    // Resolve the requester's "First Last" — used verbatim in the email + in-app
    // message per spec. Falls back to the family_members display_name (the parent's
    // chosen label) and then to the session name if profile fields are missing.
    const { data: reqProfile } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', req.user.userId)
      .maybeSingle();
    const requesterFullName =
      [reqProfile?.first_name, reqProfile?.last_name].filter(Boolean).join(' ').trim() ||
      ctx.myDisplayName ||
      req.user.name ||
      'A family member';

    const title = 'Payment takeover requested';
    const content = takeoverRequestNotificationContent(requesterFullName);
    const url = loginUrl();

    // In-app to the guide owner — they're an approver too. (The eligibility check
    // earlier in this handler already returns 400 if the owner is the requester,
    // so we don't need to guard here.)
    await notify(ctx.guide.parent_user_id, title, content);

    // Trusted individuals (primary + secondary): in-app + email + SMS. Skip a TI
    // who IS the requester (Myron self-request edge), and skip the owner if a TI
    // slot happens to point at them (avoids a double in-app for the same person).
    const tis = await tiUserIds(ctx.guide);
    for (const tiUid of tis) {
      if (tiUid === req.user.userId) continue;
      if (tiUid === ctx.guide.parent_user_id) continue;

      await notify(tiUid, title, content);

      const ti = await contactForGuide(tiUid, ctx.guide.parent_user_id);
      if (ti.email) {
        sendTakeoverRequestEmail({
          to: ti.email,
          requesterFullName,
          loginUrl: url,
        }).catch(() => {});
      }
      if (ti.phone) {
        sendTakeoverRequestSms({ to: ti.phone }).catch(() => {});
      }
    }

    res.json({ request: created });
  } catch (err: any) {
    console.error('[PaymentTransfer] finalize error:', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /payment-transfers/incoming — requests awaiting MY approval (owner or TI) ─
router.get('/incoming', requireUser, async (req: any, res) => {
  try {
    const me = req.user.userId;
    const myEmail = (req.user.email || '').toLowerCase();

    const { data: owned } = await supabase.from('guides').select('id').eq('parent_user_id', me);
    const guideIds = new Set((owned || []).map((g) => g.id));

    if (myEmail) {
      const { data: myFam } = await supabase
        .from('family_members')
        .select('id, parent_guid')
        .ilike('email', myEmail);
      for (const fm of myFam || []) {
        const { data: g } = await supabase
          .from('guides')
          .select('id')
          .eq('parent_user_id', fm.parent_guid)
          .or(`primary_ti_member_id.eq.${fm.id},secondary_ti_member_id.eq.${fm.id}`)
          .maybeSingle();
        if (g) guideIds.add(g.id);
      }
    }

    if (guideIds.size === 0) return res.json([]);

    const { data: reqs } = await supabase
      .from('payment_transfer_requests')
      .select('id, guide_id, requester_user_id, status, created_at, card_brand, card_last4')
      .in('guide_id', Array.from(guideIds))
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    const out = await Promise.all(
      (reqs || []).map(async (r) => ({
        id: r.id,
        guideId: r.guide_id,
        status: r.status,
        createdAt: r.created_at,
        cardBrand: r.card_brand,
        cardLast4: r.card_last4,
        requesterName: (await profileName(r.requester_user_id)) || 'A family member',
      }))
    );
    res.json(out);
  } catch (err: any) {
    console.error('[PaymentTransfer] incoming error:', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /payment-transfers/outgoing — MY own requests + their status ─────────────
router.get('/outgoing', requireUser, async (req: any, res) => {
  try {
    const { data: reqs } = await supabase
      .from('payment_transfer_requests')
      .select('id, guide_id, status, payment_state, effective_at, created_at, decided_at, card_brand, card_last4')
      .eq('requester_user_id', req.user.userId)
      .order('created_at', { ascending: false });
    res.json(
      (reqs || []).map((r) => ({
        id: r.id,
        guideId: r.guide_id,
        status: r.status,
        paymentState: r.payment_state,
        effectiveAt: r.effective_at,
        createdAt: r.created_at,
        decidedAt: r.decided_at,
        cardBrand: r.card_brand,
        cardLast4: r.card_last4,
      }))
    );
  } catch (err: any) {
    console.error('[PaymentTransfer] outgoing error:', err?.message);
    res.status(500).json({ error: err.message });
  }
});

type TransferRow = {
  id: string;
  guide_id: string;
  requester_user_id: string;
  status: string;
  processor_payment_method?: string | null;
  chosen_plan_type?: string | null;
};
type ApproverLoad =
  | { ok: false; status: number }
  | { ok: true; request: TransferRow; ctx: NonNullable<Awaited<ReturnType<typeof loadGuideContext>>> };

// Shared guard: load a request and verify the caller may act on it (owner or TI).
async function loadForApprover(reqId: string, viewerUserId: string, viewerEmail: string): Promise<ApproverLoad> {
  const { data: request } = await supabase
    .from('payment_transfer_requests')
    .select('id, guide_id, requester_user_id, status, processor_payment_method, chosen_plan_type')
    .eq('id', reqId)
    .maybeSingle();
  if (!request) return { ok: false, status: 404 };
  const ctx = await loadGuideContext(request.guide_id, viewerUserId, viewerEmail);
  if (!ctx) return { ok: false, status: 404 };
  if (!ctx.isOwner && !ctx.isTI) return { ok: false, status: 403 };
  return { ok: true, request: request as TransferRow, ctx };
}

// ─── POST /payment-transfers/:id/approve ──────────────────────────────────────────
// Accept the request. The captured card is promoted to 'active' and will be used at
// the guide's next renewal (effective_at). No charge happens now.
router.post('/:id/approve', requireUser, async (req: any, res) => {
  try {
    const loaded = await loadForApprover(req.params.id, req.user.userId, (req.user.email || '').toLowerCase());
    if (!loaded.ok) return res.status(loaded.status).json({ error: loaded.status === 404 ? 'Not found' : 'Not allowed' });
    const { request, ctx } = loaded;
    if (request.status !== 'pending') return res.status(409).json({ error: `Request is already ${request.status}.` });

    const sub = await ownerSubscription(ctx.guide.parent_user_id);
    const effectiveAt = sub?.status === 'active' && sub.expires_at ? sub.expires_at : new Date().toISOString();

    const { error } = await supabase
      .from('payment_transfer_requests')
      .update({
        status: 'approved',
        payment_state: 'active',
        effective_at: effectiveAt,
        decided_by_user_id: req.user.userId,
        decided_at: new Date().toISOString(),
      })
      .eq('id', request.id);
    if (error) throw error;

    // Flip the parent's subscription.billing_owner to 'child' so
    // /billing/subscription reflects "someone else is paying" immediately on
    // approval. WHO that child is gets resolved from payment_transfer_requests
    // (latest approved row for this guide → requester_user_id) — the column
    // itself is constrained to ('self', 'child') per migration
    // 20260522000002_onboarding_provisioning.sql, so we can't store the
    // user_id here. The Stripe-side card swap still happens at the next
    // renewal (see TODO below).
    if (sub?.id) {
      const { error: subErr } = await supabase
        .from('subscriptions')
        .update({ billing_owner: 'child', updated_at: new Date().toISOString() })
        .eq('id', sub.id);
      if (subErr) console.error('[PaymentTransfer] billing_owner flip failed:', subErr.message);
    }

    const future = new Date(effectiveAt) > new Date();
    const planChanged =
      !!request.chosen_plan_type && !!sub?.plan_type && request.chosen_plan_type !== sub.plan_type;

    // TODO(takeover-renewal-plan-switch): when the renewal pipeline is built, this
    // is the place the parent's subscription gets switched onto request.chosen_plan_type
    // and billed against the requester's card. Today the takeover row already carries
    // the chosen plan (see /finalize); the actual Stripe subscriptions.update +
    // payment-method swap happens off the next-renewal webhook (same place that needs
    // to start using the child's card at the same effective_at).

    const planSuffix = planChanged
      ? ' Your guide will switch to the new plan on the same date.'
      : '';
    await notify(
      request.requester_user_id,
      'Payment takeover approved',
      future
        ? `Your request was approved. Your card will be used for this guide starting ${new Date(effectiveAt).toLocaleDateString()}.${planSuffix}`
        : `Your request was approved. Your card will be used for this guide from the next payment.${planSuffix}`
    );

    // Email the approved requester — only this child gets the approval email.
    const approved = await contactForGuide(request.requester_user_id, ctx.guide.parent_user_id);
    if (approved.email) {
      sendTakeoverApprovedEmail({ to: approved.email }).catch(() => {});
    }

    // If other children also had pending requests for this guide, auto-decline them
    // silently — only one payer per guide. Their captured cards are detached so
    // nothing ever charges them. They get an in-app notification so they know the
    // request closed; NO email goes out (per spec: only the approved child is emailed).
    const { data: others } = await supabase
      .from('payment_transfer_requests')
      .select('id, requester_user_id, processor_payment_method')
      .eq('guide_id', ctx.guide.id)
      .eq('status', 'pending')
      .neq('id', request.id);
    for (const o of others || []) {
      await detachCard(o.processor_payment_method);
      await supabase
        .from('payment_transfer_requests')
        .update({
          status: 'declined',
          payment_state: 'deactivated',
          decided_by_user_id: req.user.userId,
          decided_at: new Date().toISOString(),
        })
        .eq('id', o.id);
      await notify(
        o.requester_user_id,
        'Payment takeover not approved',
        'Another family member was approved to take over payment for this guide. The card you provided has been removed.'
      );
    }

    res.json({ status: 'approved', effectiveAt });
  } catch (err: any) {
    console.error('[PaymentTransfer] approve error:', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /payment-transfers/:id/decline ──────────────────────────────────────────
// Reject the request: deactivate the captured card (detach in Stripe), notify the
// requester, and leave a TODO to email them.
router.post('/:id/decline', requireUser, async (req: any, res) => {
  try {
    const loaded = await loadForApprover(req.params.id, req.user.userId, (req.user.email || '').toLowerCase());
    if (!loaded.ok) return res.status(loaded.status).json({ error: loaded.status === 404 ? 'Not found' : 'Not allowed' });
    const { request } = loaded;
    if (request.status !== 'pending') return res.status(409).json({ error: `Request is already ${request.status}.` });

    await detachCard(request.processor_payment_method);
    const { error } = await supabase
      .from('payment_transfer_requests')
      .update({
        status: 'declined',
        payment_state: 'deactivated',
        decided_by_user_id: req.user.userId,
        decided_at: new Date().toISOString(),
      })
      .eq('id', request.id);
    if (error) throw error;

    await notify(
      request.requester_user_id,
      'Payment takeover declined',
      'Your request to take over payments wasn’t approved, and the card you provided has been removed. The current payer keeps covering this guide.'
    );
    // Also email the requester — no-op until SendGrid env is set.
    const requester = await contactForGuide(request.requester_user_id, loaded.ctx.guide.parent_user_id);
    if (requester.email) {
      sendEmail({
        to: requester.email,
        subject: 'Your payment takeover request wasn’t approved',
        text:
          'Your request to take over ongoing payments wasn’t approved, and the card you provided has been removed.\n\n' +
          'The current payer keeps covering this guide. You can request again later if anything changes.',
      }).catch(() => {});
    }
    res.json({ status: 'declined' });
  } catch (err: any) {
    console.error('[PaymentTransfer] decline error:', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /payment-transfers/:id/cancel — the requester withdraws their own request ─
router.post('/:id/cancel', requireUser, async (req: any, res) => {
  try {
    const { data: request } = await supabase
      .from('payment_transfer_requests')
      .select('id, requester_user_id, status, processor_payment_method')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!request) return res.status(404).json({ error: 'Not found' });
    if (request.requester_user_id !== req.user.userId) return res.status(403).json({ error: 'Not allowed' });
    if (!['pending', 'approved'].includes(request.status)) {
      return res.status(409).json({ error: `Request is already ${request.status}.` });
    }
    await detachCard(request.processor_payment_method);
    const { error } = await supabase
      .from('payment_transfer_requests')
      .update({ status: 'cancelled', payment_state: 'deactivated', decided_at: new Date().toISOString() })
      .eq('id', request.id);
    if (error) throw error;
    res.json({ status: 'cancelled' });
  } catch (err: any) {
    console.error('[PaymentTransfer] cancel error:', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /payment-transfers/cancel-takeover ──────────────────────────────────────
// "The child can cancel payment." Called by the child who has an APPROVED takeover
// for some guide. Detaches their card, marks the request cancelled, flips the parent
// guide's subscription to cancel-at-period-end (so the guide will lock at expires_at
// unless a new payment is added), and notifies the guide owner + each TI by in-app
// + email with the actual end date in the body.
//
// Owner-side "cancel my subscription" (delete-the-guide flow) is in POST /billing/cancel.
router.post('/cancel-takeover', requireUser, async (req: any, res) => {
  try {
    // Find this child's currently-effective takeover (status='approved' or 'completed').
    const { data: request } = await supabase
      .from('payment_transfer_requests')
      .select('id, guide_id, processor_payment_method, status')
      .eq('requester_user_id', req.user.userId)
      .in('status', ['approved', 'completed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!request) return res.status(404).json({ error: 'You don’t have an active payment takeover to cancel.' });

    const { data: guide } = await supabase
      .from('guides')
      .select('id, parent_user_id, primary_ti_member_id, secondary_ti_member_id')
      .eq('id', request.guide_id)
      .maybeSingle();
    if (!guide) return res.status(404).json({ error: 'Guide not found.' });

    // Detach the captured card in Stripe (best-effort), mark the takeover cancelled.
    await detachCard(request.processor_payment_method);
    await supabase
      .from('payment_transfer_requests')
      .update({
        status: 'cancelled',
        payment_state: 'deactivated',
        decided_by_user_id: req.user.userId,
        decided_at: new Date().toISOString(),
      })
      .eq('id', request.id);

    // Flip the parent guide's subscription to lapse at period end — per spec, "access
    // to the guide is locked after the current term date unless a new subscription
    // and payment method is added." Also flips Stripe-side if a real sub exists.
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('id, expires_at, processor_subscription_id')
      .eq('user_id', guide.parent_user_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const endDate = sub?.expires_at || null;
    if (sub && !endDate) {
      // No expires_at on the parent's sub means there's nothing meaningful to lapse —
      // skip the cancel-at-period-end flip; the notification still goes out.
    } else if (sub) {
      if (sub.processor_subscription_id && isStripeConfigured()) {
        try {
          await stripe.subscriptions.update(sub.processor_subscription_id, { cancel_at_period_end: true });
        } catch (e: any) {
          console.error('[PaymentTransfer] Stripe cancel error:', e?.message);
        }
      }
      await supabase
        .from('subscriptions')
        .update({
          cancel_at_period_end: true,
          // Reset billing_owner back to the parent so /billing/subscription
          // stops claiming "child is paying" once the child has cancelled.
          // The parent still has the existing-cancellation banner from
          // cancel_at_period_end=true to make the lapse explicit.
          billing_owner: 'self',
          updated_at: new Date().toISOString(),
        })
        .eq('id', sub.id);
    }

    // Resolve the child's full name and the parent's contact for the notifications.
    const { data: childProfile } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', req.user.userId)
      .maybeSingle();
    const childFullName =
      [childProfile?.first_name, childProfile?.last_name].filter(Boolean).join(' ').trim() ||
      req.user.name ||
      'A family member';

    // In-app + email to the owner.
    if (endDate) {
      const title = 'Payment cancelled by a family member';
      const content = takeoverCancelledNotificationContent(childFullName, endDate);
      await notify(guide.parent_user_id, title, content);

      const { data: ownerProfile } = await supabase
        .from('profiles')
        .select('email')
        .eq('user_id', guide.parent_user_id)
        .maybeSingle();
      if (ownerProfile?.email) {
        sendPaymentTakeoverCancelledEmail({
          to: ownerProfile.email,
          childFullName,
          endDate,
        }).catch(() => {});
      }

      // Same to every TI (primary + secondary), skipping the requester themselves
      // and skipping the owner (already done above) so no one is double-notified.
      const tis = await tiUserIds(guide as GuideRow);
      for (const tiUid of tis) {
        if (tiUid === req.user.userId) continue;
        if (tiUid === guide.parent_user_id) continue;
        await notify(tiUid, title, content);
        const ti = await contactForGuide(tiUid, guide.parent_user_id);
        if (ti.email) {
          sendPaymentTakeoverCancelledEmail({
            to: ti.email,
            childFullName,
            endDate,
          }).catch(() => {});
        }
      }
    }

    res.json({ cancelled: true, endDate });
  } catch (err: any) {
    console.error('[PaymentTransfer] cancel-takeover error:', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /payment-transfers/reclaim ─────────────────────────────────────────────
// "The parent takes back ownership of payments." Mirror of cancel-takeover, but
// initiated by the GUIDE OWNER rather than the child. Effects:
//   1. subscriptions.billing_owner flips back to 'self' — the ONE thing that
//      genuinely has to succeed. Everything else is housekeeping.
//   2. Any active takeover row is marked 'cancelled' and the captured Stripe card
//      is detached (best-effort).
//   3. The child is notified in-app + email so they're not surprised (best-effort).
//
// Auth: only the guide owner may call this. UNLIKE the child-cancel flow, we do
// NOT set cancel_at_period_end — the parent is reclaiming so they're committing
// to pay. They're expected to have (or just added) a card via the setup flow.
//
// Idempotency: safe to call even if no takeover row exists OR the sub is already
// 'self'. The frontend chains add-card → reclaim, and a transient retry from
// either side should never leave the user stuck on an error screen.
router.post('/reclaim', requireUser, async (req: any, res) => {
  try {
    // Find the parent's guide.
    const { data: guide } = await supabase
      .from('guides')
      .select('id, parent_user_id, primary_ti_member_id, secondary_ti_member_id')
      .eq('parent_user_id', req.user.userId)
      .maybeSingle();
    if (!guide) return res.status(404).json({ error: 'You don’t own a guide.' });

    // CORE OPERATION FIRST: flip billing_owner='self' on the parent's active sub.
    // If there's no sub at all, the user shouldn't be here — that's a real 404.
    // If the sub is already 'self', reclaim is a no-op success (idempotent).
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('id, billing_owner')
      .eq('user_id', guide.parent_user_id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!sub) return res.status(404).json({ error: 'No active subscription to reclaim.' });

    if (sub.billing_owner !== 'self') {
      const { error: subErr } = await supabase
        .from('subscriptions')
        .update({ billing_owner: 'self', updated_at: new Date().toISOString() })
        .eq('id', sub.id);
      if (subErr) {
        // This IS the operation. If the flip fails, we cannot pretend success.
        console.error('[PaymentTransfer] reclaim sub update failed:', subErr.message);
        return res.status(500).json({ error: `Couldn’t flip billing owner: ${subErr.message}` });
      }
    }

    // HOUSEKEEPING below — none of it gates the response. Any error here just
    // logs; the parent has been re-established as the payer either way.

    // Look for an active takeover row to deactivate. There may be none (clean
    // reclaim) or several stale ones — we cancel each, just to be safe.
    const { data: requests } = await supabase
      .from('payment_transfer_requests')
      .select('id, requester_user_id, processor_payment_method, status')
      .eq('guide_id', guide.id)
      .in('status', ['approved', 'completed', 'pending'])
      .order('decided_at', { ascending: false });

    for (const r of requests || []) {
      try {
        await detachCard(r.processor_payment_method); // already best-effort internally
        await supabase
          .from('payment_transfer_requests')
          .update({
            status: 'cancelled',
            payment_state: 'deactivated',
            decided_by_user_id: req.user.userId,
            decided_at: new Date().toISOString(),
          })
          .eq('id', r.id);
      } catch (e: any) {
        console.error('[PaymentTransfer] reclaim housekeeping (request):', e?.message);
      }
    }

    // Notify each affected child (best-effort — never fail the reclaim).
    try {
      const parentName = (await profileName(guide.parent_user_id)) || 'The guide owner';
      for (const r of requests || []) {
        if (!r.requester_user_id) continue;
        await notify(
          r.requester_user_id,
          'Payment ownership reclaimed',
          `${parentName} has taken back ownership of payments for their guide. Your card has been removed and won’t be charged.`
        ).catch(() => {});
        const child = await contactForGuide(r.requester_user_id, guide.parent_user_id).catch(() => ({ email: null, phone: null, name: null }));
        if (child.email) {
          sendEmail({
            to: child.email,
            subject: `${parentName} has taken back payments for their guide`,
            text:
              `${parentName} has reclaimed ownership of payments for their guide.\n\n` +
              `Your card has been removed from their account and won’t be charged at the next renewal.\n\n` +
              `Nothing else changes for you — you can still see their guide here:\n` +
              loginUrl(),
          }).catch(() => {});
        }
      }
    } catch (e: any) {
      console.error('[PaymentTransfer] reclaim housekeeping (notify):', e?.message);
    }

    res.json({ reclaimed: true });
  } catch (err: any) {
    console.error('[PaymentTransfer] reclaim error:', err?.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
