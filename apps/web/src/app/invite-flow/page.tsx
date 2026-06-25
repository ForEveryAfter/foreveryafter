'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldCheck, Heart, ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import IntroVideoOverlay from '@/components/dashboard/IntroVideoOverlay';
import {
  getInviteInfo,
  saveInviteInfo,
  markInviteVideoSeen,
  completeInvite,
  type InviteInfo,
} from '@/lib/api';

// TODO(assets): replace with the real child-welcome + trusted-individual videos when
// they exist. Only /parent/parent-intro.mp4 is on disk today, so it's the placeholder.
const CHILD_VIDEO = '/parent/parent-intro.mp4';
const TI_VIDEO = '/parent/parent-intro.mp4';

type Step = 'loading' | 'child-video' | 'child-review' | 'ti-review-entry' | 'ti-video' | 'ti-review-confirm';

export default function InviteFlowPage() {
  const { refresh } = useAuth();
  const router = useRouter();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [step, setStep] = useState<Step>('loading');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getInviteInfo()
      .then((d) => {
        setInfo(d);
        setPhone(d.phone || '');
        if (d.role === 'trusted') setStep('ti-review-entry');
        else setStep(d.videoSeen ? 'child-review' : 'child-video');
      })
      .catch(() => setError('Couldn’t load your invitation.'));
  }, []);

  const finish = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await completeInvite();
      await refresh();
      router.replace('/dashboard/child/overview');
    } catch {
      setError('Couldn’t finish. Please try again.');
      setBusy(false);
    }
  };

  const onVideoEnded = async (next: Step) => {
    markInviteVideoSeen().catch(() => {});
    setStep(next);
  };

  const submitTiInfo = async () => {
    if (busy) return;
    if (!phone.trim()) {
      setError('A phone number is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveInviteInfo({ phone: phone.trim() });
      setBusy(false);
      setStep(info?.videoSeen ? 'ti-review-confirm' : 'ti-video');
    } catch {
      setError('Couldn’t save. Please try again.');
      setBusy(false);
    }
  };

  if (step === 'loading' || !info) {
    return (
      <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  // ── Video steps (full-screen; advance when the video ends) ──
  if (step === 'child-video') {
    return <IntroVideoOverlay videoUrl={CHILD_VIDEO} onDismiss={() => onVideoEnded('child-review')} />;
  }
  if (step === 'ti-video') {
    return <IntroVideoOverlay videoUrl={TI_VIDEO} onDismiss={() => onVideoEnded('ti-review-confirm')} />;
  }

  const name = [info.firstName, info.lastName].filter(Boolean).join(' ');
  const parent = info.parentFirstName;

  const Field = ({ label, value }: { label: string; value: string }) => (
    <div className="space-y-1">
      <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{label}</label>
      <p className="text-navy font-medium">{value || '—'}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FAFAF7] font-inter text-navy flex flex-col items-center justify-center p-6">
      <div className="bg-white w-full max-w-md rounded-[32px] shadow-xl border border-zinc-100 p-8 md:p-10 space-y-8">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
            {info.role === 'trusted' ? <ShieldCheck className="w-6 h-6" /> : <Heart className="w-6 h-6" />}
          </div>
          <div>
            <h1 className="font-playfair text-2xl font-black leading-tight">
              {info.role === 'trusted' ? "You're a trusted individual" : 'Review your details'}
            </h1>
            {parent && <p className="text-sm text-zinc-500">for {parent}&apos;s guide</p>}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* TI: enter required contact info before the video */}
        {step === 'ti-review-entry' && (
          <>
            <p className="text-sm text-zinc-500 leading-relaxed">
              As a trusted individual, please confirm how we can reach you — both an email and phone are required.
            </p>
            <div className="space-y-5">
              <Field label="Name" value={name} />
              <Field label="Email" value={info.email || ''} />
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Phone (required)</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="555-000-0000"
                  className="w-full bg-zinc-50 border-none rounded-xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
            <button
              onClick={submitTiInfo}
              disabled={busy}
              className="w-full bg-primary text-white font-bold py-4 rounded-xl hover:bg-primary/90 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Continue <ArrowRight className="w-5 h-5" /></>}
            </button>
          </>
        )}

        {/* Review screens (read-only) → finish into My Parent's Guide */}
        {(step === 'child-review' || step === 'ti-review-confirm') && (
          <>
            <p className="text-sm text-zinc-500 leading-relaxed">
              {info.role === 'trusted'
                ? 'Here are your details. Your email and phone are how we’ll reach you.'
                : 'These are your details. Your email and phone are managed by your family and can’t be changed here.'}
            </p>
            <div className="space-y-5">
              <Field label="Name" value={name} />
              <Field label="Email" value={info.email || ''} />
              <Field label="Phone" value={phone} />
            </div>
            <button
              onClick={finish}
              disabled={busy}
              className="w-full bg-primary text-white font-bold py-4 rounded-xl hover:bg-primary/90 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Go to my parent&apos;s guide <ArrowRight className="w-5 h-5" /></>}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
