'use client';

import React from 'react';
import OnboardingLayout from '@/components/onboarding/OnboardingLayout';
import { useParentOnboarding, type PersonData } from '@/components/onboarding/ParentOnboardingContext';
import { useAuth } from '@/lib/auth-context';
import { saveOnboarding } from '@/lib/api';
import { Heart, Users, Plus, Trash2 } from 'lucide-react';

const fieldClass =
  'w-full bg-white border border-zinc-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-gold/20 focus:border-gold transition-all';

export default function ParentStep2Page() {
  const { state, updateState } = useParentOnboarding();
  const { user } = useAuth();

  const setSpouse = (patch: Partial<PersonData>) => updateState({ spouse: { ...state.spouse, ...patch } });

  const setChild = (i: number, patch: Partial<PersonData>) =>
    updateState({ children: state.children.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) });

  const addChild = () =>
    updateState({ children: [...state.children, { name: '', email: '', mobile: '', role: 'child', active: true }] });

  const removeChild = (i: number) =>
    updateState({ children: state.children.filter((_, idx) => idx !== i) });

  const persist = () => {
    if (!user?.guid) return;
    const family = [
      ...(state.spouseEnabled && state.spouse.name.trim()
        ? [{ displayName: state.spouse.name, email: state.spouse.email || null, phone: state.spouse.mobile || null, relationship: 'spouse' }]
        : []),
      ...state.children
        .filter((c) => c.name.trim())
        .map((c) => ({ displayName: c.name, email: c.email || null, phone: c.mobile || null, relationship: c.role || 'child' })),
    ];
    saveOnboarding(user.guid, { family }).catch(() => {});
  };

  return (
    <OnboardingLayout
      step={2}
      variant="parent"
      title="Your inner circle."
      subtitle="Who are we protecting this information for? Adding them now ensures they have access when it matters most."
      nextHref="/onboarding/parent/step-3"
      prevHref="/onboarding/parent/step-1"
      onNext={persist}
      showSkip
      showBypass
    >
      <div className="space-y-12">
        {/* Spouse Section */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-navy flex items-center gap-2">
              <Heart className="w-5 h-5 text-gold" /> Spouse or Partner
            </h3>
            <div
              onClick={() => updateState({ spouseEnabled: !state.spouseEnabled })}
              className={`w-14 h-8 rounded-full flex items-center px-1 cursor-pointer transition-colors ${state.spouseEnabled ? 'bg-gold' : 'bg-zinc-200'}`}
            >
              <div className={`w-6 h-6 bg-white rounded-full transition-transform ${state.spouseEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
            </div>
          </div>

          {state.spouseEnabled && (
            <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm animate-in fade-in slide-in-from-top-2 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-zinc-400">Name</label>
                <input className={fieldClass} value={state.spouse.name} onChange={(e) => setSpouse({ name: e.target.value })} placeholder="Full name" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-zinc-400">Email</label>
                <input className={fieldClass} type="email" value={state.spouse.email} onChange={(e) => setSpouse({ email: e.target.value })} placeholder="name@email.com" />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-[10px] font-bold uppercase text-zinc-400">Mobile (optional)</label>
                <input className={fieldClass} type="tel" value={state.spouse.mobile} onChange={(e) => setSpouse({ mobile: e.target.value })} placeholder="555-000-0000" />
              </div>
            </div>
          )}
        </div>

        {/* Children Section */}
        <div className="space-y-6">
          <h3 className="font-bold text-navy flex items-center gap-2">
            <Users className="w-5 h-5 text-gold" /> Children
          </h3>

          <div className="space-y-4">
            {state.children.map((child, i) => (
              <div key={i} className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-300">Child {i + 1}</span>
                  <button onClick={() => removeChild(i)} className="text-zinc-300 hover:text-red-500 transition-colors" aria-label="Remove child">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input className={fieldClass} value={child.name} onChange={(e) => setChild(i, { name: e.target.value })} placeholder="Full name" />
                  <input className={fieldClass} type="email" value={child.email} onChange={(e) => setChild(i, { email: e.target.value })} placeholder="name@email.com" />
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={addChild}
            className="flex items-center gap-2 text-sm font-bold text-gold hover:underline"
          >
            <Plus className="w-4 h-4" /> Add a child
          </button>
        </div>
      </div>
    </OnboardingLayout>
  );
}
