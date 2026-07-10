'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Clock, Heart, FileText, AlertCircle, ChevronRight,
  CreditCard, AlertTriangle, X, Loader2, Check, Info, Users, Tag, Lock, Play,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import {
  getParentGuides,
  getOutgoingTransfers,
  getIncomingTransfers,
  startTakeoverRequest,
  finalizeTakeoverRequest,
  cancelTransfer,
  approveTransfer,
  declineTransfer,
  cancelTakeoverPayment,
  getTakeoverPreview,
  fetchWithAuth,
  type OutgoingTransfer,
  type IncomingTransfer,
  type TakeoverPreview,
} from '@/lib/api';
import IntroVideoOverlay from '@/components/dashboard/IntroVideoOverlay';

// First-play intro video for Trusted Representatives. Sits at the top level of
// apps/web/public/ (not under /parent/) per the asset drop — keep this path in
// sync if the file is renamed or moved. The flag is per-user; the overlay
// only fires for users who actually carry a 'trusted_rep' role on at least
// one parent guide (immediate-family-only links never see it).
const TRUSTED_REP_INTRO_VIDEO =
  '/The Role of a Trusted Representative - LegacyBridge_1080p_caption.mp4';
const TRUSTED_REP_INTRO_FLAG = 'trusted_rep_intro_dismissed';
import {
  getCheckInStatus,
  relativeTime,
  type ParentRelationship,
} from '@/data/child-dashboard-mock';

// ─── Status Dot ───────────────────────────────────────────────────────────────
function StatusDot({ color }: { color: 'neutral' | 'yellow' | 'red' }) {
  const cls = { neutral: 'bg-zinc-300', yellow: 'bg-amber-400', red: 'bg-red-400' }[color];
  return <span className={`w-2 h-2 rounded-full ${cls} shrink-0`} />;
}

// ─── Status Tile (Check-in + Begin/Request Sharing) ──────────────────────────
function StatusTile({ rel, onCheckIn }: { rel: ParentRelationship; onCheckIn: () => void }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const name = rel.parentFirstName;
  const isTR = rel.roles.includes('trusted_rep');

  const checkIn = getCheckInStatus(rel.status);
  const lastCheckIn = relativeTime(rel.status.lastCheckInAt);
  const borderColor = isTR
    ? { neutral: 'border-l-zinc-300', yellow: 'border-l-amber-400', red: 'border-l-red-400' }[checkIn.color]
    : 'border-l-zinc-300';

  // Delegate to the parent component's handler, which hits POST /settings/checkin
  // with parentUserId=rel.parentId (the server then re-verifies TI status, advances
  // the parent's check-in clock, and audits the action).
  const handleConfirm = () => {
    onCheckIn();
    setShowConfirm(false);
  };

  return (
    <div className={`bg-white rounded-2xl border border-zinc-100 border-l-4 ${borderColor} shadow-sm`}>
      <div className="p-6 space-y-5">
        {/* Check-in section — only for Trusted Representatives */}
        {isTR && (
          <>
            <div className="space-y-4">
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-primary" />
                <h3 className="font-bold text-navy text-sm">Check in</h3>
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">
                When you&apos;ve spoken with {name} and want to confirm they&apos;re doing well.
              </p>
              <div className="bg-zinc-50 rounded-xl p-4 space-y-2">
                <p className="text-xs text-zinc-500">
                  {name} last checked in <span className="font-medium text-navy">{lastCheckIn}</span>
                </p>
                <div className="flex items-center gap-2">
                  <StatusDot color={checkIn.color} />
                  <span className={`text-xs font-medium ${
                    checkIn.color === 'red' ? 'text-red-600' : checkIn.color === 'yellow' ? 'text-amber-600' : 'text-zinc-500'
                  }`}>
                    {checkIn.label}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowConfirm(true)}
                className="w-full bg-primary text-white font-bold text-sm py-3 rounded-xl hover:bg-primary-hover transition-colors"
              >
                Check in. Say Hello
              </button>
            </div>
            <div className="border-t border-zinc-100" />
          </>
        )}

        {/* Sharing subsection */}
        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-300">When {name} has passed</p>
          {isTR ? (
            <>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Use this when {name} has passed and it&apos;s time to share what they prepared with the people they chose.
              </p>
              {rel.guideSubscriptionActive ? (
                <Link
                  href={`/dashboard/begin-sharing/${rel.parentId}`}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-navy transition-colors border border-zinc-200 px-4 py-2 rounded-lg hover:border-zinc-300"
                >
                  Begin Sharing <ChevronRight className="w-3 h-3" />
                </Link>
              ) : (
                <div className="space-y-1.5">
                  <span
                    aria-disabled
                    title="This guide's subscription has expired. Reactivate it before releasing."
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-300 border border-zinc-100 bg-zinc-50 px-4 py-2 rounded-lg cursor-not-allowed select-none"
                  >
                    Begin Sharing <ChevronRight className="w-3 h-3" />
                  </span>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    {name}&apos;s subscription has expired — it must be reactivated before the guide can be released.
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Use this when {name} has passed and it&apos;s time to request the trusted individual to share what they prepared with the people they chose.
              </p>
              <button
                onClick={() => {
                  // TODO: POST to /api/request-sharing when real API exists
                  console.log(`REQUEST_SHARING for ${rel.parentId}`);
                  alert('Your request has been sent to the trusted individual.');
                }}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-navy transition-colors border border-zinc-200 px-4 py-2 rounded-lg hover:border-zinc-300"
              >
                Request Sharing <ChevronRight className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Check-in confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-navy/20 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-[32px] shadow-2xl p-10 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <h3 className="font-bold text-navy text-lg">Confirm {name} is doing well?</h3>
            <p className="text-sm text-zinc-500 leading-relaxed">
              This will reset the check-in timer and confirm that {name} is safe and well.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirm(false)} className="flex-1 py-3 font-bold text-zinc-400 hover:text-navy transition-colors">
                Cancel
              </button>
              <button onClick={handleConfirm} className="flex-[2] bg-primary text-white font-bold py-3 rounded-xl hover:bg-primary-hover transition-colors">
                Yes, they&apos;re well
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Obituary Tile ────────────────────────────────────────────────────────────
function ObituaryTile({ rel }: { rel: ParentRelationship }) {
  const name = rel.parentFirstName;
  const obit = rel.obituary;
  const photoCount = obit.photos.length;

  return (
    <Link
      href={`/dashboard/obituary/${rel.parentId}`}
      className="block bg-white rounded-2xl border border-zinc-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all group"
    >
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <FileText className="w-4 h-4 text-gold" />
          <h3 className="font-bold text-navy text-sm">Obituary & Memorial</h3>
        </div>
        <div className="space-y-1">
          {obit.parentWrittenContent ? (
            <p className="text-xs text-zinc-600">{name} has prepared an obituary.</p>
          ) : (
            <p className="text-xs text-zinc-400">{name} hasn&apos;t added anything yet. You can view AI-generated options.</p>
          )}
          <p className="text-xs text-zinc-400">
            Photos: {photoCount > 0 ? `${photoCount} of 2 selected` : 'No photos yet'}
          </p>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-primary group-hover:underline">View & manage</span>
          <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-navy transition-colors" />
        </div>
      </div>
    </Link>
  );
}

// ─── Payments Tile (incoming approvals + my own takeover status) ─────────────────
function cardLabel(brand: string | null, last4: string | null) {
  if (!last4) return 'a card';
  const b = brand ? brand[0].toUpperCase() + brand.slice(1) : 'Card';
  return `${b} ending ${last4}`;
}

function PaymentsTile({
  rel,
  outgoing,
  incoming,
  busyId,
  onRequest,
  onCancel,
  onApprove,
  onDecline,
  onCancelTakeover,
}: {
  rel: ParentRelationship;
  outgoing?: OutgoingTransfer;
  incoming: IncomingTransfer[];
  busyId: string | null;
  onRequest: (guideId: string) => void;
  onCancel: (id: string) => void;
  onApprove: (id: string) => void;
  onDecline: (id: string) => void;
  onCancelTakeover: () => void;
}) {
  const name = rel.parentFirstName;
  const canRequest = !!rel.guideId && !rel.isCurrentPayer;
  const [showCancelTakeover, setShowCancelTakeover] = useState(false);
  const cancellingTakeover = busyId === 'cancel-takeover';

  return (
    <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6 space-y-5">
      <div className="flex items-center gap-2.5">
        <CreditCard className="w-4 h-4 text-primary" />
        <h3 className="font-bold text-navy text-sm">Payments</h3>
      </div>

      {/* Incoming: someone asked to take over — owner/TI can approve or decline */}
      {incoming.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Requests to approve</p>
          {incoming.map((t) => (
            <div key={t.id} className="bg-zinc-50 rounded-xl p-4 space-y-3">
              <p className="text-xs text-navy leading-relaxed">
                <span className="font-bold">{t.requesterName}</span> has requested to take over ongoing payments
                {t.cardLast4 ? <> with {cardLabel(t.cardBrand, t.cardLast4)}</> : null}. Requested {relativeTime(t.createdAt)}.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => onApprove(t.id)}
                  disabled={busyId === t.id}
                  className="bg-primary text-white font-bold text-xs px-4 py-2 rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-60 inline-flex items-center gap-1.5"
                >
                  {busyId === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve
                </button>
                <button
                  onClick={() => onDecline(t.id)}
                  disabled={busyId === t.id}
                  className="bg-white text-navy font-bold text-xs px-4 py-2 rounded-lg border border-zinc-200 hover:bg-zinc-50 transition-colors disabled:opacity-60"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* My own status as a (potential) payer */}
      <div className="space-y-3">
        {rel.isCurrentPayer ? (
          <p className="text-xs text-zinc-500 leading-relaxed flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-emerald-500" /> You currently cover {name}&apos;s guide.
          </p>
        ) : outgoing?.status === 'pending' ? (
          <>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Your request to take over payments ({cardLabel(outgoing.cardBrand, outgoing.cardLast4)}) is awaiting approval from {name} or their trusted individual. You won&apos;t be charged unless it&apos;s approved.
            </p>
            <button
              onClick={() => onCancel(outgoing.id)}
              disabled={busyId === outgoing.id}
              className="text-xs font-bold text-zinc-400 hover:text-navy transition-colors disabled:opacity-60"
            >
              Cancel request
            </button>
          </>
        ) : outgoing?.status === 'approved' ? (
          <>
            <p className="text-xs text-navy leading-relaxed flex items-start gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
              <span>
                Approved — {cardLabel(outgoing.cardBrand, outgoing.cardLast4)} will be used for {name}&apos;s guide
                {outgoing.effectiveAt && new Date(outgoing.effectiveAt) > new Date()
                  ? <> from {new Date(outgoing.effectiveAt).toLocaleDateString()}.</>
                  : <> from the next payment.</>}
              </span>
            </p>
            <button
              onClick={() => setShowCancelTakeover(true)}
              disabled={cancellingTakeover}
              className="text-xs font-bold text-red-600 hover:text-red-700 underline underline-offset-4 disabled:opacity-50"
            >
              Cancel payment
            </button>
          </>
        ) : outgoing?.status === 'completed' ? (
          <>
            <p className="text-xs text-zinc-500 leading-relaxed flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-500" /> You now cover {name}&apos;s guide.
            </p>
            <button
              onClick={() => setShowCancelTakeover(true)}
              disabled={cancellingTakeover}
              className="text-xs font-bold text-red-600 hover:text-red-700 underline underline-offset-4 disabled:opacity-50"
            >
              Cancel payment
            </button>
          </>
        ) : canRequest ? (
          <>
            {outgoing?.status === 'declined' && (
              <p className="text-xs text-zinc-400 leading-relaxed">Your last request wasn&apos;t approved. You can ask again.</p>
            )}
            <p className="text-xs text-zinc-400 leading-relaxed">
              Want to cover the ongoing cost of {name}&apos;s guide? You&apos;ll add a card now, then {name} or their trusted individual approves — your card is only charged once it&apos;s approved, at the next payment.
            </p>
            <button
              onClick={() => onRequest(rel.guideId as string)}
              disabled={busyId === `request:${rel.guideId}`}
              className="bg-white text-navy font-bold text-xs px-4 py-2 rounded-lg border border-zinc-200 hover:bg-zinc-50 transition-colors disabled:opacity-60 inline-flex items-center gap-1.5"
            >
              {busyId === `request:${rel.guideId}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />} Take over payments
            </button>
          </>
        ) : (
          <p className="text-xs text-zinc-400 leading-relaxed">Payments for {name}&apos;s guide are managed by the current payer.</p>
        )}
      </div>

      {/* Cancel-payment confirm modal — child stops their takeover. Per spec the
          parent's guide will lock at the end of the current term unless someone
          (parent or another takeover) provides a new payment. */}
      {showCancelTakeover && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-navy/20 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="px-8 py-6 bg-zinc-50 border-b border-zinc-100 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
              <h3 className="font-bold text-navy">Cancel your payment?</h3>
            </div>
            <div className="p-8 space-y-5">
              <p className="text-sm text-zinc-600 leading-relaxed">
                The card you provided will be removed and {name}&apos;s guide will be{' '}
                <strong>locked at the end of the current term</strong> unless a new payment method is added.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => { if (!cancellingTakeover) setShowCancelTakeover(false); }}
                  disabled={cancellingTakeover}
                  className="flex-1 py-3 font-bold text-zinc-500 hover:text-navy transition-colors disabled:opacity-50"
                >
                  Keep payment
                </button>
                <button
                  onClick={async () => {
                    onCancelTakeover();
                    setShowCancelTakeover(false);
                  }}
                  disabled={cancellingTakeover}
                  className="flex-[2] bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {cancellingTakeover ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Yes, cancel payment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Share-acknowledgment Tile (still mock until the release flow is built) ──────
function ShareAckTile({ rel, onShareAction }: { rel: ParentRelationship; onShareAction: (action: string, reason?: string) => void }) {
  const [showConcernModal, setShowConcernModal] = useState(false);
  const [concernText, setConcernText] = useState('');

  return (
    <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6 space-y-5">
      <div className="flex items-center gap-2.5">
        <AlertCircle className="w-4 h-4 text-amber-500" />
        <h3 className="font-bold text-navy text-sm">Share Acknowledgment</h3>
      </div>
      <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 space-y-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900 leading-relaxed">
            Another Trusted Representative has begun the sharing process. You have 24 hours to acknowledge or raise a concern. The 7-day grace period has begun and will not be paused.
          </p>
        </div>
        <div className="flex gap-2 ml-6">
          <button
            onClick={() => { console.log(`SHARE_ACKNOWLEDGED for ${rel.parentId}`); onShareAction('acknowledge'); }}
            className="bg-navy text-white font-bold text-xs px-4 py-2 rounded-lg hover:bg-navy/90 transition-colors"
          >
            Acknowledge
          </button>
          <button
            onClick={() => setShowConcernModal(true)}
            className="bg-white text-navy font-bold text-xs px-4 py-2 rounded-lg border border-zinc-200 hover:bg-zinc-50 transition-colors"
          >
            Raise a concern
          </button>
        </div>
      </div>

      {showConcernModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-navy/20 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="px-8 py-6 bg-zinc-50 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="font-bold text-navy">Raise a concern</h3>
              <button onClick={() => setShowConcernModal(false)} className="text-zinc-300 hover:text-navy transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-8 space-y-5">
              <p className="text-sm text-zinc-500 leading-relaxed">Your concern will be logged as part of the record. The sharing process will continue, but your objection will be documented.</p>
              <textarea value={concernText} onChange={e => setConcernText(e.target.value)} placeholder="Describe your concern (optional)" rows={4} className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-5 py-4 text-navy outline-none focus:border-primary text-sm leading-relaxed resize-none transition-all" />
              <div className="flex gap-3">
                <button onClick={() => setShowConcernModal(false)} className="flex-1 py-3 font-bold text-zinc-400 hover:text-navy transition-colors">Cancel</button>
                <button
                  onClick={() => { onShareAction('concern', concernText); setShowConcernModal(false); setConcernText(''); }}
                  className="flex-[2] bg-navy text-white font-bold py-3 rounded-xl hover:bg-navy/90 transition-colors"
                >
                  Submit concern
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Parent Guide Tile ────────────────────────────────────────────────────────
function ParentGuideTile({ rel }: { rel: ParentRelationship }) {
  const name = rel.parentFirstName;
  const lastSaved = relativeTime(rel.parentGuide.lastSavedAt);

  return (
    <Link
      href={`/dashboard/parent-guide/${rel.parentId}`}
      className="block bg-white rounded-2xl border border-zinc-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all group"
    >
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <Heart className="w-4 h-4 text-gold" />
          <h3 className="font-bold text-navy text-sm">{name}&apos;s Guide</h3>
        </div>
        <p className="text-xs text-zinc-400">{name} last saved {lastSaved}</p>
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-primary group-hover:underline">Ask & view</span>
          <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-navy transition-colors" />
        </div>
      </div>
    </Link>
  );
}

// ─── Parent Group ─────────────────────────────────────────────────────────────
function ParentGroup({
  rel,
  outgoing,
  incoming,
  busyId,
  onCheckIn,
  onRequest,
  onCancel,
  onApprove,
  onDecline,
  onCancelTakeover,
  onShareAction,
}: {
  rel: ParentRelationship;
  outgoing?: OutgoingTransfer;
  incoming: IncomingTransfer[];
  busyId: string | null;
  onCheckIn: () => void;
  onRequest: (guideId: string) => void;
  onCancel: (id: string) => void;
  onApprove: (id: string) => void;
  onDecline: (id: string) => void;
  onCancelTakeover: () => void;
  onShareAction: (action: string, reason?: string) => void;
}) {
  return (
    <section className="space-y-4">
      <h2 className="font-playfair text-2xl font-black text-navy px-1">{rel.parentFirstName}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatusTile rel={rel} onCheckIn={onCheckIn} />
        <ObituaryTile rel={rel} />
        <PaymentsTile
          rel={rel}
          outgoing={outgoing}
          incoming={incoming}
          busyId={busyId}
          onRequest={onRequest}
          onCancel={onCancel}
          onApprove={onApprove}
          onDecline={onDecline}
          onCancelTakeover={onCancelTakeover}
        />
        {rel.pendingShareAcknowledgmentFromOtherTR && (
          <ShareAckTile rel={rel} onShareAction={onShareAction} />
        )}
        <ParentGuideTile rel={rel} />
      </div>
    </section>
  );
}

// ─── Takeover plan-picker modal ────────────────────────────────────────────────
// Opens when the child clicks "Take over payments". Mirrors the Plan Options grid
// on /dashboard/payments: shows the parent's current plan + next billing date,
// pre-selects the current plan, lets the child switch to a different plan. The
// "Continue to payment" button hands off to the existing Stripe card-capture step
// (startTakeoverRequest) with the chosen plan attached.
function TakeoverPlanModal({
  guideId,
  parentFirstNameFallback,
  onClose,
}: {
  guideId: string;
  parentFirstNameFallback: string;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<TakeoverPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  // Spouse-coverage toggle. Initialized from preview.coverage once it loads:
  //   - existing sub already covers spouse ('both') → toggle starts ON and locks
  //     (you can't un-cover someone the parent already chose to cover).
  //   - existing 'single' / no sub → toggle starts OFF; child can turn it on.
  const [spouseEnabled, setSpouseEnabled] = useState(false);
  // Discount code state mirrors the onboarding pricing pages: input → Apply →
  // validates via /billing/validate-code; "applied" rendered with a remove ✕.
  const [discountInput, setDiscountInput] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<{
    code: string; discount_type: 'fixed' | 'percentage'; discount_value: number;
  } | null>(null);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [validatingDiscount, setValidatingDiscount] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    getTakeoverPreview(guideId)
      .then((p) => {
        if (cancelled) return;
        setPreview(p);
        // Preselect the parent's current plan when there is one. If the parent has
        // no active sub the picker stays unselected and the child has to choose.
        setSelectedPlan(p.currentPlanType || null);
        // Spouse already covered by current sub → toggle ON + locked.
        setSpouseEnabled(p.coverage === 'both');
      })
      .catch((e: any) => {
        if (!cancelled) setLoadError(e?.message || 'Couldn’t load plan details right now.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [guideId]);

  const parentFirst = preview?.parentFirstName || parentFirstNameFallback;
  const spouseAlreadyCovered = preview?.coverage === 'both';
  // We hide the toggle entirely when no spouse exists on the parent's family roster
  // AND the current sub isn't already covering one — there's nobody to toggle.
  const showSpouseRow = !!preview?.spouseName || spouseAlreadyCovered;
  const spouseName = preview?.spouseName || 'spouse';

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Price math mirrors the onboarding pricing page (apps/web/src/app/onboarding/
  // parent/pricing/page.tsx). Fixed → subtract; percentage → multiply.
  const applyDiscount = (price: number): number => {
    if (!appliedDiscount) return price;
    if (appliedDiscount.discount_type === 'fixed') return Math.max(0, price - appliedDiscount.discount_value);
    return Math.max(0, Math.round(price * (1 - appliedDiscount.discount_value / 100) * 100) / 100);
  };
  const discountLabel = appliedDiscount
    ? (appliedDiscount.discount_type === 'fixed'
        ? `$${appliedDiscount.discount_value} off`
        : `${appliedDiscount.discount_value}% off`)
    : '';

  const handleApplyCode = async () => {
    const code = discountInput.trim();
    if (!code || validatingDiscount) return;
    setValidatingDiscount(true);
    setDiscountError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/billing/validate-code`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (data.valid) {
        setAppliedDiscount({ code: data.code, discount_type: data.discount_type, discount_value: data.discount_value });
        setDiscountError(null);
      } else {
        setDiscountError('Code invalid');
        setAppliedDiscount(null);
      }
    } catch {
      setDiscountError('Code invalid');
      setAppliedDiscount(null);
    } finally {
      setValidatingDiscount(false);
    }
  };
  const handleRemoveCode = () => {
    setAppliedDiscount(null);
    setDiscountInput('');
    setDiscountError(null);
  };

  const handleContinue = async () => {
    if (!selectedPlan || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Only send override values when they differ from the parent's current sub
      // state — keeps the takeover row's columns NULL in the common case ("just
      // take over the payments, no changes").
      const planArg = selectedPlan !== preview?.currentPlanType ? selectedPlan : null;
      const chosenCoverage: 'single' | 'both' = spouseEnabled ? 'both' : 'single';
      const coverageArg = chosenCoverage !== preview?.coverage ? chosenCoverage : null;
      const discountArg = appliedDiscount?.code || null;
      const { url } = await startTakeoverRequest(guideId, {
        planType: planArg,
        coverage: coverageArg,
        discountCode: discountArg,
      });
      window.location.href = url;
    } catch (e: any) {
      setSubmitError(e?.message || 'Couldn’t start the request right now. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-navy/20 backdrop-blur-sm">
      <div className="bg-white w-full max-w-3xl rounded-[32px] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-8 py-6 bg-zinc-50 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-navy">
              Take over payments{parentFirst ? ` for ${parentFirst}` : ''}
            </h3>
          </div>
          <button
            onClick={() => { if (!submitting) onClose(); }}
            disabled={submitting}
            className="text-zinc-300 hover:text-navy transition-colors disabled:opacity-40"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-8 py-7 space-y-7">
          {loading ? (
            <div className="flex items-center gap-2 text-zinc-400 text-sm py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading plan details…
            </div>
          ) : loadError ? (
            <p className="py-8 text-sm text-zinc-500 text-center">{loadError}</p>
          ) : !preview ? null : (
            <>
              {/* Next-bill banner — the date the takeover takes effect + the child's
                  card starts being charged. Phrased exactly like the spec asks:
                  "show the next billing cycle". */}
              {preview.nextBillingAt ? (
                <div className="bg-zinc-50 border border-zinc-100 rounded-2xl px-5 py-4 flex items-start gap-3">
                  <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div className="text-sm text-navy leading-relaxed">
                    <p>
                      {parentFirst ? `${parentFirst}'s` : 'This'} subscription renews on{' '}
                      <strong>{formatDate(preview.nextBillingAt)}</strong>. Your card will be charged
                      on that date and at each renewal after.
                    </p>
                    {!preview.currentPlanType && (
                      <p className="text-zinc-500 mt-1 text-xs">
                        We couldn’t find an active plan on file — pick one below to set the terms.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-100 rounded-2xl px-5 py-4 flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-900 leading-relaxed">
                    No active subscription on file for this guide yet. Pick a plan below — your card
                    will be charged today to activate it.
                  </p>
                </div>
              )}

              {/* Spouse coverage toggle. Pre-set ON + locked when the parent's existing
                  sub already covers both — you can't un-cover someone the parent chose.
                  Hidden entirely when there's no spouse on the family roster AND none
                  in current coverage (no one to toggle). */}
              {showSpouseRow && (
                <div className={`rounded-2xl border p-5 flex items-center justify-between gap-4 transition-colors ${
                  spouseAlreadyCovered ? 'bg-zinc-50 border-zinc-100' : 'bg-white border-zinc-100 shadow-sm'
                }`}>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-gold/10 text-gold rounded-xl flex items-center justify-center shrink-0">
                      <Users className="w-5 h-5" />
                    </div>
                    <div className="space-y-0.5">
                      <h5 className="font-bold text-navy text-sm flex items-center gap-1.5">
                        Add coverage for {spouseName}
                        {spouseAlreadyCovered && <Lock className="w-3 h-3 text-zinc-400" aria-label="already covered" />}
                      </h5>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">
                        {spouseAlreadyCovered
                          ? `${parentFirst}'s current subscription already covers ${spouseName}. This stays included with the takeover.`
                          : `Adds the spouse add-on to the selected plan so ${spouseName}'s guide is covered too.`}
                      </p>
                    </div>
                  </div>
                  {/* Plain checkbox styled as a switch. Disabled when the parent's sub
                      already includes spouse coverage. */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={spouseEnabled}
                    aria-disabled={spouseAlreadyCovered}
                    onClick={() => { if (!spouseAlreadyCovered) setSpouseEnabled((v) => !v); }}
                    disabled={spouseAlreadyCovered}
                    className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${
                      spouseEnabled ? 'bg-primary' : 'bg-zinc-200'
                    } ${spouseAlreadyCovered ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <span
                      className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${
                        spouseEnabled ? 'left-[22px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>
              )}

              {/* Plan options — identical visual model to /dashboard/payments so the
                  child sees the same picker the parent would. Prices reflect the
                  spouse toggle and any applied discount, recomputed each render. */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-4">Plan Options</h4>
                {preview.plans.length === 0 ? (
                  <p className="text-sm text-zinc-400">No plans available right now.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {preview.plans.map((plan) => {
                      const isCurrent = preview.currentPlanType === plan.id;
                      const isSelected = selectedPlan === plan.id;
                      const subtotal = spouseEnabled ? plan.price + plan.spouseAddon : plan.price;
                      const total = applyDiscount(subtotal);
                      const discounted = appliedDiscount && total < subtotal;
                      return (
                        <button
                          key={plan.id}
                          type="button"
                          onClick={() => setSelectedPlan(plan.id)}
                          aria-pressed={isSelected}
                          className={`relative text-left bg-white rounded-2xl p-5 transition-all ${
                            isSelected
                              ? 'border-[1.5px] border-primary shadow-lg ring-2 ring-primary/10'
                              : 'border border-zinc-100 shadow-sm hover:shadow-md hover:-translate-y-0.5'
                          }`}
                        >
                          {isCurrent && (
                            <div className="absolute -top-2.5 left-4 bg-primary text-white text-[9px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full">
                              Current plan
                            </div>
                          )}
                          <div className="space-y-3">
                            <h5 className="font-bold text-navy text-sm">{plan.name}</h5>
                            <div className="flex items-baseline gap-1.5">
                              {discounted && (
                                <span className="text-xs text-zinc-300 line-through tabular-nums">${subtotal}</span>
                              )}
                              <span className="text-2xl font-black text-navy tabular-nums">${total}</span>
                              <span className="text-[10px] text-zinc-400">{plan.period}</span>
                            </div>
                            {spouseEnabled && (
                              <div className="pt-2 border-t border-zinc-50 space-y-0.5">
                                <div className="flex justify-between text-[10px] text-zinc-400">
                                  <span>Guide</span>
                                  <span>${plan.price}</span>
                                </div>
                                <div className="flex justify-between text-[10px] text-primary font-bold">
                                  <span>{spouseName} add-on</span>
                                  <span>+${plan.spouseAddon}</span>
                                </div>
                              </div>
                            )}
                            {plan.features.length > 0 && (
                              <ul className="space-y-1 pt-1">
                                {plan.features.map((f) => (
                                  <li key={f} className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                                    <Check className="w-3 h-3 text-primary shrink-0" /> {f}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                {preview.currentPlanType && selectedPlan && selectedPlan !== preview.currentPlanType && (
                  <p className="mt-3 text-xs text-zinc-500 italic leading-relaxed">
                    You’re changing the plan{preview.nextBillingAt ? ` — the switch takes effect on ${formatDate(preview.nextBillingAt)}.` : '.'}
                  </p>
                )}
              </div>

              {/* Discount code — matches /onboarding/parent/pricing styling. The
                  applied state shows the code + label and a remove button. */}
              <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-gold" />
                  <h5 className="font-bold text-navy text-sm">Discount code</h5>
                </div>
                {appliedDiscount ? (
                  <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
                    <div className="text-sm text-navy">
                      <span className="font-bold">{appliedDiscount.code}</span>{' '}
                      <span className="text-primary font-bold">— {discountLabel}</span>{' '}
                      <span className="text-zinc-400">applied</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveCode}
                      className="text-zinc-400 hover:text-navy transition-colors"
                      aria-label="Remove discount code"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={discountInput}
                        onChange={(e) => { setDiscountInput(e.target.value); if (discountError) setDiscountError(null); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleApplyCode(); } }}
                        placeholder="Enter code"
                        autoCapitalize="characters"
                        className="flex-1 bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2.5 text-sm text-navy outline-none focus:border-primary transition-colors"
                      />
                      <button
                        type="button"
                        onClick={handleApplyCode}
                        disabled={!discountInput.trim() || validatingDiscount}
                        className="bg-navy text-white font-bold text-xs px-5 py-2.5 rounded-xl hover:bg-navy/90 transition-colors disabled:opacity-60 inline-flex items-center gap-1.5"
                      >
                        {validatingDiscount ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Apply'}
                      </button>
                    </div>
                    {discountError && <p className="text-xs text-red-600">{discountError}</p>}
                  </div>
                )}
              </div>

              <p className="text-[11px] text-zinc-400 italic">
                You’ll be taken to Stripe’s secure checkout to enter your card. Nothing will be charged today —
                your card is held and only charged at {parentFirst ? `${parentFirst}'s` : 'the'} next renewal,
                and only after {parentFirst || 'the guide owner'} or their trusted individual approves.
              </p>
              {submitError && <p className="text-sm text-red-600">{submitError}</p>}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-zinc-100 flex justify-end gap-3 bg-white">
          <button
            onClick={() => { if (!submitting) onClose(); }}
            disabled={submitting}
            className="text-sm text-zinc-400 hover:text-navy font-medium px-4 py-2 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleContinue}
            disabled={submitting || loading || !selectedPlan}
            className="bg-primary text-white font-bold text-sm px-6 py-3 rounded-xl hover:bg-primary-hover transition-all flex items-center gap-2 disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>Continue to payment <ChevronRight className="w-4 h-4" /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function ChildDashboard() {
  const { user } = useAuth();
  const firstName = user?.name?.trim().split(/\s+/)[0] || 'there';
  const [relationships, setRelationships] = useState<ParentRelationship[]>([]);
  const [outgoing, setOutgoing] = useState<OutgoingTransfer[]>([]);
  const [incoming, setIncoming] = useState<IncomingTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'info'; text: string } | null>(null);
  // Which guide's takeover plan-picker is open. Set by handleRequest; the modal
  // calls startTakeoverRequest with the chosen plan and redirects to Stripe itself.
  const [takeoverOpen, setTakeoverOpen] = useState<{ guideId: string; parentFirstName: string } | null>(null);

  // ── TI intro video ────────────────────────────────────────────────────────
  // First-play overlay for users acting as a Trusted Representative. Two
  // conditions must hold to auto-show:
  //   (1) the user has at least one relationship with the 'trusted_rep' role,
  //   (2) the dismissal flag isn't already set on the server.
  // Both signals arrive asynchronously, so we track them independently and
  // derive `showIntro` once both are known. The replay button below uses the
  // same setter; it bypasses the flag check entirely, so dismissed users can
  // still re-watch on demand.
  const [showIntro, setShowIntro] = useState(false);
  const [introFlagChecked, setIntroFlagChecked] = useState(false);
  const [introDismissedOnServer, setIntroDismissedOnServer] = useState(false);

  // Whether the logged-in user is a TR for ANY parent guide. Drives the replay
  // button visibility — non-TI family members never see it.
  const isAnyTI = relationships.some((r) => r.roles.includes('trusted_rep'));

  // Check the dismissal flag once on mount (after userId is available). A
  // failed read leaves the flag treated as "dismissed" — better to skip the
  // video than to replay it after a previous dismissal we couldn't read.
  useEffect(() => {
    if (!user?.userId) return;
    let cancelled = false;
    (async () => {
      try {
        const flags = await fetchWithAuth('/interview/flags', user.userId);
        const dismissed = Array.isArray(flags) && flags.some(
          (f: any) => f.flag === TRUSTED_REP_INTRO_FLAG
        );
        if (!cancelled) {
          setIntroDismissedOnServer(dismissed);
          setIntroFlagChecked(true);
        }
      } catch (err) {
        console.error('Failed to check TR intro flag:', err);
        if (!cancelled) {
          setIntroDismissedOnServer(true); // treat as dismissed on error
          setIntroFlagChecked(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [user?.userId]);

  // Auto-surface the overlay the first time we know both (a) the user is a TI
  // and (b) the flag isn't dismissed. Gated on introFlagChecked so we don't
  // briefly flash the overlay before the flag read returns.
  useEffect(() => {
    if (!introFlagChecked || introDismissedOnServer) return;
    if (isAnyTI) setShowIntro(true);
  }, [introFlagChecked, introDismissedOnServer, isAnyTI]);

  // Persist the dismissal so the video doesn't auto-fire on the next visit.
  // Optimistically close first; the flag write is best-effort. We also flip
  // `introDismissedOnServer` so the auto-surface effect can't immediately
  // re-open the overlay before the server round-trip lands.
  const handleDismissIntro = async () => {
    setShowIntro(false);
    setIntroDismissedOnServer(true);
    if (!user?.userId) return;
    try {
      await fetchWithAuth('/interview/flags', user.userId, {
        method: 'POST',
        body: JSON.stringify({ flag: TRUSTED_REP_INTRO_FLAG }),
      });
    } catch (err) {
      console.error('Failed to save TR intro flag:', err);
    }
  };

  const refreshTransfers = useCallback(async () => {
    const [out, inc] = await Promise.all([
      getOutgoingTransfers().catch(() => [] as OutgoingTransfer[]),
      getIncomingTransfers().catch(() => [] as IncomingTransfer[]),
    ]);
    setOutgoing(out);
    setIncoming(inc);
  }, []);

  useEffect(() => {
    Promise.all([
      getParentGuides<ParentRelationship>().catch(() => [] as ParentRelationship[]),
      getOutgoingTransfers().catch(() => [] as OutgoingTransfer[]),
      getIncomingTransfers().catch(() => [] as IncomingTransfer[]),
    ])
      .then(([rels, out, inc]) => {
        setRelationships(rels);
        setOutgoing(out);
        setIncoming(inc);
      })
      .finally(() => setLoading(false));
  }, []);

  // Returning from Stripe card capture: finalize the request (creates it as pending),
  // then clean the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tk = params.get('takeover');
    const sessionId = params.get('session_id');
    if (tk === 'ok' && sessionId) {
      finalizeTakeoverRequest(sessionId)
        .then(() => { setBanner({ kind: 'ok', text: 'Request sent — your card is held and won’t be charged unless it’s approved.' }); return refreshTransfers(); })
        .catch((e) => setError(e?.message || 'Couldn’t finish your request.'));
    } else if (tk === 'cancel') {
      setBanner({ kind: 'info', text: 'No problem — nothing was saved and no card was added.' });
    }
    if (tk) window.history.replaceState({}, '', '/dashboard/child/overview');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (busyKey: string, fn: () => Promise<void>) => {
    setBusyId(busyKey);
    setError(null);
    try {
      await fn();
    } catch (e: any) {
      setError(e?.message || 'Something went wrong. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  // Open the plan-picker modal. The modal itself calls startTakeoverRequest with the
  // chosen plan and redirects to Stripe — keeps this handler synchronous so the
  // PaymentsTile button doesn't sit in a loading state while the modal is up.
  const handleRequest = (guideId: string) => {
    const rel = relationships.find((r) => r.guideId === guideId);
    setTakeoverOpen({ guideId, parentFirstName: rel?.parentFirstName || '' });
  };
  const handleCancel = (id: string) =>
    run(id, async () => { await cancelTransfer(id); await refreshTransfers(); });
  const handleApprove = (id: string) =>
    run(id, async () => { await approveTransfer(id); await refreshTransfers(); });
  const handleDecline = (id: string) =>
    run(id, async () => { await declineTransfer(id); await refreshTransfers(); });
  // Cancel my active takeover (status 'approved' or 'completed'): server detaches the
  // card, schedules the parent's sub to lapse, and notifies the parent + TI(s).
  const handleCancelTakeover = () =>
    run('cancel-takeover', async () => { await cancelTakeoverPayment(); await refreshTransfers(); });

  // Trusted-Individual "I just spoke with them; they're doing well." Hits the
  // server (which re-verifies TI status, then advances the parent's check-in
  // clock) and optimistically updates the displayed `nextCheckInDueAt` /
  // `lastCheckInAt` so the UI reflects the change without a full refetch.
  // If the call fails (network, auth, etc.) the optimistic update is reverted.
  const handleCheckIn = async (parentId: string) => {
    const prevSnapshot = relationships;
    const now = new Date().toISOString();
    setRelationships(prev =>
      prev.map(r => r.parentId !== parentId
        ? r
        : { ...r, status: { ...r.status, lastCheckInAt: now } })
    );
    try {
      const { checkInOnBehalfOf } = await import('@/lib/api');
      const result = await checkInOnBehalfOf(parentId);
      setRelationships(prev =>
        prev.map(r => r.parentId !== parentId
          ? r
          : {
              ...r,
              status: {
                ...r.status,
                lastCheckInAt: result.checkedInAt,
                nextCheckInDueAt: result.nextDueAt,
                isOverdue: false,
                daysUntilNextCheckIn: Math.ceil(
                  (new Date(result.nextDueAt).getTime() - Date.now()) / 86_400_000
                ),
              },
            })
      );
    } catch (err: any) {
      setRelationships(prevSnapshot); // roll back optimistic update
      console.error('[checkIn] failed:', err?.message);
      // Surface the actual reason rather than silently swallowing.
      window.alert(err?.message || 'Couldn’t record check-in. Please try again.');
    }
  };
  const handleShareAction = (parentId: string, action: string) => {
    if (action === 'acknowledge' || action === 'concern') {
      setRelationships(prev => prev.map(r => r.parentId !== parentId ? r : { ...r, pendingShareAcknowledgmentFromOtherTR: false }));
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 space-y-12 font-inter text-navy">
      {/* First-visit intro video for TRs — overlays the page until dismissed.
          The dismissal is persisted via /interview/flags so it never auto-fires
          again for the same user. Replay is via the button below. */}
      {showIntro && (
        <IntroVideoOverlay
          videoUrl={TRUSTED_REP_INTRO_VIDEO}
          onDismiss={handleDismissIntro}
        />
      )}
      {/* Header — flex row so the "Watch intro" replay button (only shown for
          users who are actually a TR for at least one parent) sits at the
          top-right. Non-TI family members never see the button. */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-playfair text-3xl md:text-4xl font-black">
            Welcome back, {firstName}.
          </h1>
          <p className="text-zinc-500">Here&apos;s what needs your attention.</p>
        </div>
        {isAnyTI && (
          <button
            type="button"
            onClick={() => setShowIntro(true)}
            className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-navy border border-zinc-200 hover:border-zinc-300 bg-white px-3 py-1.5 rounded-full transition-colors"
          >
            <Play className="w-3 h-3 fill-current" />
            Watch intro
          </button>
        )}
      </div>

      {banner && (
        <div className={`text-sm rounded-xl px-4 py-3 border ${
          banner.kind === 'ok'
            ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
            : 'bg-amber-50 border-amber-100 text-amber-700'
        }`}>
          {banner.text}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-400 text-sm py-10">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : relationships.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-10 text-center space-y-2">
          <p className="text-zinc-500 font-medium">You&apos;re not part of anyone&apos;s guide yet.</p>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            When a parent or loved one adds you to their guide as immediate family or a trusted individual, it&apos;ll appear here.
          </p>
        </div>
      ) : (
        relationships.map(rel => (
          <ParentGroup
            key={rel.parentId}
            rel={rel}
            outgoing={rel.guideId ? outgoing.find(o => o.guideId === rel.guideId && o.status !== 'cancelled') : undefined}
            incoming={rel.guideId ? incoming.filter(i => i.guideId === rel.guideId) : []}
            busyId={busyId}
            onCheckIn={() => handleCheckIn(rel.parentId)}
            onRequest={handleRequest}
            onCancel={handleCancel}
            onApprove={handleApprove}
            onDecline={handleDecline}
            onCancelTakeover={handleCancelTakeover}
            onShareAction={(action, reason) => handleShareAction(rel.parentId, action)}
          />
        ))
      )}

      {/* Takeover plan-picker modal — mounted once at the page level so it overlays
          whichever ParentGroup the user clicked into. */}
      {takeoverOpen && (
        <TakeoverPlanModal
          guideId={takeoverOpen.guideId}
          parentFirstNameFallback={takeoverOpen.parentFirstName}
          onClose={() => setTakeoverOpen(null)}
        />
      )}
    </div>
  );
}
