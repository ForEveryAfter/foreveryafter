'use client';

import React from 'react';
import OnboardingLayout from '@/components/onboarding/OnboardingLayout';
import { useParentOnboarding } from '@/components/onboarding/ParentOnboardingContext';
import { useAuth } from '@/lib/auth-context';
import { saveOnboarding } from '@/lib/api';
import { Info } from 'lucide-react';

export default function ParentStep1Page() {
  const { state, updateState } = useParentOnboarding();
  const { user } = useAuth();
  const firstName = user?.name?.trim().split(/\s+/)[0] || 'there';

  return (
    <OnboardingLayout
      step={1}
      variant="parent"
      title={`Welcome, ${firstName}.`}
      subtitle="Let's confirm your details as we begin setting up your family guide."
      nextHref="/onboarding/parent/step-2"
      onNext={() => {
        if (user?.guid) saveOnboarding(user.guid, { profile: { phone: state.parentPhone } }).catch(() => {});
      }}
      showBypass
    >
      <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Full Name</label>
            <input
              type="text"
              value={user?.name || ''}
              readOnly
              className="w-full bg-zinc-50 border border-zinc-100 rounded-xl p-4 text-zinc-400 cursor-not-allowed"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Email Address</label>
            <input
              type="email"
              value={user?.email || ''}
              readOnly
              className="w-full bg-zinc-50 border border-zinc-100 rounded-xl p-4 text-zinc-400 cursor-not-allowed"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
            Mobile Number
            <div className="group relative">
              <Info className="w-3 h-3 text-zinc-300 cursor-help" />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-navy text-white text-[10px] rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                Used for secondary security and emergency check-ins.
              </div>
            </div>
          </label>
          <input
            type="tel"
            value={state.parentPhone}
            onChange={(e) => updateState({ parentPhone: e.target.value })}
            className="w-full bg-white border border-zinc-200 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-gold/20 focus:border-gold transition-all"
            placeholder="555-000-0000"
          />
        </div>

        <div className="p-6 bg-gold/5 rounded-2xl border border-gold/10">
          <p className="text-sm text-gold leading-relaxed italic">
            "This guide is your space to share what matters most. We'll ensure your stories and information reach your family exactly when you want."
          </p>
        </div>
      </div>
    </OnboardingLayout>
  );
}
