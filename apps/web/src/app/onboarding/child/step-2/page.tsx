'use client';

import React from 'react';
import OnboardingLayout from '@/components/onboarding/OnboardingLayout';
import { useOnboarding } from '@/components/onboarding/OnboardingContext';

export default function Step2Page() {
  const { state, updateState } = useOnboarding();

  const handleUpdate = (updates: any) => {
    updateState({ parent1: { ...state.parent1, ...updates } });
  };

  return (
    <OnboardingLayout
      step={2}
      title="Who are we helping?"
      subtitle="Enter the details for the first parent you'd like to help guide."
      nextHref="/onboarding/child/step-3"
      prevHref="/onboarding/child/step-1"
      showBypass
    >
      <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">First Parent's Name</label>
            <input 
              type="text" 
              value={state.parent1.name}
              onChange={(e) => handleUpdate({ name: e.target.value })}
              className="w-full bg-white border border-zinc-200 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              placeholder="e.g. Harold Lee"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Relationship</label>
            <select 
              value={state.parent1.role}
              onChange={(e) => handleUpdate({ role: e.target.value })}
              className="w-full bg-white border border-zinc-200 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            >
              <option value="father">Father</option>
              <option value="mother">Mother</option>
              <option value="grandfather">Grandfather</option>
              <option value="grandmother">Grandmother</option>
              <option value="spouse">Spouse</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Email Address</label>
            <input 
              type="email" 
              value={state.parent1.email}
              onChange={(e) => handleUpdate({ email: e.target.value })}
              className="w-full bg-white border border-zinc-200 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              placeholder="parent@example.com"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Mobile Number (Optional)</label>
            <input 
              type="tel" 
              value={state.parent1.mobile}
              onChange={(e) => handleUpdate({ mobile: e.target.value })}
              className="w-full bg-white border border-zinc-200 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              placeholder="555-000-0000"
            />
          </div>
        </div>

        <div className="p-6 bg-primary/5 rounded-2xl border border-primary/10">
          <p className="text-sm text-primary leading-relaxed italic">
            "Your parent stays in control. We won't contact them until you've reviewed the invitation later in this setup."
          </p>
        </div>
      </div>
    </OnboardingLayout>
  );
}
