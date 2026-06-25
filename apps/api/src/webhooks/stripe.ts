import { Router } from 'express';
import { stripe } from '../shared/stripe';
import { supabase } from '../shared/supabase';
import { enqueueNotification, type RecipientRole } from '../shared/notifications-queue';
import {
  emailFor,
  inAppFor,
  type SubscriptionContext,
} from '../shared/subscription-notification-templates';

const router = Router();

const PLAN_YEARS: Record<string, number> = { annual: 1, five_year: 5, ten_year: 10, archive: 1 };
const addYears = (d: Date, n: number) => {
  const x = new Date(d);
  x.setFullYear(x.getFullYear() + n);
  return x;
};

// Find the user's latest subscription row, or create one.
async function upsertSubscription(userId: string, fields: Record<string, any>) {
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) {
    await supabase.from('subscriptions').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', existing.id);
    return existing.id;
  }
  const { data: created } = await supabase.from('subscriptions').insert({ user_id: userId, ...fields }).select('id').single();
  return created?.id as string | undefined;
}

// checkout.session.completed — the purchase is done; provision the subscription,
// store the Stripe customer, and (for one-time plans) record the charge.
async function provisionFromCheckout(session: any) {
  const md = session.metadata || {};
  const userId = md.userId || session.client_reference_id;
  if (!userId) return;
  const planType = String(md.planId || 'annual');
  const coverage = md.coverage === 'both' ? 'both' : 'single';
  const now = new Date();
  const expires = addYears(now, PLAN_YEARS[planType] ?? 1);

  const subId = await upsertSubscription(userId, {
    plan_type: planType,
    status: 'active',
    coverage,
    activated_at: now.toISOString(),
    expires_at: expires.toISOString(),
    processor_subscription_id: typeof session.subscription === 'string' ? session.subscription : null,
  });
  if (!subId) return;

  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  if (customerId) {
    const { data: pay } = await supabase
      .from('payments')
      .insert({ subscription_id: subId, processor_customer_id: customerId })
      .select('id')
      .single();
    if (pay) await supabase.from('subscriptions').update({ current_payment_id: pay.id }).eq('id', subId);
  }

  // One-time plans get no invoice.paid event — record the charge now.
  if (session.mode === 'payment') {
    await supabase.from('invoices').insert({
      subscription_id: subId,
      amount_cents: session.amount_total ?? 0,
      currency: session.currency || 'usd',
      status: 'succeeded',
      paid_at: now.toISOString(),
      processor_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
    });
  }
}

// checkout.session.completed (mode=setup) — a card was added with no charge. Store
// the customer, set the card as default, and link it (no subscription/invoice).
// EXPORTED so the synchronous "finalize" endpoint in apps/api/src/billing/routes.ts
// can call the same code path on Checkout return — dev environments often don't
// receive webhooks (no Stripe CLI forwarding), and we don't want the user's DB
// state to depend on whether the webhook landed.
//
// Returns a diagnostic object so the finalize endpoint can tell the client what
// got written (or what couldn't be). Each "soft" failure (missing field, no sub
// row, no payments row to update) is recorded as a reason rather than thrown,
// because Stripe's checkout.session.completed retries on 5xx and we don't want
// a one-off DB hiccup to keep firing forever. Hard failures (DB connection
// dropped) DO throw — the webhook should retry those.
export type AttachResult =
  | { ok: true; customerId: string; pmId: string | null; subId: string; payId: string | null; created: boolean }
  | { ok: false; reason: string };

export async function attachPaymentMethodFromSetup(session: any): Promise<AttachResult> {
  const userId = session?.metadata?.userId;
  const customerId = typeof session?.customer === 'string' ? session.customer : session?.customer?.id;
  if (!userId) return { ok: false, reason: 'session has no metadata.userId' };
  if (!customerId) return { ok: false, reason: 'session has no customer' };

  let pmId: string | null = null;
  if (session.setup_intent) {
    const siId = typeof session.setup_intent === 'string' ? session.setup_intent : session.setup_intent.id;
    const si = await stripe.setupIntents.retrieve(siId);
    pmId = (typeof si.payment_method === 'string' ? si.payment_method : (si.payment_method as any)?.id) || null;
  }
  if (pmId) {
    try {
      await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: pmId } });
    } catch (e: any) {
      console.error('[webhook/setup] default PM update failed:', e?.message);
    }
  }

  const { data: sub, error: subErr } = await supabase
    .from('subscriptions')
    .select('id, processor_subscription_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (subErr) throw subErr;
  if (!sub) return { ok: false, reason: `no subscription row for user ${userId}` };

  const { data: existingPay, error: payErr } = await supabase
    .from('payments')
    .select('id')
    .eq('subscription_id', sub.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (payErr) throw payErr;

  let payId: string | null = existingPay?.id || null;
  let createdPay = false;
  if (existingPay) {
    const { error: upErr } = await supabase
      .from('payments')
      .update({ processor_customer_id: customerId, processor_payment_method: pmId, updated_at: new Date().toISOString() })
      .eq('id', existingPay.id);
    if (upErr) throw upErr;
  } else {
    const { data: created, error: insErr } = await supabase
      .from('payments')
      .insert({ subscription_id: sub.id, processor_customer_id: customerId, processor_payment_method: pmId })
      .select('id')
      .single();
    if (insErr) throw insErr;
    payId = created?.id || null;
    createdPay = true;
  }
  if (payId) {
    await supabase.from('subscriptions').update({ current_payment_id: payId }).eq('id', sub.id);
  }

  // Keep renewals using the new card.
  if (sub.processor_subscription_id && pmId) {
    try {
      await stripe.subscriptions.update(sub.processor_subscription_id, { default_payment_method: pmId });
    } catch {
      /* best-effort */
    }
  }

  return { ok: true, customerId, pmId, subId: sub.id, payId, created: createdPay };
}

// invoice.paid — first charge + every renewal of a subscription. Extend the term
// and ledger the invoice.
//
// TODO(takeover-stripe): when a guide has an APPROVED takeover (payment_transfer_requests
//   status=approved, payment_state=active) and this renewal is its owner's subscription,
//   charge the requester's captured card instead — anchor a new annual sub to the new
//   payer's customer (trial_end = old period end, no double charge), set the old sub to
//   cancel_at_period_end, flip subscriptions.billing_owner to the requester, and mark the
//   request 'completed'. Not wired yet (needs the renewal/cadence engine).
async function recordInvoicePaid(invoice: any) {
  if (!invoice.subscription) return;
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('id, plan_type')
    .eq('processor_subscription_id', invoice.subscription)
    .maybeSingle();
  if (!sub) return;

  const now = new Date();
  const expires = addYears(now, PLAN_YEARS[sub.plan_type] ?? 1);
  await supabase
    .from('subscriptions')
    .update({ status: 'active', expires_at: expires.toISOString(), updated_at: now.toISOString() })
    .eq('id', sub.id);

  await supabase.from('invoices').insert({
    subscription_id: sub.id,
    amount_cents: invoice.amount_paid ?? invoice.total ?? 0,
    currency: invoice.currency || 'usd',
    status: 'succeeded',
    paid_at: now.toISOString(),
    processor_payment_intent_id: typeof invoice.payment_intent === 'string' ? invoice.payment_intent : null,
    processor_charge_id: typeof invoice.charge === 'string' ? invoice.charge : null,
  });
}

async function markPastDue(invoice: any) {
  if (!invoice.subscription) return;
  await supabase
    .from('subscriptions')
    .update({ status: 'past_due', updated_at: new Date().toISOString() })
    .eq('processor_subscription_id', invoice.subscription);
}

async function syncSubscriptionStatus(subscription: any) {
  const status =
    subscription.status === 'active' || subscription.status === 'trialing'
      ? 'active'
      : subscription.status === 'canceled'
        ? 'canceled'
        : subscription.status;
  await supabase
    .from('subscriptions')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('processor_subscription_id', subscription.id);
}

// ────────────────────────────────────────────────────────────────────────────────
//  Subscription-lifecycle notification enqueueing (spec parts 2–4)
//
//  Per the role-resolution decision: subscription_owner is ALWAYS subscriptions.user_id
//  (which is also the guide_owner in this codebase). So subscription_owner === guide_owner
//  and the "skip if guide_owner != subscription_owner" rule deduplicates automatically —
//  for payment_failed / expired we end up emailing the owner once + the TI once.
// ────────────────────────────────────────────────────────────────────────────────

interface ResolvedContext extends SubscriptionContext {
  subscriptionOwner: string | null;
  guideOwner: string | null;
  trustedRepresentative: string | null;
  subscriptionOwnerEmail: string | null;
  trustedRepresentativeEmail: string | null;
}

const webBase = () => process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000';

async function loadProfile(userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('email, first_name, last_name')
    .eq('user_id', userId)
    .maybeSingle();
  return data || null;
}

const fullName = (p: { first_name: string | null; last_name: string | null } | null) =>
  p ? [p.first_name, p.last_name].filter(Boolean).join(' ').trim() : '';

// Resolve roles from a Stripe subscription id. Returns nulls (and logs) when a role
// can't be found — never throws, per spec: "do not fail the webhook."
async function resolveContext(
  stripeSubscriptionId: string,
  dateUnixSec: number | null | undefined
): Promise<ResolvedContext> {
  const empty: ResolvedContext = {
    subscriptionOwner: null,
    guideOwner: null,
    trustedRepresentative: null,
    subscriptionOwnerEmail: null,
    trustedRepresentativeEmail: null,
    guideOwnerName: '',
    subscriptionOwnerName: '',
    dateIso: null,
    paymentsUrl: `${webBase()}/dashboard/payments`,
  };

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('processor_subscription_id', stripeSubscriptionId)
    .maybeSingle();
  if (!sub) {
    console.warn('[webhook] resolveContext: no local subscription for', stripeSubscriptionId);
    return empty;
  }

  // subscription_owner === guide_owner (per the role-resolution choice).
  const ownerId = sub.user_id as string;
  const ownerProfile = await loadProfile(ownerId);

  // TI lookup via the guide's primary_ti_member_id → family_members.member_guid.
  let tiId: string | null = null;
  let tiEmail: string | null = null;
  const { data: guide } = await supabase
    .from('guides')
    .select('primary_ti_member_id')
    .eq('parent_user_id', ownerId)
    .maybeSingle();
  if (guide?.primary_ti_member_id) {
    const { data: tiMember } = await supabase
      .from('family_members')
      .select('member_guid, email')
      .eq('id', guide.primary_ti_member_id)
      .maybeSingle();
    tiId = tiMember?.member_guid || null;
    tiEmail = tiMember?.email || null;
    // If the TI has logged in, prefer their authenticated profile email.
    if (tiId) {
      const tiProfile = await loadProfile(tiId);
      if (tiProfile?.email) tiEmail = tiProfile.email;
    }
  } else {
    console.warn('[webhook] resolveContext: no primary TI on guide for owner', ownerId);
  }

  const ownerName = fullName(ownerProfile) || 'the guide owner';

  return {
    subscriptionOwner: ownerId,
    guideOwner: ownerId,
    trustedRepresentative: tiId,
    subscriptionOwnerEmail: ownerProfile?.email || null,
    trustedRepresentativeEmail: tiEmail,
    guideOwnerName: ownerName,
    subscriptionOwnerName: ownerName,
    dateIso: dateUnixSec ? new Date(dateUnixSec * 1000).toISOString() : null,
    paymentsUrl: `${webBase()}/dashboard/payments`,
  };
}

// Helper: queue an email for one role if we have an address. Idempotent (UNIQUE).
async function queueEmail(
  type:
    | 'subscription_renewal_upcoming'
    | 'subscription_renewed'
    | 'subscription_payment_failed'
    | 'subscription_expired',
  role: RecipientRole,
  userId: string | null,
  toEmail: string | null,
  stripeEventId: string,
  stripeSubscriptionId: string,
  ctx: ResolvedContext
) {
  if (!userId || !toEmail) {
    console.warn(`[webhook] skipping email for role=${role} type=${type}: missing recipient`);
    return;
  }
  const tpl = emailFor(type, role, ctx);
  await enqueueNotification({
    userId,
    type,
    channel: 'email',
    recipientRole: role,
    subscriptionId: stripeSubscriptionId,
    stripeEventId,
    payload: { to: toEmail, ...tpl },
  });
}

async function queueInApp(
  type: 'subscription_payment_failed',
  role: 'subscription_owner' | 'trusted_representative',
  userId: string | null,
  stripeEventId: string,
  stripeSubscriptionId: string,
  ctx: ResolvedContext
) {
  if (!userId) {
    console.warn(`[webhook] skipping in_app for role=${role} type=${type}: missing recipient`);
    return;
  }
  const tpl = inAppFor(type, role, ctx);
  await enqueueNotification({
    userId,
    type,
    channel: 'in_app',
    recipientRole: role,
    subscriptionId: stripeSubscriptionId,
    stripeEventId,
    payload: tpl,
  });
}

// ─── per-event enqueue ────────────────────────────────────────────────────────────

async function enqueueRenewalUpcoming(event: any, invoice: any) {
  const stripeSubId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
  if (!stripeSubId) return;
  const ctx = await resolveContext(stripeSubId, invoice.next_payment_attempt ?? invoice.period_end);
  // Subscription_owner only.
  await queueEmail('subscription_renewal_upcoming', 'subscription_owner', ctx.subscriptionOwner, ctx.subscriptionOwnerEmail, event.id, stripeSubId, ctx);
}

async function enqueueRenewed(event: any, invoice: any) {
  const stripeSubId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
  if (!stripeSubId) return;
  const ctx = await resolveContext(stripeSubId, invoice.period_end);
  await queueEmail('subscription_renewed', 'subscription_owner', ctx.subscriptionOwner, ctx.subscriptionOwnerEmail, event.id, stripeSubId, ctx);
}

async function enqueuePaymentFailed(event: any, invoice: any) {
  const stripeSubId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
  if (!stripeSubId) return;
  const ctx = await resolveContext(stripeSubId, invoice.next_payment_attempt ?? invoice.period_end);

  // EMAIL: 3 recipients (guide_owner skipped iff != subscription_owner; in this codebase
  // they're always the same profile, so guide_owner gets deduped naturally).
  await queueEmail('subscription_payment_failed', 'subscription_owner', ctx.subscriptionOwner, ctx.subscriptionOwnerEmail, event.id, stripeSubId, ctx);
  await queueEmail('subscription_payment_failed', 'trusted_representative', ctx.trustedRepresentative, ctx.trustedRepresentativeEmail, event.id, stripeSubId, ctx);
  if (ctx.guideOwner && ctx.guideOwner !== ctx.subscriptionOwner) {
    await queueEmail('subscription_payment_failed', 'guide_owner', ctx.guideOwner, ctx.subscriptionOwnerEmail /* same owner profile in this schema */, event.id, stripeSubId, ctx);
  }
  // IN_APP: subscription_owner + TI only (no guide_owner per spec).
  await queueInApp('subscription_payment_failed', 'subscription_owner', ctx.subscriptionOwner, event.id, stripeSubId, ctx);
  await queueInApp('subscription_payment_failed', 'trusted_representative', ctx.trustedRepresentative, event.id, stripeSubId, ctx);
}

async function enqueueExpired(event: any, subscription: any) {
  const stripeSubId = subscription.id as string;
  const ctx = await resolveContext(stripeSubId, subscription.current_period_end);
  await queueEmail('subscription_expired', 'subscription_owner', ctx.subscriptionOwner, ctx.subscriptionOwnerEmail, event.id, stripeSubId, ctx);
  await queueEmail('subscription_expired', 'trusted_representative', ctx.trustedRepresentative, ctx.trustedRepresentativeEmail, event.id, stripeSubId, ctx);
  if (ctx.guideOwner && ctx.guideOwner !== ctx.subscriptionOwner) {
    await queueEmail('subscription_expired', 'guide_owner', ctx.guideOwner, ctx.subscriptionOwnerEmail, event.id, stripeSubId, ctx);
  }
}

// Mounted with express.raw — req.body is the raw Buffer needed for signature checks.
router.post('/stripe', async (req: any, res) => {
  const sig = req.headers['stripe-signature'];
  const whsec = process.env.STRIPE_WEBHOOK_SECRET || '';
  let event: any;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, whsec);
  } catch (err: any) {
    console.error('[Webhook] signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        // Takeover card capture (purpose=takeover_request) is finalized via the
        // /payment-transfers/finalize return call, not here — skip it.
        if (event.data.object?.mode === 'setup') {
          if (event.data.object?.metadata?.purpose !== 'takeover_request') {
            await attachPaymentMethodFromSetup(event.data.object);
          }
        } else {
          await provisionFromCheckout(event.data.object);
        }
        break;
      case 'invoice.upcoming':
        // Preview event — no invoice.id; dedup on event.id (always present).
        if (event.data.object?.billing_reason === 'subscription_cycle') {
          await enqueueRenewalUpcoming(event, event.data.object);
        }
        break;
      case 'invoice.paid':
        // Existing inline logic runs for ALL invoice.paid (including initial signup).
        await recordInvoicePaid(event.data.object);
        // Notification only fires on renewal (not initial signup).
        if (event.data.object?.billing_reason === 'subscription_cycle') {
          await enqueueRenewed(event, event.data.object);
        }
        break;
      case 'invoice.payment_failed':
        await markPastDue(event.data.object);
        if (event.data.object?.billing_reason === 'subscription_cycle') {
          await enqueuePaymentFailed(event, event.data.object);
        }
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscriptionStatus(event.data.object);
        if (event.type === 'customer.subscription.deleted') {
          await enqueueExpired(event, event.data.object);
        }
        break;
      default:
        // Spec: ignore other event types but log and 200.
        console.log('[webhook] ignoring event type:', event.type);
        break;
    }
    res.json({ received: true });
  } catch (err: any) {
    console.error('[Webhook] handler error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
