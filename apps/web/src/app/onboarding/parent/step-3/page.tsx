'use client';

import React from 'react';
import OnboardingLayout from '@/components/onboarding/OnboardingLayout';
import { useParentOnboarding } from '@/components/onboarding/ParentOnboardingContext';
import { useAuth } from '@/lib/auth-context';
import { saveOnboarding } from '@/lib/api';
import { Shield, Clock, ChevronDown, Info, Check } from 'lucide-react';

const CADENCES = [
  { id: '3-months', name: 'Quarterly', desc: 'Recommended' },
  { id: '6-months', name: 'Bi-annually', desc: 'Balanced' },
  { id: '12-months', name: 'Annually', desc: 'Light touch' },
] as const;

const MONTHS = { '3-months': 3, '6-months': 6, '12-months': 12 } as const;

export default function ParentStep3Page() {
  const { state, updateState } = useParentOnboarding();
  const { user } = useAuth();

  // Only people with an email can be the primary contact (the API resolves by email).
  const candidates = [
    ...state.children,
    ...(state.spouseEnabled ? [state.spouse] : []),
  ].filter((p) => p.name.trim() && p.email.trim());

  const persist = () => {
    if (!user?.guid) return;
    saveOnboarding(user.guid, {
      access: {
        primaryMemberEmail: state.primaryAccessEmail || null,
        intervalMonths: MONTHS[state.checkInCadence],
      },
    }).catch(() => {});
  };

  return (
    <OnboardingLayout
      step={3}
      variant="parent"
      title="Who gets the key?"
      subtitle="Decide who will have primary access to your guide and how often we should check in with you."
      nextHref="/onboarding/parent/step-4"
      prevHref="/onboarding/parent/step-2"
      onNext={persist}
      showBypass
    >
      <div className="space-y-12">
        {/* Primary Contact */}
        <div className="space-y-6">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
            Primary Access Person
            <Info className="w-3 h-3 text-zinc-300" />
          </label>
          {candidates.length === 0 ? (
            <p className="text-sm text-zinc-400 italic">
              Add a family member with an email on the previous step to choose a primary access person.
            </p>
          ) : (
            <div className="relative">
              <select
                value={state.primaryAccessEmail}
                onChange={(e) => updateState({ primaryAccessEmail: e.target.value })}
                className="w-full bg-white border border-zinc-200 rounded-2xl p-6 appearance-none focus:outline-none focus:ring-2 focus:ring-gold/20 font-bold text-navy transition-all"
              >
                <option value="">Select a person…</option>
                {candidates.map((person) => (
                  <option key={person.email} value={person.email}>
                    {person.name} ({person.role})
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-300 pointer-events-none" />
            </div>
          )}
          <p className="text-xs text-zinc-400 italic">
            This person will be the first point of contact and can coordinate access with other family members.
          </p>
        </div>

        {/* Cadence Section */}
        <div className="space-y-6">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
            Check-in Cadence
            <Clock className="w-3 h-3 text-zinc-300" />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {CADENCES.map((c) => (
              <div
                key={c.id}
                onClick={() => updateState({ checkInCadence: c.id })}
                className={`p-6 rounded-3xl border-2 cursor-pointer transition-all flex flex-col items-center text-center gap-2 ${state.checkInCadence === c.id ? 'bg-gold/5 border-gold shadow-lg shadow-gold/5' : 'bg-white border-zinc-100 hover:border-zinc-200'}`}
              >
                {state.checkInCadence === c.id && (
                  <div className="w-6 h-6 bg-gold text-white rounded-full flex items-center justify-center mb-1">
                    <Check className="w-3 h-3" />
                  </div>
                )}
                <span className="font-bold text-navy">{c.name}</span>
                <span className="text-[10px] text-zinc-400 uppercase tracking-widest">{c.desc}</span>
              </div>
            ))}
          </div>

          <details className="group">
            <summary className="text-xs text-gold font-bold cursor-pointer list-none flex items-center gap-1">
              How check-ins work <ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform" />
            </summary>
            <div className="mt-4 p-6 bg-zinc-50 rounded-3xl space-y-4">
              <p className="text-xs text-zinc-500 leading-relaxed font-inter">
                We'll send you a simple "Are you okay?" notification at this interval. If you don't respond after several attempts and a grace period, we'll notify your primary access person.
              </p>
              <div className="flex items-start gap-3">
                <Shield className="w-4 h-4 text-gold shrink-0" />
                <p className="text-[10px] text-gold font-medium uppercase tracking-wider">Your guide remains locked until you are unreachable.</p>
              </div>
            </div>
          </details>
        </div>
      </div>
    </OnboardingLayout>
  );
}
