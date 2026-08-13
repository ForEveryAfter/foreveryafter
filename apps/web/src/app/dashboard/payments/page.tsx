'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Check, ChevronRight, Info, Loader2, CreditCard, AlertTriangle, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import {
  getSubscription,
  getPlans,
  getFamilyMembers,
  createCheckoutSession,
  getPaymentMethod,
  openBillingPortal,
  addPaymentMethod,
  finalizePaymentMethodSetup,
  getIncomingTransfers,
  approveTransfer,
  declineTransfer,
  cancelSubscription,
  reclaimPaymentOwnership,
  type Subscription,
  type Plan,
  type PaymentMethodInfo,
  type IncomingTransfer,
} from '@/lib/api';

function getCountdown(targetDate: Date) {
  const now = new Date();
  let years = targetDate.getFullYear() - now.getFullYear();
  let months = targetDate.getMonth() - now.getMonth();
  let days = targetDate.getDate() - now.getDate();

  if (days < 0) {
    months--;
    const prevMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 0);
    days += prevMonth.getDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }

  return { years: Math.max(0, years), months: Math.max(0, months), days: Math.max(0, days) };
}

export default function PaymentsPage() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [spouseName, setSpouseName] = useState('Spouse');
  const [loading, setLoading] = useState(true);
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [switchTo, setSwitchTo] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<ReturnType<typeof getCountdown> | null>(null);
  const [checkoutStatus, setCheckoutStatus] = useState<'success' | 'cancel' | null>(null);
  const [setupStatus, setSetupStatus] = useState<'success' | 'cancel' | null>(null);
  // Surface a finalize failure inline instead of silently logging — if Stripe
  // saved the card but our sync didn't land, the user needs to know (otherwise
  // they keep seeing "no card on file" and have no idea why).
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [plansError, setPlansError] = useState(false);
  const [subError, setSubError] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [pm, setPm] = useState<PaymentMethodInfo | null>(null);
  // Distinct from `pm === null` (which previously conflated "loading" and "fetch
  // failed" and "explicitly no card"). When the GET /payment-method call rejects,
  // we set this so the section can render "couldn't load card info" instead of a
  // misleading "no card on file yet" — which was indistinguishable from a real
  // empty state and made the wrong action ("Add payment method") look correct.
  const [pmError, setPmError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  // Holds the actual server message + which action failed, so the error text
  // names the right thing ("payment method" vs "billing portal") and gives the
  // user a real reason instead of a generic platitude.
  const [portalError, setPortalError] = useState<{ action: 'portal' | 'setup'; message: string } | null>(null);
  const [incoming, setIncoming] = useState<IncomingTransfer[]>([]);
  const [transferBusy, setTransferBusy] = useState<string | null>(null);
  // Cancel-subscription flow.
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState<{ endDate: string } | null>(null);
  // Reclaim-payment flow (owner takes payments back from a child).
  const [reclaimOpen, setReclaimOpen] = useState(false);
  const [reclaimBusy, setReclaimBusy] = useState(false);
  const [reclaimError, setReclaimError] = useState<string | null>(null);
  // When the parent clicks "Take back payments" with no card, we redirect them
  // to Stripe Checkout with intent=reclaim. On return, this flag is set so the
  // load() resolution can chain straight into the reclaim call. Held outside
  // React state so the chained effect can read it during the same paint cycle.
  const [pendingReclaim, setPendingReclaim] = useState(false);

  // (This effect's body intentionally moved into the unified mount effect below
  // so finalize is AWAITED before the first load(). Keeping two on-mount effects
  // led to a race where the bare load() read stale DB rows and rendered "no card
  // on file" even after Stripe redirected back with a session_id.)

  // Coverage and the owner/spouse names all come from the DB / session — nothing hardcoded.
  const hasSpouse = sub?.coverage === 'both';
  const ownerFirst = user?.name?.trim().split(/\s+/)[0] || '';
  const ownerLabel = ownerFirst ? `${ownerFirst}’s Guide` : 'Your Guide';
  const nextPaymentDate = sub?.nextPaymentAt ? new Date(sub.nextPaymentAt) : null;

  // Load the plan catalog + this user's active subscription INDEPENDENTLY, so a
  // failure in one doesn't blank the other. A thrown fetch = "couldn't load" (show
  // a retry); a null subscription / empty plans = a genuine empty state.
  //
  // `preservePm` skips the payment-method fetch + state update. Set true after
  // finalize has already painted `pm` from the authoritative Stripe session
  // response — re-reading the DB would risk clobbering known-good data with a
  // stale or in-progress mirror.
  const load = useCallback(async (opts: { preservePm?: boolean } = {}) => {
    setLoading(true);
    setPlansError(false);
    setSubError(false);
    const fetches: Array<Promise<any>> = [getPlans(), getSubscription(), getIncomingTransfers()];
    if (!opts.preservePm) fetches.push(getPaymentMethod());
    const settled = await Promise.allSettled(fetches);
    const [p, s, inc, m] = settled;

    if (p.status === 'fulfilled') setPlans(p.value);
    else setPlansError(true);

    // Distinguish "the read succeeded and says no card" from "the read failed".
    // The latter previously looked identical to the former, so a 500 on
    // /payment-method silently rendered "Add payment method" with no error.
    if (m) {
      if (m.status === 'fulfilled') {
        setPm(m.value);
        setPmError(null);
      } else {
        setPm(null);
        setPmError((m as PromiseRejectedResult).reason?.message || 'Couldn’t load card info');
      }
    }
    setIncoming(inc.status === 'fulfilled' ? inc.value : []); // takeover requests (best-effort)

    if (s.status === 'fulfilled') {
      setSub(s.value);
      if (s.value?.planType) setCurrentPlan(s.value.planType);
      if (s.value?.coverage === 'both') {
        getFamilyMembers()
          .then((fam) => {
            const spouse = fam.find((m) => m.relationship?.toLowerCase() === 'spouse');
            if (spouse) setSpouseName(spouse.display_name);
          })
          .catch(() => {}); // spouse name is cosmetic
      }
    } else {
      setSubError(true);
    }
    setLoading(false);
  }, []);

  // Unified on-mount: parse the URL params, finalize the setup session if there
  // is one, THEN do the first load(). Awaiting finalize before load is what kills
  // the "card saved banner + no card on file" inconsistency — if we kicked off
  // load() in parallel, it'd read the DB before finalize had a chance to write.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const c = params.get('checkout');
      const s = params.get('setup');
      const intent = params.get('intent');
      const sessionId = params.get('session_id');
      if (c === 'success' || c === 'cancel') setCheckoutStatus(c);
      if (s === 'success' || s === 'cancel') setSetupStatus(s);
      if (s === 'success' && intent === 'reclaim') setPendingReclaim(true);
      if (c || s) window.history.replaceState({}, '', '/dashboard/payments');

      // Finalize first when the redirect carried a session_id. The response
      // carries the authoritative PaymentMethod from Stripe — paint `pm`
      // directly from it so the success UI doesn't depend on the subsequent
      // load() finding the row we just wrote. If finalize throws (Stripe
      // setup wasn't actually complete, attach to user failed, etc.), we
      // surface the actual server message in the red banner.
      let pmAlreadySet = false;
      if (s === 'success' && sessionId) {
        try {
          const result = await finalizePaymentMethodSetup(sessionId);
          if (!cancelled) {
            // Defend against an older server build that returns just
            // { finalized: true } without `paymentMethod`. setPm(undefined)
            // would silently render as "no card on file" — exactly the bug
            // we keep hitting. If the field is missing, that's a deploy
            // mismatch, not a happy path.
            if (!result?.paymentMethod || typeof result.paymentMethod.hasMethod !== 'boolean') {
              setFinalizeError(
                'Finalize succeeded but the response didn’t include a paymentMethod ' +
                '(server may be running an older build — try restarting the API process). ' +
                `Raw response: ${JSON.stringify(result)}`
              );
            } else {
              setPm(result.paymentMethod);
              setPmError(null);
              pmAlreadySet = true;
              // dbWriteWarning means the card IS on Stripe (the truth) but
              // our DB mirror failed. Card still appears via the response
              // above; the next page reload via load() may briefly disagree
              // until the webhook lands. Tell the user what happened plainly.
              if (result.dbWriteWarning) {
                setFinalizeError(
                  `Card saved on Stripe (${result.stripePaymentMethodId}), but local mirror failed: ${result.dbWriteWarning}. ` +
                  `It should self-heal once the Stripe webhook lands.`
                );
              }
            }
          }
        } catch (err: any) {
          if (!cancelled) {
            setFinalizeError(err?.message || 'Card was saved on Stripe but couldn’t sync — please refresh.');
          }
        }
      }

      // preservePm: don't re-fetch /payment-method if finalize already painted
      // pm from Stripe's authoritative response. The other reads (sub, plans,
      // transfers) still need to run.
      if (!cancelled) await load({ preservePm: pmAlreadySet });
    })();
    return () => { cancelled = true; };
  }, [load]);

  // Tick the countdown once the next-payment date is known.
  useEffect(() => {
    if (!nextPaymentDate) return;
    setCountdown(getCountdown(nextPaymentDate));
    const timer = setInterval(() => setCountdown(getCountdown(nextPaymentDate)), 60000);
    return () => clearInterval(timer);
  }, [sub?.nextPaymentAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const isGreen = !!countdown && (countdown.months >= 6 || countdown.years >= 1);
  const switchPlan = switchTo ? plans.find((p) => p.id === switchTo) : null;

  // Approve / decline a child's request to take over ongoing payments.
  const actOnTransfer = async (id: string, fn: (id: string) => Promise<unknown>) => {
    if (transferBusy) return;
    setTransferBusy(id);
    try {
      await fn(id);
      setIncoming(await getIncomingTransfers());
    } catch {
      /* leave the request in place; the row stays actionable */
    } finally {
      setTransferBusy(null);
    }
  };

  // Format an ISO timestamp as "April 1, 2027" — used in the cancel confirmation
  // modal + success banner so the end date is concrete and unambiguous.
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Cancel subscription (owner-only path, gated server-side too). On success the sub
  // is flagged cancel-at-period-end; the modal closes and a success banner appears.
  const confirmCancel = async () => {
    if (cancelBusy) return;
    setCancelBusy(true);
    setCancelError(null);
    try {
      const { endDate } = await cancelSubscription();
      setCancelSuccess({ endDate });
      setCancelOpen(false);
      setSub((prev) => (prev ? { ...prev, cancelAtPeriodEnd: true } : prev));
    } catch (err: any) {
      setCancelError(err?.message || 'Could not cancel right now. Please try again.');
    } finally {
      setCancelBusy(false);
    }
  };

  // Reclaim payments (owner takes payments back from a child). On success the
  // sub flips back to billing_owner='self' and the page refetches so the
  // banner + payment method section update.
  const confirmReclaim = async () => {
    if (reclaimBusy) return;
    setReclaimBusy(true);
    setReclaimError(null);
    try {
      await reclaimPaymentOwnership();
      setReclaimOpen(false);
      // Refetch subscription + payment method so the banner flips immediately.
      await load();
    } catch (err: any) {
      setReclaimError(err?.message || 'Could not reclaim right now. Please try again.');
    } finally {
      setReclaimBusy(false);
    }
  };

  // Auto-fire reclaim on return from Stripe Checkout if the user came through
  // the "Take back payments → add a card first" flow. We wait for load() to
  // populate `sub` (so we know billingOwner) before firing, and bail if the
  // server already flipped us off 'child' (e.g. the user navigated back). On
  // failure, surface the error in the same modal as the normal flow.
  useEffect(() => {
    if (!pendingReclaim) return;
    if (loading || !sub) return;
    setPendingReclaim(false);
    if (sub.billingOwner !== 'child') return; // nothing to reclaim
    (async () => {
      setReclaimBusy(true);
      setReclaimError(null);
      try {
        await reclaimPaymentOwnership();
        await load();
      } catch (err: any) {
        setReclaimError(err?.message || 'Card was saved, but couldn’t take back payments. Please try again.');
        setReclaimOpen(true); // re-open so the user sees the error
      } finally {
        setReclaimBusy(false);
      }
    })();
  }, [pendingReclaim, loading, sub, load]);

  // Show the Cancel button only to the guide owner who is also the current payer:
  // a child takeover (billingOwner != 'self') means the child would have to cancel
  // their payment — handled in the child-overview UI, not here.
  const isSelfPaying = sub?.billingOwner === 'self';
  const alreadyCancelling = !!sub?.cancelAtPeriodEnd;
  const canShowCancel = !!sub && isSelfPaying && !alreadyCancelling;
  // Reclaim is available when the sub exists AND it's currently 'child' paying.
  const canShowReclaim = !!sub && sub.billingOwner === 'child';

  // Update an existing card (portal) or add the first one (setup-mode Checkout).
  // We surface the actual server message so a "No such customer" or "Stripe is
  // down" gives the user something they can act on (or send us), not a smile.
  const manageCard = async (kind: 'portal' | 'setup') => {
    if (portalLoading) return;
    setPortalLoading(true);
    setPortalError(null);
    try {
      const { url } = await (kind === 'portal' ? openBillingPortal() : addPaymentMethod());
      window.location.href = url;
    } catch (err: any) {
      setPortalError({ action: kind, message: err?.message || 'Unknown error' });
      setPortalLoading(false);
    }
  };

  // The "Your card on file" card — rendered unconditionally below the sub is
  // known. When `pm` is null (transient fetch error), we still surface the add
  // affordance with a quiet retry so the user is never left without a way in.
  const paymentMethodCard = sub ? (
    <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm p-8 mb-10">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-zinc-50 rounded-xl flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-zinc-400" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              {isSelfPaying ? 'Payment method' : 'Your card on file'}
            </p>
            {/* Four explicit states (was two): loading, fetch-failed, has-card,
                no-card. The previous two-state render silently collapsed
                fetch-failed onto no-card, which is exactly how a 500 on
                /payment-method ended up showing "Add payment method" as if
                that were the right next step. */}
            {pmError ? (
              <p className="text-sm text-red-600">
                Couldn’t load card info — {pmError}.{' '}
                <button onClick={() => void load()} className="font-bold underline">Try again</button>
              </p>
            ) : pm === null ? (
              <p className="text-sm text-zinc-400 inline-flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
              </p>
            ) : pm.hasMethod ? (
              <>
                <p className="font-bold text-navy">
                  {pm.brand ? pm.brand[0].toUpperCase() + pm.brand.slice(1) : 'Card'} •••• {pm.last4}
                  <span className="font-normal text-zinc-400">
                    {pm.name ? ` · ${pm.name}` : ''}
                    {pm.expMonth ? ` · exp ${String(pm.expMonth).padStart(2, '0')}/${pm.expYear}` : ''}
                  </span>
                </p>
                {/* When a child is paying, make it explicit that this card is the
                    parent's backup — not the one currently being charged — so they
                    don't second-guess who's covering the renewal. */}
                {!isSelfPaying && (
                  <p className="text-xs text-zinc-400 mt-1">
                    Not currently being charged — used only if you take back payments.
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-zinc-400">
                {isSelfPaying
                  ? 'No card on file yet.'
                  : 'No card on file yet — add one so you’re ready if you take back payments.'}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={() => manageCard(pm?.hasMethod ? 'portal' : 'setup')}
          // Disabled while loading (pm null + no error) — we don't yet know
          // whether to send them to "Add" or "Update", and rendering "Add" too
          // eagerly is exactly how a slow load got mistaken for "no card on file".
          disabled={portalLoading || (pm === null && !pmError)}
          className="text-sm font-bold text-white bg-[#4A5E52] hover:bg-[#4A5E52]/90 px-5 py-2.5 rounded-xl disabled:opacity-60 flex items-center gap-2 shrink-0"
        >
          {portalLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          {pm?.hasMethod ? 'Update payment method' : 'Add payment method'}
        </button>
      </div>
      {portalError && (
        <p className="text-sm text-red-600 mt-3">
          {portalError.action === 'portal'
            ? 'Couldn’t open the billing portal'
            : 'Couldn’t start adding a payment method'}
          {' — '}{portalError.message}
        </p>
      )}
    </div>
  ) : null;

  // The "Take back payments" affordance — only shown when a child is paying.
  // ALWAYS clickable. If no card is on file, click branches into the add-card
  // flow (Stripe Checkout setup mode) with intent=reclaim; on return, the
  // pendingReclaim effect above fires the reclaim. If a card IS on file,
  // click opens the existing confirmation modal. The two states are conceptually
  // distinct — "add a card" is billing hygiene, "take back payments" is a
  // commitment — but the UI shouldn't make the user perform them as two
  // separate user actions.
  const reclaimRow = canShowReclaim ? (
    <div className="mb-10 flex items-center justify-between gap-4 flex-wrap text-sm">
      <p className="text-zinc-500">
        Want to take payments back?{' '}
        <span className="text-zinc-400">
          {pm?.hasMethod
            ? 'Your card above will be charged at the next renewal.'
            : 'We’ll capture a card first, then take back payments.'}
        </span>
      </p>
      <button
        onClick={() => { setReclaimError(null); setReclaimOpen(true); }}
        disabled={reclaimBusy || portalLoading}
        className="text-sm font-bold text-[#4A5E52] hover:text-[#4A5E52]/80 underline underline-offset-4 disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed inline-flex items-center gap-2"
      >
        {(reclaimBusy || (portalLoading && pendingReclaim)) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        Take back payments
      </button>
    </div>
  ) : null;

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 font-inter text-navy">
      <div className="mb-10">
        <h1 className="font-playfair text-3xl font-black mb-2">Payments</h1>
        <p className="text-zinc-500">Manage your plan and billing.</p>
      </div>

      {/* Who's paying — owner sees either "You are" or "{Child} ({rel}) is paying".
          Sits at the top of the page so the answer is unambiguous regardless of
          which plan they're on or how the countdown reads. */}
      {sub && (
        <div className={`mb-8 flex items-start gap-2 rounded-2xl px-5 py-4 text-sm font-medium border ${
          isSelfPaying
            ? 'bg-[#4A5E52]/5 border-[#4A5E52]/20 text-[#4A5E52]'
            : 'bg-amber-50 border-amber-100 text-amber-800'
        }`}>
          <CreditCard className="w-4 h-4 mt-0.5 shrink-0" />
          {isSelfPaying ? (
            <span>
              <strong>You're paying</strong> for this guide. The card on file below is the one we'll charge at each renewal.
            </span>
          ) : sub.payerName ? (
            <span>
              <strong>{sub.payerName}</strong>
              {sub.payerRelationship ? ` (${sub.payerRelationship})` : ''}
              {' '}is paying for this guide. Their card will be charged at the next renewal on{' '}
              <strong>{sub.expiresAt ? formatDate(sub.expiresAt) : 'the next renewal date'}</strong>.
            </span>
          ) : (
            <span>
              A family member is currently paying for this guide. Their card will be charged at the next renewal
              {sub.expiresAt ? <> on <strong>{formatDate(sub.expiresAt)}</strong></> : null}.
            </span>
          )}
        </div>
      )}

      {cancelSuccess && (
        <div className="mb-8 flex items-start gap-2 bg-[#4A5E52]/5 border border-[#4A5E52]/20 text-[#4A5E52] rounded-2xl px-5 py-4 text-sm font-medium">
          <Check className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Your subscription has been cancelled. Your guide stays accessible until{' '}
            <strong>{formatDate(cancelSuccess.endDate)}</strong>.
          </span>
        </div>
      )}
      {!cancelSuccess && alreadyCancelling && sub?.expiresAt && (
        <div className="mb-8 flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl px-5 py-4 text-sm font-medium">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Cancellation scheduled — your guide stays accessible until{' '}
            <strong>{formatDate(sub.expiresAt)}</strong>, then guide data will be deleted.
          </span>
        </div>
      )}
      {checkoutStatus === 'success' && (
        <div className="mb-8 flex items-center gap-2 bg-[#4A5E52]/5 border border-[#4A5E52]/20 text-[#4A5E52] rounded-2xl px-5 py-4 text-sm font-medium">
          <Check className="w-4 h-4" /> Payment successful — your plan will update momentarily.
        </div>
      )}
      {checkoutStatus === 'cancel' && (
        <div className="mb-8 flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-2xl px-5 py-4 text-sm font-medium">
          <Info className="w-4 h-4" /> Checkout was canceled — no charge was made.
        </div>
      )}
      {setupStatus === 'success' && !finalizeError && (
        <div className="mb-8 flex items-center gap-2 bg-[#4A5E52]/5 border border-[#4A5E52]/20 text-[#4A5E52] rounded-2xl px-5 py-4 text-sm font-medium">
          <Check className="w-4 h-4" /> Payment method saved — it’ll appear here momentarily.
        </div>
      )}
      {/* If finalize failed, the card IS saved on Stripe's side but our DB
          didn't get the update. Tell the user something concrete — silent
          "no card on file" with no signal is the failure mode we just lived. */}
      {finalizeError && (
        <div className="mb-8 flex items-start gap-2 bg-red-50 border border-red-200 text-red-800 rounded-2xl px-5 py-4 text-sm font-medium">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            <strong>Your card was saved on Stripe</strong>, but we couldn’t sync it here ({finalizeError}).
            Try refreshing — if it still doesn’t appear, we may need to look at it.
          </span>
        </div>
      )}
      {setupStatus === 'cancel' && (
        <div className="mb-8 flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-2xl px-5 py-4 text-sm font-medium">
          <Info className="w-4 h-4" /> Adding a card was canceled.
        </div>
      )}

      {/* Incoming payment-takeover requests — a family member asked to become the payer */}
      {incoming.length > 0 && (
        <div className="bg-white rounded-3xl border border-amber-200 shadow-sm p-8 mb-12">
          <div className="flex items-center gap-2.5 mb-4">
            <CreditCard className="w-4 h-4 text-amber-500" />
            <h2 className="font-bold text-navy text-sm">Payment takeover requests</h2>
          </div>
          <div className="space-y-3">
            {incoming.map((t) => (
              <div key={t.id} className="bg-zinc-50 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
                <p className="text-sm text-navy">
                  <span className="font-bold">{t.requesterName}</span> has requested to take over ongoing payments
                  {t.cardLast4 ? (
                    <> with {t.cardBrand ? t.cardBrand[0].toUpperCase() + t.cardBrand.slice(1) : 'a card'} ending {t.cardLast4}</>
                  ) : null}.
                </p>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => actOnTransfer(t.id, approveTransfer)}
                    disabled={transferBusy === t.id}
                    className="bg-[#4A5E52] text-white font-bold text-xs px-4 py-2 rounded-lg hover:bg-[#4A5E52]/90 transition-colors disabled:opacity-60 inline-flex items-center gap-1.5"
                  >
                    {transferBusy === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve
                  </button>
                  <button
                    onClick={() => actOnTransfer(t.id, declineTransfer)}
                    disabled={transferBusy === t.id}
                    className="bg-white text-navy font-bold text-xs px-4 py-2 rounded-lg border border-zinc-200 hover:bg-zinc-50 transition-colors disabled:opacity-60"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next-payment countdown */}
      <div className="bg-white rounded-[32px] border border-zinc-100 shadow-sm p-10 md:p-14 mb-12 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-8">Time until your next payment</p>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-zinc-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading your plan…
          </div>
        ) : subError ? (
          <p className="py-6 text-sm text-zinc-400">
            Couldn’t load your plan right now.{' '}
            <button onClick={() => void load()} className="font-bold text-[#4A5E52] hover:underline">Try again</button>
          </p>
        ) : !countdown || !nextPaymentDate ? (
          <p className="py-6 text-sm text-zinc-400">No active subscription on file.</p>
        ) : (
          <>
            <div className="flex items-center justify-center gap-6 md:gap-10">
              {[
                { label: 'Years', value: countdown.years },
                { label: 'Months', value: countdown.months },
                { label: 'Days', value: countdown.days },
              ].map((block) => (
                <div key={block.label} className="flex flex-col items-center gap-2">
                  <span className={`text-5xl md:text-7xl font-black tabular-nums ${isGreen ? 'text-[#4A5E52]' : 'text-amber-500'}`}>
                    {String(block.value).padStart(2, '0')}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{block.label}</span>
                </div>
              ))}
            </div>
            <p className="mt-8 text-sm text-zinc-500">
              Next payment due{' '}
              <span className="font-bold text-navy">
                {nextPaymentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
            </p>
            {isGreen && (
              <div className="mt-3 inline-flex items-center gap-2 bg-[#4A5E52]/5 text-[#4A5E52] px-4 py-2 rounded-full">
                <Check className="w-4 h-4" />
                <span className="text-xs font-bold">Over 6 months until your next payment</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Card on file — ABOVE plans when a child is paying, because the parent's
          primary action here is "get my fallback card ready, then reclaim". For
          self-paying owners the section sits below plans (its original spot). */}
      {!isSelfPaying && paymentMethodCard}
      {!isSelfPaying && reclaimRow}

      {/* Plan Cards */}
      <div className="mb-10">
        <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-6">Plan Options</h2>

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-zinc-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading plans…
          </div>
        ) : plansError ? (
          <p className="py-6 text-sm text-zinc-400">
            Couldn’t load plans right now.{' '}
            <button onClick={() => void load()} className="font-bold text-[#4A5E52] hover:underline">Try again</button>
          </p>
        ) : plans.length === 0 ? (
          <p className="py-6 text-sm text-zinc-400">No plans available.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => {
              const isCurrent = currentPlan === plan.id;
              const total = hasSpouse ? plan.price + plan.spouseAddon : plan.price;

              return (
                <div
                  key={plan.id}
                  onClick={() => {
                    if (!isCurrent) setSwitchTo(plan.id);
                  }}
                  className={`relative bg-white rounded-3xl p-8 transition-all cursor-pointer ${
                    isCurrent
                      ? 'border-[1.5px] border-[#4A5E52] shadow-lg'
                      : 'border border-zinc-100 shadow-sm hover:shadow-md hover:-translate-y-0.5'
                  }`}
                >
                  {isCurrent && (
                    <div className="absolute -top-3 left-6 bg-[#4A5E52] text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
                      Current plan
                    </div>
                  )}
                  <div className="space-y-4">
                    <h3 className="font-bold text-navy text-lg">{plan.name}</h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-black text-navy">${total}</span>
                      <span className="text-xs text-zinc-400">{plan.period}</span>
                    </div>

                    {hasSpouse && (
                      <div className="pt-3 border-t border-zinc-50 space-y-1">
                        <div className="flex justify-between text-[10px] text-zinc-400">
                          <span>{ownerLabel}</span>
                          <span>${plan.price}</span>
                        </div>
                        <div className="flex justify-between text-[10px] text-[#4A5E52] font-bold">
                          <span>{spouseName} Add-on</span>
                          <span>+${plan.spouseAddon}</span>
                        </div>
                      </div>
                    )}

                    {plan.features.length > 0 && (
                      <div className="space-y-2 pt-2">
                        {plan.features.map((feature) => (
                          <div key={feature} className="flex items-center gap-2 text-xs text-zinc-500">
                            <Check className="w-3.5 h-3.5 text-[#4A5E52]" /> {feature}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Card on file (self-paying case) — below plans, in its original spot.
          Always rendered when the sub is known, so a transient pm fetch error
          can never silently hide the affordance. */}
      {isSelfPaying && paymentMethodCard}

      {/* Cancel subscription — guide owner who is the current payer (billingOwner='self'),
          and only when a cancel isn't already scheduled. */}
      {canShowCancel && (
        <div className="mb-10 flex items-center justify-between gap-4 flex-wrap text-sm">
          <p className="text-zinc-500">
            Need to stop auto-renew?{' '}
            <span className="text-zinc-400">
              Your guide stays available until the end of the current term, then guide data will be deleted.
            </span>
          </p>
          <button
            onClick={() => { setCancelError(null); setCancelOpen(true); }}
            className="text-sm font-bold text-red-600 hover:text-red-700 underline underline-offset-4"
          >
            Cancel subscription
          </button>
        </div>
      )}

      {/* Switch Plan Confirmation */}
      {switchPlan && switchTo !== currentPlan && (
        <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm p-8 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-start gap-4">
            <Info className="w-5 h-5 text-[#4A5E52] shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="text-sm text-navy font-medium">
                Switch to the <span className="font-bold">{switchPlan.name}</span> plan?
              </p>
              {hasSpouse && (
                <p className="text-xs text-zinc-500 italic">
                  This includes the spouse add-on for {spouseName}. Your combined total would be{' '}
                  <span className="font-bold text-navy">${switchPlan.price + switchPlan.spouseAddon}</span>.
                </p>
              )}
              <p className="text-[10px] text-zinc-400">
                You’ll be taken to Stripe’s secure checkout to complete payment.
              </p>
            </div>
          </div>
          {payError && <p className="text-sm text-red-600">{payError}</p>}
          <div className="flex justify-end gap-3">
            <button onClick={() => setSwitchTo(null)} disabled={switching} className="text-sm text-zinc-400 hover:text-navy font-medium px-4 py-2 disabled:opacity-50">
              Cancel
            </button>
            <button
              onClick={async () => {
                if (!switchTo || switching) return;
                setSwitching(true);
                setPayError(null);
                try {
                  const { url } = await createCheckoutSession(switchTo, hasSpouse ? 'both' : 'single');
                  window.location.href = url;
                } catch {
                  setPayError('Payments aren’t available right now — your plan details are unaffected. Please try again later.');
                  setSwitching(false);
                }
              }}
              disabled={switching}
              className="bg-[#4A5E52] text-white font-bold text-sm px-6 py-3 rounded-xl hover:bg-[#4A5E52]/90 transition-all flex items-center gap-2 disabled:opacity-70"
            >
              {switching ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Continue to payment <ChevronRight className="w-4 h-4" /></>}
            </button>
          </div>
        </div>
      )}

      {/* Cancel Subscription confirmation modal */}
      {cancelOpen && sub?.expiresAt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-navy/20 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="px-8 py-6 bg-zinc-50 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="font-bold text-navy flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Cancel your subscription?
              </h3>
              <button
                onClick={() => { if (!cancelBusy) setCancelOpen(false); }}
                disabled={cancelBusy}
                className="text-zinc-300 hover:text-navy transition-colors disabled:opacity-40"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-8 space-y-5">
              <p className="text-sm text-zinc-600 leading-relaxed">
                Cancelling stops your subscription from auto-renewing. Your guide stays accessible until{' '}
                <strong className="text-navy">{formatDate(sub.expiresAt)}</strong>, after which{' '}
                <strong>all guide data will be deleted</strong>.
              </p>
              {cancelError && <p className="text-sm text-red-600">{cancelError}</p>}
              <div className="flex gap-3">
                <button
                  onClick={() => { if (!cancelBusy) setCancelOpen(false); }}
                  disabled={cancelBusy}
                  className="flex-1 py-3 font-bold text-zinc-500 hover:text-navy transition-colors disabled:opacity-50"
                >
                  Keep subscription
                </button>
                <button
                  onClick={confirmCancel}
                  disabled={cancelBusy}
                  className="flex-[2] bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {cancelBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Continue'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reclaim payments confirmation modal */}
      {reclaimOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-navy/20 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="px-8 py-6 bg-zinc-50 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="font-bold text-navy flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-[#4A5E52]" />
                Take back payments?
              </h3>
              <button
                onClick={() => { if (!reclaimBusy) setReclaimOpen(false); }}
                disabled={reclaimBusy}
                className="text-zinc-300 hover:text-navy transition-colors disabled:opacity-40"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-8 space-y-5">
              <p className="text-sm text-zinc-600 leading-relaxed">
                {sub?.payerName ? (
                  <>
                    <strong className="text-navy">{sub.payerName}</strong>
                    {sub.payerRelationship ? ` (${sub.payerRelationship})` : ''} will no
                    longer be charged for your guide. Their card will be removed and they'll
                    be notified.
                  </>
                ) : (
                  <>The family member currently paying for your guide will no longer be
                  charged. Their card will be removed and they'll be notified.</>
                )}{' '}
                {pm?.hasMethod ? (
                  <>
                    Your card on file will be used at the next renewal on{' '}
                    <strong className="text-navy">{sub?.expiresAt ? formatDate(sub.expiresAt) : 'the next renewal date'}</strong>.
                  </>
                ) : (
                  <>
                    We’ll take you to Stripe to add a card first — once it’s saved,
                    we’ll immediately take back payments. Your new card will be charged
                    at the next renewal on{' '}
                    <strong className="text-navy">{sub?.expiresAt ? formatDate(sub.expiresAt) : 'the next renewal date'}</strong>.
                  </>
                )}
              </p>
              {reclaimError && <p className="text-sm text-red-600">{reclaimError}</p>}
              <div className="flex gap-3">
                <button
                  onClick={() => { if (!reclaimBusy) setReclaimOpen(false); }}
                  disabled={reclaimBusy}
                  className="flex-1 py-3 font-bold text-zinc-500 hover:text-navy transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    // Branch on card-on-file. If the parent has a card, run the
                    // reclaim immediately. If not, kick off the add-card flow
                    // with intent=reclaim — the page picks it up on return and
                    // chains into the reclaim automatically.
                    if (pm?.hasMethod) return confirmReclaim();
                    if (portalLoading) return;
                    setReclaimError(null);
                    setPortalLoading(true);
                    try {
                      const { url } = await addPaymentMethod('reclaim');
                      window.location.href = url;
                    } catch (err: any) {
                      setReclaimError(err?.message || 'Couldn’t start the add-card step. Please try again.');
                      setPortalLoading(false);
                    }
                  }}
                  disabled={reclaimBusy || portalLoading}
                  className="flex-[2] bg-[#4A5E52] text-white font-bold py-3 rounded-xl hover:bg-[#4A5E52]/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {(reclaimBusy || portalLoading) ? <Loader2 className="w-4 h-4 animate-spin" /> : (pm?.hasMethod ? 'Take back payments' : 'Add a card & take back payments')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
