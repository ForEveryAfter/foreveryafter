import { Router } from 'express';
import { supabase } from '../shared/supabase';
import { stripe, isStripeConfigured } from '../shared/stripe';
import { sendSubscriptionCancelledEmail } from '../shared/notification-emails';
import { attachPaymentMethodFromSetup } from '../webhooks/stripe';

const router = Router();

const webBase = () => process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000';

// Session auth, scoped to the internal profiles.user_id (never a client header).
const requireUser = (req: any, res: any, next: any) => {
  if (!req.isAuthenticated?.() || !req.user?.userId) {
    return res.status(401).json({ error: 'Unauthenticated or profile not provisioned' });
  }
  next();
};

// POST /checkout — create a Stripe Checkout Session for the selected plan and
// return its URL. Annual is a recurring subscription; the multi-year plans are
// one-time payments. No card data touches us — Stripe hosts the page. The webhook
// (checkout.session.completed) is what actually provisions the subscription.
router.post('/checkout', requireUser, async (req: any, res) => {
  if (!isStripeConfigured()) {
    return res.status(503).json({ error: 'Payments are not configured yet (missing STRIPE_SECRET_KEY).' });
  }
  try {
    const planId = String(req.body?.planId || '').replace(/-/g, '_'); // accept 'five-year' or 'five_year'
    const coverage = req.body?.coverage === 'both' ? 'both' : 'single';

    const { data: plan, error } = await supabase
      .from('subscription_plans')
      .select('id, name, price_cents, spouse_addon_cents')
      .eq('id', planId)
      .maybeSingle();
    if (error) throw error;
    if (!plan) return res.status(400).json({ error: 'Unknown plan' });

    const amount = plan.price_cents + (coverage === 'both' ? plan.spouse_addon_cents : 0);
    const recurring = planId === 'annual'; // only the annual plan auto-renews pre-release

    const session = await stripe.checkout.sessions.create({
      mode: recurring ? 'subscription' : 'payment',
      client_reference_id: req.user.userId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: amount,
            product_data: { name: `ForEveryAfter ${plan.name}${coverage === 'both' ? ' + spouse' : ''}` },
            ...(recurring ? { recurring: { interval: 'year' as const } } : {}),
          },
        },
      ],
      metadata: { userId: req.user.userId, guid: req.user.guid, planId, coverage },
      ...(recurring
        ? { subscription_data: { metadata: { userId: req.user.userId, planId, coverage } } }
        : {}),
      success_url: `${webBase()}/dashboard/payments?checkout=success`,
      cancel_url: `${webBase()}/dashboard/payments?checkout=cancel`,
    });

    res.json({ url: session.url });
  } catch (err: any) {
    console.error('[Billing] checkout error:', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Verify a Stripe customer id actually exists. Stale references happen — copied
// fixtures, prod→staging clones, accidentally rotated Stripe keys, etc. We don't
// want every billing surface to 500 when the DB and Stripe disagree; we want to
// treat a missing customer as "no customer yet" and let the user move forward.
// Returns the id if it resolves to a live (non-deleted) customer, undefined if
// it's gone, and re-throws anything else (auth/network/etc).
async function verifyCustomer(customerId: string | undefined): Promise<string | undefined> {
  if (!customerId) return undefined;
  try {
    const c: any = await stripe.customers.retrieve(customerId);
    return c?.deleted ? undefined : customerId;
  } catch (err: any) {
    if (err?.code === 'resource_missing' || err?.statusCode === 404) {
      console.warn(`[Billing] stale Stripe customer ${customerId} — falling back to no-customer flow`);
      return undefined;
    }
    throw err;
  }
}

// Find the Stripe customer id for the user's latest subscription (set by the webhook).
async function customerIdFor(userId: string): Promise<{ subId?: string; billingOwner: string; customerId?: string }> {
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('id, billing_owner')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sub) return { billingOwner: 'self' };
  const { data: pay } = await supabase
    .from('payments')
    .select('processor_customer_id')
    .eq('subscription_id', sub.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return { subId: sub.id, billingOwner: sub.billing_owner || 'self', customerId: pay?.processor_customer_id || undefined };
}

// GET /payment-method — the card on file (brand + last4 + name + expiry) for the
// owner. Only non-sensitive display fields, fetched live from Stripe.
router.get('/payment-method', requireUser, async (req: any, res) => {
  if (!isStripeConfigured()) return res.json({ hasMethod: false, billingOwner: 'self' });
  try {
    const { billingOwner, customerId: rawCustomerId } = await customerIdFor(req.user.userId);
    // verifyCustomer returns undefined for stale/deleted IDs — treat those as
    // "no card on file" so the page can render the Add affordance instead of erroring.
    const customerId = await verifyCustomer(rawCustomerId);
    if (!customerId) return res.json({ hasMethod: false, billingOwner });

    const customer: any = await stripe.customers.retrieve(customerId);
    let pmId: string | undefined = customer?.invoice_settings?.default_payment_method || undefined;
    if (!pmId) {
      const pms = await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 });
      pmId = pms.data[0]?.id;
    }
    if (!pmId) return res.json({ hasMethod: false, billingOwner });

    const pm = await stripe.paymentMethods.retrieve(pmId);
    res.json({
      hasMethod: true,
      billingOwner,
      brand: pm.card?.brand ?? null,
      last4: pm.card?.last4 ?? null,
      expMonth: pm.card?.exp_month ?? null,
      expYear: pm.card?.exp_year ?? null,
      name: pm.billing_details?.name ?? null,
    });
  } catch (err: any) {
    console.error('[Billing] payment-method error:', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /payment-method/setup — add a card with NO charge via Checkout in setup mode.
// Works even with no existing Stripe customer (Stripe creates one). The webhook
// (checkout.session.completed, mode=setup) stores the customer + sets it as default.
// We prefill the user's email so they immediately see *their* identity at the top
// of Stripe Checkout — confidence that they're adding a card to the right account.
router.post('/payment-method/setup', requireUser, async (req: any, res) => {
  if (!isStripeConfigured()) return res.status(503).json({ error: 'Payments are not configured yet.' });
  try {
    const { customerId: rawCustomerId } = await customerIdFor(req.user.userId);
    // Stale customer IDs (test fixtures, prod→staging copies) would 404 Stripe
    // and block the user from EVER adding a card. Verify first; if it's gone,
    // create a fresh customer via the no-customer + customer_email branch.
    const customerId = await verifyCustomer(rawCustomerId);

    // `intent` is the chained next step the page wants to take AFTER the card
    // is captured. Currently only 'reclaim' is supported (parent adds a card
    // then immediately reclaims payments from a child). It rides in the
    // success_url query so /dashboard/payments can fire it on return.
    const intent = req.body?.intent === 'reclaim' ? 'reclaim' : null;
    const suffix = intent ? `&intent=${intent}` : '';

    // Email prefill is only honored by Stripe when creating a *new* customer
    // (passing both `customer` and `customer_email` errors). Pull it from the
    // profile so it survives a logged-in session that has no email field.
    // NB: profiles' PK is `user_id` (not `id`) per the baseline migration.
    let prefillEmail: string | undefined;
    if (!customerId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('user_id', req.user.userId)
        .maybeSingle();
      prefillEmail = profile?.email || undefined;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      currency: 'usd', // required for setup-mode Checkout (no line items to infer it from)
      ...(customerId ? { customer: customerId } : {}),
      ...(prefillEmail ? { customer_email: prefillEmail } : {}),
      metadata: { userId: req.user.userId, purpose: 'add_payment_method', ...(intent ? { intent } : {}) },
      // session_id is the Stripe template variable {CHECKOUT_SESSION_ID} — Stripe
      // expands it on redirect. The page POSTs it to /payment-method/finalize so
      // the DB gets the new customer+PM synchronously, without depending on the
      // checkout.session.completed webhook (which often isn't forwarded in dev).
      success_url: `${webBase()}/dashboard/payments?setup=success${suffix}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${webBase()}/dashboard/payments?setup=cancel${suffix}`,
    });
    res.json({ url: session.url });
  } catch (err: any) {
    console.error('[Billing] setup error:', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /payment-method/finalize — synchronously process a just-completed setup
// session. Belt-and-suspenders with the webhook: whichever fires first wins, the
// other is a no-op (idempotent via .update by id). Critical for dev where webhooks
// aren't forwarded, but harmless to run in prod — at worst the work was already
// done by the webhook a few hundred ms earlier.
router.post('/payment-method/finalize', requireUser, async (req: any, res) => {
  if (!isStripeConfigured()) return res.status(503).json({ error: 'Payments are not configured yet.' });
  const sessionId = typeof req.body?.session_id === 'string' ? req.body.session_id : null;
  if (!sessionId) return res.status(400).json({ error: 'Missing session_id.' });
  try {
    // Retrieve the session WITH the setup_intent + payment_method expanded so we
    // have the brand/last4/etc in a single round-trip. Stripe's response is the
    // authoritative record of the just-completed setup — we paint the UI from it
    // directly so the success path doesn't depend on a subsequent DB read landing
    // on the same row the write went to.
    const session: any = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['setup_intent', 'setup_intent.payment_method'],
    });
    if (session?.mode !== 'setup') return res.status(400).json({ error: 'Not a setup session.' });
    if (session?.metadata?.userId && session.metadata.userId !== req.user.userId) {
      return res.status(403).json({ error: 'Session belongs to a different user.' });
    }

    // Session status reflects whether the SetupIntent succeeded. 'complete' is
    // the only success state for setup mode — 'open' / 'expired' / SetupIntent
    // status of 'requires_action' or 'requires_payment_method' all mean the card
    // wasn't actually saved, and we must NOT pretend it was.
    if (session.status !== 'complete') {
      return res.status(422).json({ error: `Setup session not complete (status: ${session.status}).` });
    }
    const si: any = session.setup_intent;
    if (si?.status && si.status !== 'succeeded') {
      const lastErr = si.last_setup_error?.message || si.last_payment_error?.message || `status: ${si.status}`;
      return res.status(422).json({ error: `Card couldn’t be saved on Stripe — ${lastErr}` });
    }
    const pm = si?.payment_method;
    if (!pm || typeof pm !== 'object') {
      return res.status(422).json({ error: 'Stripe didn’t return a payment method on this session.' });
    }

    // Mirror the just-completed payment method into our DB. Failures here are
    // logged but don't fail the response: the Stripe-side record IS the truth,
    // and the UI is going to paint from `paymentMethod` below regardless. The
    // worst-case is the next page load goes through the DB read path and sees
    // the same Stripe record via the webhook's eventual write.
    let attachReason: string | null = null;
    try {
      const result = await attachPaymentMethodFromSetup(session);
      if (!result.ok) attachReason = result.reason;
    } catch (e: any) {
      attachReason = e?.message || 'unknown error';
      console.error('[Billing] finalize: attach threw', attachReason);
    }

    res.json({
      finalized: true,
      // The authoritative card details — shaped to match PaymentMethodInfo so
      // the client can drop it straight into the `pm` state.
      paymentMethod: {
        hasMethod: true,
        billingOwner: 'self', // setup is always for the calling user
        brand: pm.card?.brand ?? null,
        last4: pm.card?.last4 ?? null,
        expMonth: pm.card?.exp_month ?? null,
        expYear: pm.card?.exp_year ?? null,
        name: pm.billing_details?.name ?? null,
      },
      // Diagnostic — surfaces in the UI only if non-null. Card is saved on
      // Stripe either way; this just tells the user (and us) that the DB mirror
      // didn't take, so a future read could disagree until the webhook lands.
      dbWriteWarning: attachReason,
      stripeSessionId: session.id,
      stripePaymentMethodId: pm.id,
      stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
    });
  } catch (err: any) {
    console.error('[Billing] finalize error:', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /portal — open the Stripe Billing Portal so the owner can update their card
// (subscription + auto-renew keep working with the new payment method).
router.post('/portal', requireUser, async (req: any, res) => {
  if (!isStripeConfigured()) return res.status(503).json({ error: 'Payments are not configured yet.' });
  try {
    const { customerId: rawCustomerId } = await customerIdFor(req.user.userId);
    // Portal requires a real customer; if our stored ID is stale, surface a
    // clean message instead of leaking Stripe's "No such customer".
    const customerId = await verifyCustomer(rawCustomerId);
    if (!customerId) return res.status(400).json({ error: 'No payment account on file yet — add a card first.' });
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${webBase()}/dashboard/payments`,
    });
    res.json({ url: session.url });
  } catch (err: any) {
    console.error('[Billing] portal error:', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /subscription — the logged-in user's active subscription, with the date of
// their next payment. For an annual plan that's the renewal at expires_at; for the
// fixed-term (5/10-year) plans it's likewise when the paid term ends and renewal is due.
router.get('/subscription', requireUser, async (req: any, res) => {
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('id, plan_type, status, coverage, activated_at, expires_at, billing_owner, cancel_at_period_end')
      .eq('user_id', req.user.userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'No active subscription' });

    // billing_owner is a constrained enum ('self' | 'child') — it tells us
    // SOMEONE other than the parent is currently paying, but not who. WHO is
    // resolved via the latest approved payment_transfer_requests row for this
    // guide → requester_user_id → profile / family_members lookup.
    const ownerLabel = data.billing_owner || 'self';
    let payerName: string | null = null;
    let payerRelationship: string | null = null;
    if (ownerLabel === 'child') {
      // Find the guide owned by this parent so we can scope the takeover lookup.
      const { data: guide } = await supabase
        .from('guides')
        .select('id')
        .eq('parent_user_id', req.user.userId)
        .maybeSingle();
      if (guide?.id) {
        // Most recently approved/completed takeover row tells us who's paying.
        const { data: xfer } = await supabase
          .from('payment_transfer_requests')
          .select('requester_user_id')
          .eq('guide_id', guide.id)
          .in('status', ['approved', 'completed'])
          .order('decided_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const payerUserId = xfer?.requester_user_id || null;
        if (payerUserId) {
          // Profile name first — that's the canonical "real" name.
          const { data: profile } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('user_id', payerUserId)
            .maybeSingle();
          const fromProfile = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
          // Fall back to the family_members display_name the parent chose.
          const { data: fam } = await supabase
            .from('family_members')
            .select('display_name, relationship')
            .eq('parent_guid', req.user.userId)
            .eq('member_guid', payerUserId)
            .maybeSingle();
          payerName = fromProfile || fam?.display_name || null;
          payerRelationship = fam?.relationship || null;
        }
      }
    }

    res.json({
      planType: data.plan_type,
      status: data.status,
      coverage: data.coverage,
      activatedAt: data.activated_at,
      expiresAt: data.expires_at,
      nextPaymentAt: data.expires_at,
      billingOwner: ownerLabel,
      cancelAtPeriodEnd: !!data.cancel_at_period_end,
      payerName,
      payerRelationship,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /cancel — owner-initiated cancellation. Only the guide owner who is also the
// current payer (billing_owner='self') can cancel. Stops Stripe auto-renew, flips the
// DB flag, sends a confirmation email with the actual end date in the body.
router.post('/cancel', requireUser, async (req: any, res) => {
  try {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('id, status, expires_at, billing_owner, processor_subscription_id, cancel_at_period_end')
      .eq('user_id', req.user.userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!sub) return res.status(404).json({ error: 'No subscription found.' });
    if ((sub.billing_owner || 'self') !== 'self') {
      return res.status(403).json({ error: 'A family member is the current payer — they would need to cancel.' });
    }
    if (sub.status !== 'active') {
      return res.status(409).json({ error: `Subscription is ${sub.status}.` });
    }
    if (sub.cancel_at_period_end) {
      // Idempotent — already cancelled; just return the end date.
      return res.json({ cancelAtPeriodEnd: true, endDate: sub.expires_at });
    }

    // Stripe: stop auto-renew (subscription stays 'active' until the period ends).
    if (sub.processor_subscription_id && isStripeConfigured()) {
      try {
        await stripe.subscriptions.update(sub.processor_subscription_id, { cancel_at_period_end: true });
      } catch (e: any) {
        // DB is the source of truth — log and continue so the user's intent is recorded.
        console.error('[Billing] Stripe cancel error:', e?.message);
      }
    }

    // DB: flip the flag. Status stays 'active' until expires_at (renewal webhook
    // transitions it to 'canceled' when the term ends).
    await supabase
      .from('subscriptions')
      .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
      .eq('id', sub.id);

    // Email the confirmation. The end date is required to appear in the body.
    if (sub.expires_at) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('user_id', req.user.userId)
        .maybeSingle();
      if (profile?.email) {
        sendSubscriptionCancelledEmail({ to: profile.email, endDate: sub.expires_at }).catch(() => {});
      }
    }

    // TODO(cancel-cleanup): when expires_at passes, the renewal/cadence engine should
    // (1) flip subscriptions.status to 'canceled' (currently relies on the Stripe
    //     customer.subscription.deleted webhook — fine when Stripe is live), and
    // (2) delete the guide's data per "all guide data will be deleted at the end of
    //     the current payment term." Not built — needs the scheduler.

    res.json({ cancelAtPeriodEnd: true, endDate: sub.expires_at });
  } catch (err: any) {
    console.error('[Billing] cancel error:', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /plans — the active plan catalog the Payments page renders from.
router.get('/plans', requireUser, async (_req: any, res) => {
  try {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('id, name, price_cents, spouse_addon_cents, period, features')
      .eq('is_active', true)
      .order('sort_order');
    if (error) throw error;
    res.json(
      (data || []).map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price_cents / 100,
        spouseAddon: p.spouse_addon_cents / 100,
        period: p.period,
        features: p.features ?? [],
      }))
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /validate-code — validate a discount code and return discount details
router.post('/validate-code', async (req, res) => {
  const { code } = req.body;

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ valid: false, error: 'Code is required.' });
  }

  try {
    const { data, error } = await supabase
      .from('discount_codes')
      .select('*')
      .eq('code', code.trim())
      .eq('status', 'active')
      .single();

    if (error || !data) {
      return res.json({ valid: false, error: 'Code invalid.' });
    }

    const now = new Date();
    const startsAt = new Date(data.starts_at);
    const expiresAt = data.expires_at ? new Date(data.expires_at) : null;

    if (now < startsAt) {
      return res.json({ valid: false, error: 'Code invalid.' });
    }

    if (expiresAt && now > expiresAt) {
      return res.json({ valid: false, error: 'Code invalid.' });
    }

    if (data.max_uses && data.current_uses >= data.max_uses) {
      return res.json({ valid: false, error: 'Code invalid.' });
    }

    res.json({
      valid: true,
      discount_type: data.discount_type,
      discount_value: Number(data.discount_value),
      code: data.code,
    });
  } catch (err: any) {
    console.error('Discount code validation error:', err);
    res.status(500).json({ valid: false, error: 'Something went wrong.' });
  }
});

export default router;
