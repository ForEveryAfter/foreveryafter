'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PartyPopper, CheckCircle, ArrowRight, Shield, Sparkles, Loader2 } from 'lucide-react';
import { useParentOnboarding } from '@/components/onboarding/ParentOnboardingContext';
import { useAuth } from '@/lib/auth-context';
import { completeOnboarding } from '@/lib/api';

const CADENCE_LABEL: Record<string, string> = {
  '3-months': 'Quarterly',
  '6-months': 'Bi-annually',
  '12-months': 'Annually',
};

export default function ParentDonePage() {
  const { state, resetOnboarding } = useParentOnboarding();
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [finishing, setFinishing] = useState(false);

  const firstName = user?.name?.trim().split(/\s+/)[0] || 'friend';
  const childNames = state.children.map((c) => c.name.split(' ')[0]).filter(Boolean);
  const childrenLabel = childNames.length ? childNames.join(' and ') : 'your family';

  // Mark signup finished, refresh the session (so the dashboard gate passes), then go.
  const finish = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      if (user?.guid) await completeOnboarding(user.guid);
      await refresh();
      resetOnboarding();
      router.replace('/dashboard');
    } catch {
      setFinishing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF7] font-inter text-navy flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-xl w-full space-y-12">
        <div className="relative inline-block">
          <div className="absolute inset-0 bg-gold/10 blur-3xl rounded-full scale-150 animate-pulse" />
          <div className="relative bg-white w-24 h-24 rounded-[32px] shadow-2xl flex items-center justify-center text-gold border border-zinc-100">
            <CheckCircle className="w-12 h-12" />
          </div>
          <div className="absolute -top-2 -right-2 bg-navy text-white p-2 rounded-full shadow-lg">
            <PartyPopper className="w-5 h-5" />
          </div>
        </div>

        <div className="space-y-4">
          <h1 className="font-playfair text-4xl md:text-5xl font-black">Your guide is ready.</h1>
          <p className="text-zinc-500 text-lg leading-relaxed max-w-md mx-auto">
            You've built a beautiful bridge for your family, {firstName}. We've notified {childrenLabel} that you've started this journey.
          </p>
        </div>

        <div className="bg-white p-10 rounded-[40px] shadow-xl border border-zinc-100 grid grid-cols-1 md:grid-cols-2 gap-8 divide-y md:divide-y-0 md:divide-x divide-zinc-50">
          <div className="py-2 space-y-2">
            <div className="flex items-center justify-center gap-2 text-gold">
              <Shield className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest leading-none">Security Status</span>
            </div>
            <p className="text-xl font-black">Encrypted</p>
          </div>
          <div className="py-2 space-y-2">
            <div className="flex items-center justify-center gap-2 text-gold">
              <Sparkles className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest leading-none">Check-ins</span>
            </div>
            <p className="text-xl font-black">{CADENCE_LABEL[state.checkInCadence]}</p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-6 pt-4">
          <button
            onClick={finish}
            disabled={finishing}
            className="w-full bg-navy text-white font-black text-xl py-6 rounded-3xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 shadow-xl shadow-navy/20 disabled:opacity-70"
          >
            {finishing ? <Loader2 className="w-6 h-6 animate-spin" /> : <>Start my guide <ArrowRight className="w-6 h-6 text-gold" /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
