'use client';

import React from 'react';
import OnboardingLayout from '@/components/onboarding/OnboardingLayout';
import { useOnboarding } from '@/components/onboarding/OnboardingContext';

export default function Step1Page() {
  const { state, updateState } = useOnboarding();

  return (
    <OnboardingLayout
      step={1}
      title="First, let's confirm your name."
      subtitle="This is how you'll appear in the system and on invitations to your family."
      nextHref="/onboarding/child/step-2"
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Full Name</label>
          <input 
            type="text" 
            value={state.childName}
            onChange={(e) => updateState({ childName: e.target.value })}
            className="w-full bg-white border border-zinc-200 rounded-xl p-4 text-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder="Your full name"
          />
        </div>
        <p className="text-zinc-400 text-sm italic">
          Pre-filled from your secure login.
        </p>
      </div>
    </OnboardingLayout>
  );
}
