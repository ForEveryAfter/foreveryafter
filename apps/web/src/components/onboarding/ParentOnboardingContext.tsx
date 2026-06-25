'use client';

import React, { createContext, useContext, useState } from 'react';
import type { OnboardingData } from '@/lib/api';

export type PersonData = {
  id?: string; // family_members.id once persisted
  name: string;
  email: string;
  mobile: string;
  role: string; // relationship label
  active: boolean;
};

export type ParentOnboardingState = {
  parentPhone: string;
  spouse: PersonData;
  children: PersonData[];
  primaryAccessEmail: string; // email of the chosen primary access person
  checkInCadence: '3-months' | '6-months' | '12-months';
  plan: 'annual' | 'five-year' | 'ten-year' | null;
  spouseEnabled: boolean;
  billingOwner: 'self' | 'child';
  personalNotes: {
    children: string;
    spouse: string;
  };
};

// No hardcoded identities — real data comes from the session + DB (hydrate()).
const INITIAL_STATE: ParentOnboardingState = {
  parentPhone: '',
  spouse: { name: '', email: '', mobile: '', role: 'spouse', active: false },
  children: [],
  primaryAccessEmail: '',
  checkInCadence: '3-months',
  plan: null,
  spouseEnabled: false,
  billingOwner: 'self',
  personalNotes: {
    children:
      "I've been thinking about our family stories and wanted a safe place for us to keep everything. I started this for you.",
    spouse:
      "I'm setting this up for both of us so we can preserve our memories together. I'd love for you to set up your guide too.",
  },
};

const cadenceFromMonths = (m: number | null): ParentOnboardingState['checkInCadence'] =>
  m === 6 ? '6-months' : m === 12 ? '12-months' : '3-months';

const planFromType = (t?: string | null): ParentOnboardingState['plan'] =>
  t === 'five_year' ? 'five-year' : t === 'ten_year' ? 'ten-year' : t === 'annual' ? 'annual' : null;

type ParentOnboardingContextType = {
  state: ParentOnboardingState;
  hydrated: boolean;
  updateState: (updates: Partial<ParentOnboardingState>) => void;
  hydrate: (data: OnboardingData) => void;
  resetOnboarding: () => void;
};

const ParentOnboardingContext = createContext<ParentOnboardingContextType | undefined>(undefined);

export const ParentOnboardingProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<ParentOnboardingState>(INITIAL_STATE);
  const [hydrated, setHydrated] = useState(false);

  const updateState = (updates: Partial<ParentOnboardingState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  // Populate state from the DB so a returning user resumes with their data.
  const hydrate = (data: OnboardingData) => {
    const spouse = data.family.find((m) => (m.relationship || '').toLowerCase() === 'spouse');
    const kids = data.family.filter((m) => (m.relationship || '').toLowerCase() !== 'spouse');
    const primary = data.access.primaryTiMemberId
      ? data.family.find((m) => m.id === data.access.primaryTiMemberId)
      : null;

    setState({
      parentPhone: data.profile.phone || '',
      spouse: spouse
        ? { id: spouse.id, name: spouse.displayName, email: spouse.email || '', mobile: spouse.phone || '', role: spouse.relationship || 'spouse', active: true }
        : INITIAL_STATE.spouse,
      children: kids.map((m) => ({
        id: m.id,
        name: m.displayName,
        email: m.email || '',
        mobile: m.phone || '',
        role: m.relationship || 'child',
        active: true,
      })),
      primaryAccessEmail: primary?.email || '',
      checkInCadence: cadenceFromMonths(data.access.intervalMonths),
      plan: planFromType(data.plan?.planType),
      spouseEnabled: !!spouse,
      billingOwner: data.plan?.billingOwner === 'child' ? 'child' : 'self',
      personalNotes: INITIAL_STATE.personalNotes,
    });
    setHydrated(true);
  };

  const resetOnboarding = () => {
    setState(INITIAL_STATE);
    setHydrated(false);
  };

  return (
    <ParentOnboardingContext.Provider value={{ state, hydrated, updateState, hydrate, resetOnboarding }}>
      {children}
    </ParentOnboardingContext.Provider>
  );
};

export const useParentOnboarding = () => {
  const context = useContext(ParentOnboardingContext);
  if (!context) {
    throw new Error('useParentOnboarding must be used within a ParentOnboardingProvider');
  }
  return context;
};

// Map the context state into the PATCH /onboarding payload shape.
export function toOnboardingPayload(state: ParentOnboardingState) {
  const monthsByCadence = { '3-months': 3, '6-months': 6, '12-months': 12 } as const;
  const planType = state.plan ? state.plan.replace(/-/g, '_') : undefined;
  const family = [
    ...(state.spouseEnabled && state.spouse.name
      ? [{ displayName: state.spouse.name, email: state.spouse.email || null, phone: state.spouse.mobile || null, relationship: 'spouse' }]
      : []),
    ...state.children
      .filter((c) => c.name)
      .map((c) => ({ displayName: c.name, email: c.email || null, phone: c.mobile || null, relationship: c.role || 'child' })),
  ];
  return {
    profile: { phone: state.parentPhone },
    family,
    access: {
      primaryMemberEmail: state.primaryAccessEmail || null,
      intervalMonths: monthsByCadence[state.checkInCadence],
    },
    ...(planType
      ? { plan: { planType, coverage: state.spouseEnabled ? 'both' : 'single', billingOwner: state.billingOwner } }
      : {}),
  };
}
