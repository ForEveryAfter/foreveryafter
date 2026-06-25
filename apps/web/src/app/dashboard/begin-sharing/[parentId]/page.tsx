'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Heart, Loader2, Mail, MessageCircle, FileText, Lock, AlertTriangle, Users } from 'lucide-react';
import { getParentGuides, getReleaseStatus, triggerRelease, type ReleaseStatus, type TriggerReleaseResult } from '@/lib/api';
import type { ParentRelationship } from '@/data/child-dashboard-mock';

// Three-step manual-release flow (spec Part 4):
//   STEP 1: warn about releasing to designated recipients (rep doesn't see WHO).
//   STEP 2: (conditional — only if 2+ TRs) inform that the other TR will be notified.
//   STEP 3: hold-aware final-confirm copy (depends on RELEASE_HOLD_HOURS from server).
// On submit: either jumps to 'done' (hold=0) or 'pending' (hold>0; owner can cancel).
type View =
  | 'loading'
  | 'step1'
  | 'step2'
  | 'step3'
  | 'done'
  | 'pending'
  | 'denied'
  | 'error'
  | 'expired';

export default function BeginSharingPage() {
  const { parentId } = useParams<{ parentId: string }>();
  const [rel, setRel] = useState<ParentRelationship | null>(null);
  const [status, setStatus] = useState<ReleaseStatus | null>(null);
  const [result, setResult] = useState<TriggerReleaseResult | null>(null);
  const [view, setView] = useState<View>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getParentGuides<ParentRelationship>()
      .then(async (rels) => {
        const match = rels.find((r) => r.parentId === parentId) || null;
        setRel(match);
        if (!match || !match.roles.includes('trusted_rep') || !match.guideId) {
          setView('denied');
          return;
        }
        try {
          const st = await getReleaseStatus(match.guideId);
          setStatus(st);
          if (st.released) { setView('done'); return; }
          if (st.releaseStatus === 'release_pending' && st.releaseExecutesAt) {
            setView('pending');
            return;
          }
        } catch {
          /* fall through to expired/step1 based on guideSubscriptionActive */
        }
        setView(match.guideSubscriptionActive ? 'step1' : 'expired');
      })
      .catch(() => setView('error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentId]);

  const hasSecondTR = !!rel?.status?.secondTrustedRepExists;
  const holdHours = status?.holdHours ?? 0;

  const proceedFromStep1 = () => setView(hasSecondTR ? 'step2' : 'step3');

  const confirmRelease = async () => {
    if (busy || !rel?.guideId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await triggerRelease(rel.guideId);
      setResult(r);
      setView(r.status === 'executed' ? 'done' : 'pending');
    } catch (e: any) {
      setError(e?.message || 'Something went wrong. Please try again.');
      setBusy(false);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (view === 'loading') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  // ── Not a trusted individual / load error ────────────────────────────────
  if (view === 'denied' || view === 'error') {
    return (
      <ShellBack>
        <p className="text-zinc-500">
          {view === 'error' ? 'We couldn’t load this right now.' : 'This isn’t available for you.'}
        </p>
      </ShellBack>
    );
  }

  // ── Expired: guide subscription lapsed ───────────────────────────────────
  if (view === 'expired') {
    const who = rel?.parentFirstName || 'This guide';
    return (
      <Centered icon={<Lock className="w-7 h-7 text-amber-600" />} iconBg="bg-amber-50">
        <h1 className="font-playfair text-2xl md:text-3xl font-black">This guide can&apos;t be released yet</h1>
        <p className="text-zinc-500 leading-relaxed">
          {who}&apos;s subscription has expired, so the guide is currently inactive. It needs an active subscription
          before it can be released. You can reactivate it from My Parent&apos;s Guide.
        </p>
        <BackButton />
      </Centered>
    );
  }

  // ── Pending: hold > 0, awaiting executes_at or cancel ────────────────────
  if (view === 'pending') {
    const executesAt = status?.releaseExecutesAt || result?.executesAt;
    return (
      <Centered icon={<Loader2 className="w-7 h-7 text-amber-600 animate-pulse" />} iconBg="bg-amber-50">
        <h1 className="font-playfair text-2xl md:text-3xl font-black">Release is pending</h1>
        <p className="text-zinc-500 leading-relaxed">
          The release will execute on{' '}
          <strong className="text-navy">
            {executesAt ? new Date(executesAt).toLocaleString() : 'the scheduled date'}
          </strong>{' '}
          unless the guide owner cancels.
        </p>
        <BackButton />
      </Centered>
    );
  }

  // ── Done: release executed ────────────────────────────────────────────────
  if (view === 'done') {
    return (
      <Centered icon={<Heart className="w-8 h-8 text-primary" />} iconBg="bg-primary/10">
        <h1 className="font-playfair text-3xl md:text-4xl font-black">The release has begun.</h1>
        <p className="text-zinc-500 leading-relaxed">
          You don’t have to do anything else right now. We’ll be in touch by email the moment everything is ready,
          and we’re here if you need us.
        </p>
        <BackButton primary />
      </Centered>
    );
  }

  // ── STEPS ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-6 py-10 font-inter text-navy">
      <Link href="/dashboard/child/overview" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-navy font-medium transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      {/* Step indicator */}
      <div className="mt-8 mb-6 flex items-center gap-2">
        {[1, ...(hasSecondTR ? [2] : []), hasSecondTR ? 3 : 2].slice(0, hasSecondTR ? 3 : 2).map((n) => {
          const current = view === `step${n}` || (view === 'step2' && n === 2) || (view === 'step3' && n === (hasSecondTR ? 3 : 2));
          return (
            <div key={n} className={`h-1.5 rounded-full transition-all ${current ? 'bg-navy w-8' : 'bg-zinc-200 w-4'}`} />
          );
        })}
      </div>

      {view === 'step1' && (
        <Step
          icon={<AlertTriangle className="w-7 h-7 text-amber-600" />}
          iconBg="bg-amber-50"
          title="Before you continue"
          body={
            <>
              <p className="text-zinc-600 leading-relaxed">
                Confirming will release the guide to its <strong>designated recipients</strong>. They&apos;ll receive
                the special messages your loved one left, which <strong>may include sensitive details</strong>.
              </p>
              <p className="text-zinc-500 leading-relaxed">
                You won’t see who the recipients are — only that the release is now in their hands.
              </p>
            </>
          }
          primaryLabel="I understand, continue"
          onPrimary={proceedFromStep1}
          secondaryLabel="Cancel"
          secondaryHref="/dashboard/child/overview"
        />
      )}

      {view === 'step2' && (
        <Step
          icon={<Users className="w-7 h-7 text-primary" />}
          iconBg="bg-primary/10"
          title="Another trusted representative will be notified"
          body={
            <p className="text-zinc-600 leading-relaxed">
              This guide has more than one trusted representative. By proceeding, the other trusted
              representative(s) will be notified that the release has been initiated.
            </p>
          }
          primaryLabel="Continue"
          onPrimary={() => setView('step3')}
          secondaryLabel="Back"
          onSecondary={() => setView('step1')}
        />
      )}

      {view === 'step3' && (
        <Step
          icon={<Heart className="w-7 h-7 text-primary" />}
          iconBg="bg-primary/10"
          title="Confirm release"
          body={
            holdHours === 0 ? (
              <p className="text-zinc-600 leading-relaxed">
                By confirming, the guide is <strong>released now</strong>. If eligible, a refund will be granted,
                and payment drops to <strong>$5/year</strong> to keep the data in storage so recipients retain
                access.
              </p>
            ) : (
              <p className="text-zinc-600 leading-relaxed">
                By confirming, the release begins now and completes in <strong>{holdHours} hours</strong> unless
                canceled. The guide owner will be notified and can cancel. If eligible, a refund will be granted,
                and payment drops to <strong>$5/year</strong> so recipients retain access.
              </p>
            )
          }
          error={error}
          primaryLabel={busy ? 'Releasing…' : (holdHours === 0 ? 'Release now' : 'Begin release')}
          primaryBusy={busy}
          onPrimary={confirmRelease}
          primaryDestructive
          secondaryLabel="Back"
          onSecondary={() => setView(hasSecondTR ? 'step2' : 'step1')}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
//  Tiny presentational helpers — kept inline to match the existing single-file style.
// ────────────────────────────────────────────────────────────────────────────────

function Centered({ icon, iconBg, children }: { icon: React.ReactNode; iconBg: string; children: React.ReactNode }) {
  return (
    <div className="max-w-2xl mx-auto px-6 py-16 font-inter text-navy">
      <div className="flex flex-col items-center text-center space-y-6">
        <div className={`w-16 h-16 ${iconBg} rounded-full flex items-center justify-center`}>{icon}</div>
        <div className="space-y-3 max-w-md">{children}</div>
      </div>
    </div>
  );
}

function ShellBack({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-2xl mx-auto px-6 py-10 font-inter text-navy space-y-4">
      {children}
      <Link href="/dashboard/child/overview" className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline">
        <ArrowLeft className="w-4 h-4" /> Back to My Parent’s Guide
      </Link>
    </div>
  );
}

function BackButton({ primary }: { primary?: boolean } = {}) {
  return primary ? (
    <Link href="/dashboard/child/overview" className="bg-navy text-white font-bold px-10 py-4 rounded-xl hover:bg-navy/90 transition-colors">
      Return to My Parent’s Guide
    </Link>
  ) : (
    <Link href="/dashboard/child/overview" className="bg-navy text-white font-bold px-8 py-3.5 rounded-xl hover:bg-navy/90 transition-colors">
      Back to My Parent’s Guide
    </Link>
  );
}

interface StepProps {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  body: React.ReactNode;
  primaryLabel: string;
  onPrimary: () => void;
  primaryBusy?: boolean;
  primaryDestructive?: boolean;
  secondaryLabel: string;
  onSecondary?: () => void;
  secondaryHref?: string;
  error?: string | null;
}
function Step({ icon, iconBg, title, body, primaryLabel, onPrimary, primaryBusy, primaryDestructive, secondaryLabel, onSecondary, secondaryHref, error }: StepProps) {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <div className={`w-14 h-14 ${iconBg} rounded-2xl flex items-center justify-center shrink-0`}>{icon}</div>
        <h1 className="font-playfair text-2xl md:text-3xl font-black">{title}</h1>
      </div>
      <div className="space-y-4">{body}</div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-col gap-3 pt-2">
        <button
          onClick={onPrimary}
          disabled={!!primaryBusy}
          className={`w-full ${primaryDestructive ? 'bg-red-600 hover:bg-red-700' : 'bg-navy hover:bg-navy/90'} text-white font-bold py-4 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2`}
        >
          {primaryBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
          {primaryLabel}
        </button>
        {secondaryHref ? (
          <Link href={secondaryHref} className="w-full text-center py-4 font-bold text-zinc-400 hover:text-navy transition-colors">
            {secondaryLabel}
          </Link>
        ) : (
          <button onClick={onSecondary} className="w-full text-center py-4 font-bold text-zinc-400 hover:text-navy transition-colors">
            {secondaryLabel}
          </button>
        )}
      </div>
    </div>
  );
}
