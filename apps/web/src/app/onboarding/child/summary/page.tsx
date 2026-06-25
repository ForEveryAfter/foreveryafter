'use client';

import React from 'react';
import OnboardingLayout from '@/components/onboarding/OnboardingLayout';
import { useOnboarding } from '@/components/onboarding/OnboardingContext';
import { Edit2, User, Users, Heart } from 'lucide-react';
import Link from 'next/link';

export default function SummaryPage() {
  const { state } = useOnboarding();

  return (
    <OnboardingLayout
      step={5}
      title="Review your family group."
      subtitle="Make sure everything looks correct before we move to the next step."
      nextHref="/onboarding/child/pricing"
      prevHref="/onboarding/child/step-4"
    >
      <div className="space-y-6">
        {/* Child Card */}
        <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm flex items-center justify-between group">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/5 rounded-2xl flex items-center justify-center text-primary">
              <User className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">You (Child)</p>
              <h3 className="font-bold text-navy">{state.childName}</h3>
            </div>
          </div>
          <Link href="/onboarding/child/step-1" className="p-2 hover:bg-zinc-50 rounded-lg text-zinc-300 hover:text-primary transition-all">
            <Edit2 className="w-4 h-4" />
          </Link>
        </div>

        {/* Parent 1 Card */}
        <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm flex items-center justify-between group">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/5 rounded-2xl flex items-center justify-center text-primary">
              <Heart className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{state.parent1.role} (Parent)</p>
              <h3 className="font-bold text-navy">{state.parent1.name}</h3>
              <p className="text-xs text-zinc-400">{state.parent1.email}</p>
            </div>
          </div>
          <Link href="/onboarding/child/step-2" className="p-2 hover:bg-zinc-50 rounded-lg text-zinc-300 hover:text-primary transition-all">
            <Edit2 className="w-4 h-4" />
          </Link>
        </div>

        {/* Parent 2 Card (if active) */}
        {state.parent2.active && (
          <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm flex items-center justify-between group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary/5 rounded-2xl flex items-center justify-center text-primary">
                <Heart className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{state.parent2.role} (Parent)</p>
                <h3 className="font-bold text-navy">{state.parent2.name}</h3>
                <p className="text-xs text-zinc-400">{state.parent2.email}</p>
              </div>
            </div>
            <Link href="/onboarding/child/step-3" className="p-2 hover:bg-zinc-50 rounded-lg text-zinc-300 hover:text-primary transition-all">
              <Edit2 className="w-4 h-4" />
            </Link>
          </div>
        )}

        {/* Siblings Card */}
        {state.siblings.length > 0 && (
          <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm flex items-center justify-between group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary/5 rounded-2xl flex items-center justify-center text-primary">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Co-Guides (Siblings)</p>
                <h3 className="font-bold text-navy">{state.siblings.length} sibling{state.siblings.length !== 1 ? 's' : ''} added</h3>
                <div className="flex gap-1 mt-1">
                  {state.siblings.map((s, i) => (
                    <span key={i} className="text-[10px] bg-zinc-50 px-2 py-0.5 rounded text-zinc-500">{s.name.split(' ')[0]}</span>
                  ))}
                </div>
              </div>
            </div>
            <Link href="/onboarding/child/step-4" className="p-2 hover:bg-zinc-50 rounded-lg text-zinc-300 hover:text-primary transition-all">
              <Edit2 className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>
    </OnboardingLayout>
  );
}
