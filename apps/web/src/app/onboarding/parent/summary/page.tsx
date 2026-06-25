'use client';

import React from 'react';
import OnboardingLayout from '@/components/onboarding/OnboardingLayout';
import { useParentOnboarding } from '@/components/onboarding/ParentOnboardingContext';
import { useAuth } from '@/lib/auth-context';
import { Edit2, User, Users, Heart, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

const CADENCE_LABEL: Record<string, string> = {
  '3-months': 'Quarterly',
  '6-months': 'Bi-annually',
  '12-months': 'Annually',
};

export default function ParentSummaryPage() {
  const { state } = useParentOnboarding();
  const { user } = useAuth();

  const primary = [...state.children, ...(state.spouseEnabled ? [state.spouse] : [])].find(
    (p) => p.email && p.email === state.primaryAccessEmail
  );

  return (
    <OnboardingLayout
      step={5}
      variant="parent"
      title="Family Review."
      subtitle="Verify your inner circle and access settings before we finalize your plan."
      nextHref="/onboarding/parent/pricing"
      prevHref="/onboarding/parent/step-4"
    >
      <div className="space-y-8">
        {/* User Profile */}
        <div className="bg-white p-8 rounded-[32px] border border-zinc-100 shadow-sm flex items-center justify-between group">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-gold/5 rounded-2xl flex items-center justify-center text-gold">
              <User className="w-8 h-8" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Account Owner</p>
              <h3 className="font-bold text-navy text-xl">{user?.name || '—'}</h3>
              <p className="text-sm text-zinc-400">{user?.email || ''}</p>
            </div>
          </div>
          <Link href="/onboarding/parent/step-1" className="p-3 hover:bg-zinc-50 rounded-xl text-zinc-300 hover:text-gold transition-all">
            <Edit2 className="w-5 h-5" />
          </Link>
        </div>

        {/* Spouse (if enabled) */}
        {state.spouseEnabled && state.spouse.name && (
          <div className="bg-white p-8 rounded-[32px] border border-zinc-100 shadow-sm flex items-center justify-between group">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 bg-gold/5 rounded-2xl flex items-center justify-center text-gold">
                <Heart className="w-8 h-8" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Spouse</p>
                <h3 className="font-bold text-navy text-xl">{state.spouse.name}</h3>
                <p className="text-sm text-zinc-400">{state.spouse.email}</p>
              </div>
            </div>
            <Link href="/onboarding/parent/step-2" className="p-3 hover:bg-zinc-50 rounded-xl text-zinc-300 hover:text-gold transition-all">
              <Edit2 className="w-5 h-5" />
            </Link>
          </div>
        )}

        {/* Children & Access */}
        <div className="bg-white p-8 rounded-[32px] border border-zinc-100 shadow-sm space-y-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 bg-gold/5 rounded-2xl flex items-center justify-center text-gold">
                <Users className="w-8 h-8" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Family Guides</p>
                <h3 className="font-bold text-navy text-xl">{state.children.length} {state.children.length === 1 ? 'Child' : 'Children'}</h3>
                <div className="flex flex-wrap gap-2 mt-2">
                  {state.children.map((c, i) => (
                    <span key={i} className="text-[10px] bg-zinc-50 px-2 py-1 rounded-md text-zinc-500 font-medium">
                      {c.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <Link href="/onboarding/parent/step-2" className="p-3 hover:bg-zinc-50 rounded-xl text-zinc-300 hover:text-gold transition-all">
              <Edit2 className="w-5 h-5" />
            </Link>
          </div>

          <div className="pt-8 border-t border-zinc-50 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-gold/10 rounded-full flex items-center justify-center text-gold">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Primary Access</p>
                <p className="font-bold text-navy">{primary?.name || 'Not set'}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Check-in Cadence</p>
              <p className="font-bold text-navy">{CADENCE_LABEL[state.checkInCadence]}</p>
            </div>
          </div>
        </div>
      </div>
    </OnboardingLayout>
  );
}
