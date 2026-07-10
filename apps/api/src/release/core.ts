// Shared release core — the SINGLE source of truth for executing a release. Both
// triggers (automated check-in monitor + manual TR confirmation) route through
// executeRelease. No release logic lives outside this file.

import { supabase } from '../shared/supabase';
import { stripe, isStripeConfigured } from '../shared/stripe';
import { enqueueNotification } from '../shared/notifications-queue';
import {
  REFUND_MIN_REMAINING_DAYS,
  STORAGE_PRICE_CENTS,
  STORAGE_PLAN_ID,
} from './config';
import {
  releasedEmailForRecipient,
  releasedInAppForRecipient,
  releasedEmailForOtherRep,
  releasedInAppForOtherRep,
  releasedEmailForSubscriptionOwner,
  type ReleaseExecutedCtx,
} from './notification-templates';

type ReleaseReason = 'checkin_expired' | 'manual_trusted_rep';

export interface ExecuteReleaseResult {
  released: boolean;
  alreadyReleased?: boolean;
  refundCents?: number | null;
  refundId?: string | null;
}

// ────────────────────────────────────────────────────────────────────────────────
//  Public: executeRelease(guideId, reason, triggeredBy)
//
//  IDEMPOTENT. Calling twice produces exactly one released state, at most one
//  refund (gated by release_events.refund_id), and one set of notifications
//  (gated by the notifications UNIQUE on (stripe_event_id, recipient, channel)
//  with a synthetic stripe_event_id of 'release:{event_id}:{role}').
// ────────────────────────────────────────────────────────────────────────────────
export async function executeRelease(
  guideId: string,
  reason: ReleaseReason,
  triggeredByProfileId: string | null
): Promise<ExecuteReleaseResult> {
  // 1) Idempotency guard — if already released, no-op.
  const { data: guide } = await supabase
    .from('guides')
    .select('id, parent_user_id, release_status, primary_ti_member_id, secondary_ti_member_id')
    .eq('id', guideId)
    .maybeSingle();
  if (!guide) throw new Error(`Guide not found: ${guideId}`);
  if (guide.release_status === 'released') {
    return { released: true, alreadyReleased: true };
  }

  // 2) Find the pending release_event for this guide, or create one (automated
  //    trigger may call us without a manual /release POST having created it).
  const nowIso = new Date().toISOString();
  let { data: event } = await supabase
    .from('release_events')
    .select('id, refund_id')
    .eq('guide_id', guideId)
    .eq('status', 'pending')
    .maybeSingle();
  if (!event) {
    const insert = await supabase
      .from('release_events')
      .insert({
        guide_id: guideId,
        reason,
        requested_by_profile_id: triggeredByProfileId,
        status: 'pending',
        requested_at: nowIso,
        executes_at: nowIso,
      })
      .select('id, refund_id')
      .single();
    if (insert.error) {
      // Could be the partial unique index racing with a concurrent insert — fetch.
      const reread = await supabase
        .from('release_events')
        .select('id, refund_id')
        .eq('guide_id', guideId)
        .in('status', ['pending', 'executed'])
        .single();
      event = reread.data;
    } else {
      event = insert.data;
    }
  }
  if (!event) throw new Error('Could not resolve release event');

  // 3) Atomically flip status. Guard the UPDATE so two concurrent callers don't
  //    both proceed (the second one's update will affect 0 rows).
  const flipGuide = await supabase
    .from('guides')
    .update({
      release_status: 'released',
      released_at: nowIso,
      released_by_profile_id: triggeredByProfileId,
      release_reason: reason,
    })
    .neq('release_status', 'released')
    .eq('id', guideId)
    .select('id');
  if (!flipGuide.data || flipGuide.data.length === 0) {
    // Someone else released it between step 1 and step 3.
    return { released: true, alreadyReleased: true };
  }
  await supabase
    .from('release_events')
    .update({ status: 'executed', executed_at: nowIso })
    .eq('id', event.id)
    .eq('status', 'pending');

  // 4) Best-effort: Stripe downgrade + conditional refund. Failures here log but
  //    don't unwind — the release itself stands. A reconciliation job (deferred)
  //    can pick up partial-success rows.
  let refundCents: number | null = null;
  let refundId: string | null = event.refund_id || null;
  try {
    const billing = await applyBillingTransitions(guide.parent_user_id, event.id, event.refund_id);
    refundCents = billing.refundCents;
    refundId = billing.refundId;
  } catch (e: any) {
    console.error('[release] billing transitions failed (release still stands):', e?.message);
  }

  // 5) Recipients access — the existing `family_members` linkage + released_at
  //    flag already grants visibility downstream. No new access table to write.
  // TODO(release-recipients-deliver): wire delivery of letters_to_loved_ones +
  //    messages to their specific recipients here (currently they're stored but
  //    not auto-sent). For now, "access" via the existing relationships endpoint
  //    is gated by family_members; release just unlocks the released_at flag.

  // 6) Enqueue notifications (recipients, other TRs, subscription owner).
  await enqueueExecutedNotifications(guide, event.id, triggeredByProfileId, refundCents);

  // 7) Build per-recipient encrypted ZIP packages + OTP + condolence email + SMS.
  //    Fire-and-forget — the release itself stands even if a single recipient's
  //    package fails. The orchestrator is idempotent (UNIQUE on release_event_id +
  //    recipient_profile_id) so the monitor can retry by re-entering executeRelease.
  //    NOTE: this is the long-running step (S3 fetches, RSA decrypts, ZIP build,
  //    GCM encrypt, S3 put, SMS, enqueue). The API process is a long-lived Node
  //    server (not Vercel serverless), so inline execution is fine; if you ever
  //    move this to a Vercel function, hand it off to a queue first.
  (async () => {
    try {
      const { buildPackagesForRelease } = await import('./packaging');
      const result = await buildPackagesForRelease(event.id);
      console.log(
        `[release] packaging done for event ${event.id}: ` +
        `built=${result.built} dup=${result.skippedDup} empty=${result.skippedEmpty}`
      );
    } catch (e: any) {
      console.error('[release] packaging failed (release still stands):', e?.message);
    }
  })();

  return { released: true, refundCents, refundId };
}

// ────────────────────────────────────────────────────────────────────────────────
//  BILLING: Stripe downgrade to storage tier + conditional refund.
//  Idempotency: refund gated by release_event.refund_id (null = not yet refunded).
// ────────────────────────────────────────────────────────────────────────────────

async function applyBillingTransitions(
  parentUserId: string,
  releaseEventId: string,
  existingRefundId: string | null
): Promise<{ refundCents: number | null; refundId: string | null }> {
  if (!isStripeConfigured()) {
    return { refundCents: null, refundId: existingRefundId };
  }

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('id, plan_type, status, expires_at, processor_subscription_id')
    .eq('user_id', parentUserId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub || sub.status !== 'active' || !sub.processor_subscription_id) {
    // Spec: "If no active subscription exists, skip silently."
    return { refundCents: null, refundId: existingRefundId };
  }

  // ── 1) Switch the Stripe subscription to the storage Price ────────────────────
  try {
    const storagePriceId = await ensureStripeStoragePriceId();
    const subscription = await stripe.subscriptions.retrieve(sub.processor_subscription_id);
    const itemId = subscription.items.data[0]?.id;
    if (itemId) {
      await stripe.subscriptions.update(sub.processor_subscription_id, {
        items: [{ id: itemId, price: storagePriceId }],
        proration_behavior: 'none', // refund is handled explicitly below
      });
      await supabase
        .from('subscriptions')
        .update({ plan_type: STORAGE_PLAN_ID, updated_at: new Date().toISOString() })
        .eq('id', sub.id);
    }
  } catch (e: any) {
    console.error('[release] Stripe downgrade failed:', e?.message);
  }

  // ── 2) Refund the prorated unused portion if eligible ─────────────────────────
  if (existingRefundId) {
    // Already refunded by a prior pass — don't re-issue.
    return { refundCents: null, refundId: existingRefundId };
  }

  const expires = sub.expires_at ? new Date(sub.expires_at) : null;
  if (!expires) return { refundCents: null, refundId: null };

  const remainingDays = Math.floor((expires.getTime() - Date.now()) / 86_400_000);
  if (remainingDays <= REFUND_MIN_REMAINING_DAYS) {
    // Spec: "Otherwise no refund."
    return { refundCents: null, refundId: null };
  }

  // Plan price for the prorate calculation.
  const { data: plan } = await supabase
    .from('subscription_plans')
    .select('price_cents')
    .eq('id', sub.plan_type)
    .maybeSingle();
  if (!plan?.price_cents) return { refundCents: null, refundId: null };

  const planYears = PLAN_YEARS[sub.plan_type] ?? 1;
  const totalDays = planYears * 365;
  const refundCents = Math.floor((remainingDays / totalDays) * plan.price_cents);
  if (refundCents <= 0) return { refundCents: null, refundId: null };

  // Find the most recent paid invoice on this subscription to refund against.
  try {
    const invoices = await stripe.invoices.list({
      subscription: sub.processor_subscription_id,
      limit: 10,
    });
    const lastPaid = invoices.data.find((i) => i.status === 'paid' && i.payment_intent);
    const pi = lastPaid && typeof lastPaid.payment_intent === 'string'
      ? lastPaid.payment_intent
      : (lastPaid?.payment_intent as any)?.id;
    if (!pi) return { refundCents: null, refundId: null };

    const refund = await stripe.refunds.create({
      payment_intent: pi,
      amount: refundCents,
      reason: 'requested_by_customer',
      metadata: { release_event_id: releaseEventId },
    });

    // Persist the refund id ASAP so a re-entry won't double-refund.
    await supabase
      .from('release_events')
      .update({ refund_id: refund.id })
      .eq('id', releaseEventId);

    return { refundCents, refundId: refund.id };
  } catch (e: any) {
    console.error('[release] Stripe refund failed:', e?.message);
    return { refundCents: null, refundId: null };
  }
}

const PLAN_YEARS: Record<string, number> = {
  annual: 1, five_year: 5, ten_year: 10, archive: 1, storage: 1,
};

// Storage Price is created once via API if STRIPE_STORAGE_PRICE_ID is unset. Logs
// the id so you can paste it into .env to skip the create on subsequent releases.
async function ensureStripeStoragePriceId(): Promise<string> {
  if (process.env.STRIPE_STORAGE_PRICE_ID) return process.env.STRIPE_STORAGE_PRICE_ID;
  const product = await stripe.products.create({ name: 'ForEveryAfter Storage' });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: STORAGE_PRICE_CENTS,
    currency: 'usd',
    recurring: { interval: 'year' },
  });
  console.log(
    `[release] Created Stripe storage Price ${price.id}. ` +
    `Set STRIPE_STORAGE_PRICE_ID=${price.id} in apps/api/.env to reuse it.`
  );
  return price.id;
}

// ────────────────────────────────────────────────────────────────────────────────
//  Recipient resolution + notification enqueueing
// ────────────────────────────────────────────────────────────────────────────────

interface GuideRow {
  id: string;
  parent_user_id: string;
  primary_ti_member_id: string | null;
  secondary_ti_member_id: string | null;
}

// Returns { recipientProfileIds, trProfileIds } for the release. Recipients = all
// family_members on the guide with a provisioned member_guid (they have a profile).
// TRs = primary + secondary trusted_representative member_guids.
async function resolveAudiences(guide: GuideRow): Promise<{
  recipientProfileIds: string[];
  trProfileIds: string[];
}> {
  const tiIds = [guide.primary_ti_member_id, guide.secondary_ti_member_id]
    .filter((x): x is string => !!x);

  const { data: members } = await supabase
    .from('family_members')
    .select('id, member_guid, email')
    .eq('parent_guid', guide.parent_user_id);

  const trProfileIds: string[] = [];
  const recipientProfileIds: string[] = [];
  for (const m of members || []) {
    if (!m.member_guid) continue;
    if (tiIds.includes(m.id)) {
      trProfileIds.push(m.member_guid);
    } else {
      // Non-TR family members are the "designated recipients" — they receive the guide.
      recipientProfileIds.push(m.member_guid);
    }
  }
  return { recipientProfileIds, trProfileIds };
}

async function loadProfile(userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('user_id, email, first_name, last_name')
    .eq('user_id', userId)
    .maybeSingle();
  return data;
}

const fullName = (p: { first_name: string | null; last_name: string | null } | null | undefined) =>
  p ? [p.first_name, p.last_name].filter(Boolean).join(' ').trim() : '';

const webBase = () => process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000';

// Synthetic key reuses the notifications UNIQUE (stripe_event_id, user_id, channel)
// for dedup. Format: 'release:{event_id}:{role}'.
function syntheticEventId(releaseEventId: string, role: string) {
  return `release:${releaseEventId}:${role}`;
}

async function enqueueExecutedNotifications(
  guide: GuideRow,
  releaseEventId: string,
  triggeredByProfileId: string | null,
  refundCents: number | null
) {
  const owner = await loadProfile(guide.parent_user_id);
  const ownerName = fullName(owner) || 'Your family member';
  const guideUrl = `${webBase()}/dashboard/child/overview`; // released guides surface here
  const paymentsUrl = `${webBase()}/dashboard/payments`;

  const ctx: ReleaseExecutedCtx = {
    guideOwnerName: ownerName,
    guideUrl,
    paymentsUrl,
    refundCents,
  };

  const audiences = await resolveAudiences(guide);

  // ── Recipients ──────────────────────────────────────────────────────────────
  for (const recipientId of audiences.recipientProfileIds) {
    const profile = await loadProfile(recipientId);
    if (profile?.email) {
      await enqueueNotification({
        userId: recipientId,
        type: 'release_executed_recipient',
        channel: 'email',
        recipientRole: 'trusted_representative', // closest existing value; rep semantics fit
        stripeEventId: syntheticEventId(releaseEventId, `recipient_email_${recipientId}`),
        subscriptionId: null,
        payload: { to: profile.email, ...releasedEmailForRecipient(ctx) },
      });
    }
    await enqueueNotification({
      userId: recipientId,
      type: 'release_executed_recipient',
      channel: 'in_app',
      recipientRole: 'trusted_representative',
      stripeEventId: syntheticEventId(releaseEventId, `recipient_inapp_${recipientId}`),
      subscriptionId: null,
      payload: releasedInAppForRecipient(ctx),
    });
  }

  // ── OTHER TRs (exclude the triggering rep, if any) ──────────────────────────
  for (const repId of audiences.trProfileIds) {
    if (repId === triggeredByProfileId) continue;
    const profile = await loadProfile(repId);
    if (profile?.email) {
      await enqueueNotification({
        userId: repId,
        type: 'release_executed_other_rep',
        channel: 'email',
        recipientRole: 'trusted_representative',
        stripeEventId: syntheticEventId(releaseEventId, `otherrep_email_${repId}`),
        subscriptionId: null,
        payload: { to: profile.email, ...releasedEmailForOtherRep(ctx) },
      });
    }
    await enqueueNotification({
      userId: repId,
      type: 'release_executed_other_rep',
      channel: 'in_app',
      recipientRole: 'trusted_representative',
      stripeEventId: syntheticEventId(releaseEventId, `otherrep_inapp_${repId}`),
      subscriptionId: null,
      payload: releasedInAppForOtherRep(ctx),
    });
  }

  // ── Subscription owner (the only recipient that sees refund detail) ─────────
  if (owner?.email) {
    await enqueueNotification({
      userId: owner.user_id,
      type: 'release_executed_owner',
      channel: 'email',
      recipientRole: 'subscription_owner',
      stripeEventId: syntheticEventId(releaseEventId, 'owner_email'),
      subscriptionId: null,
      payload: { to: owner.email, ...releasedEmailForSubscriptionOwner(ctx) },
    });
  }
}
