'use client';

import React from 'react';
import OnboardingLayout from '@/components/onboarding/OnboardingLayout';
import { useOnboarding } from '@/components/onboarding/OnboardingContext';

export default function Step3Page() {
  const { state, updateState } = useOnboarding();

  const handleToggle = () => {
    updateState({ parent2: { ...state.parent2, active: !state.parent2.active } });
  };

  const handleUpdate = (updates: any) => {
    updateState({ parent2: { ...state.parent2, ...updates } });
  };

  return (
    <OnboardingLayout
      step={3}
      title="Will someone be joining them?"
      subtitle="If your parent has a spouse or partner, adding them now ensures their stories and affairs stay connected."
      nextHref="/onboarding/child/step-4"
      prevHref="/onboarding/child/step-2"
      showSkip
      showBypass
    >
      <div className="space-y-10">
        <div 
          onClick={handleToggle}
          className={`p-8 rounded-[32px] border-2 cursor-pointer transition-all flex items-center justify-between gap-6 ${state.parent2.active ? 'bg-primary/5 border-primary shadow-lg shadow-primary/5' : 'bg-white border-zinc-100'}`}
        >
          <div className="space-y-1">
            <h3 className="font-playfair text-2xl font-bold text-navy">Add a spouse or partner</h3>
            <p className="text-zinc-500 text-sm">Recommended for combined records and legacies.</p>
          </div>
          <div className={`w-14 h-8 rounded-full flex items-center px-1 transition-colors ${state.parent2.active ? 'bg-primary' : 'bg-zinc-200'}`}>
            <div className={`w-6 h-6 bg-white rounded-full transition-transform ${state.parent2.active ? 'translate-x-6' : 'translate-x-0'}`} />
          </div>
        </div>

        {state.parent2.active && (
          <div className="space-y-8 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Name</label>
                <input 
                  type="text" 
                  value={state.parent2.name}
                  onChange={(e) => handleUpdate({ name: e.target.value })}
                  className="w-full bg-white border border-zinc-200 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="e.g. Dorothy Lee"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Relationship</label>
                <select 
                  value={state.parent2.role}
                  onChange={(e) => handleUpdate({ role: e.target.value })}
                  className="w-full bg-white border border-zinc-200 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                >
                  <option value="mother">Mother</option>
                  <option value="father">Father</option>
                  <option value="grandmother">Grandmother</option>
                  <option value="spouse">Spouse</option>
                  <option value="partner">Partner</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Email Address</label>
                <input 
                  type="email" 
                  value={state.parent2.email}
                  onChange={(e) => handleUpdate({ email: e.target.value })}
                  className="w-full bg-white border border-zinc-200 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="partner@example.com"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Mobile Number (Optional)</label>
                <input 
                  type="tel" 
                  value={state.parent2.mobile}
                  onChange={(e) => handleUpdate({ mobile: e.target.value })}
                  className="w-full bg-white border border-zinc-200 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="555-000-0000"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </OnboardingLayout>
  );
}
