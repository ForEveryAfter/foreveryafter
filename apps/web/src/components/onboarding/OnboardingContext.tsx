'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export type ParentData = {
  name: string;
  email: string;
  mobile: string;
  role: string;
  active: boolean;
};

export type SiblingData = {
  name: string;
  email: string;
  relationship: string;
};

export type OnboardingState = {
  step: number;
  childName: string;
  parent1: ParentData;
  parent2: ParentData;
  siblings: SiblingData[];
  plan: 'annual' | 'five-year' | 'ten-year' | 'free' | null;
  spouseEnabled: boolean;
  personalNotes: {
    parent1: string;
    parent2: string;
  };
};

const INITIAL_STATE: OnboardingState = {
  step: 1,
  childName: "Myron Lee",
  parent1: {
    name: "Harold Lee",
    email: "myron_lee@hotmail.com",
    mobile: "555-0142",
    role: "father",
    active: true,
  },
  parent2: {
    name: "Dorothy Lee",
    email: "dorothy_lee@hotmail.com",
    mobile: "555-0143",
    role: "mother",
    active: true, // spouse toggle defaults ON
  },
  siblings: [
    { name: "Kevin Lee", email: "kevin_lee@hotmail.com", relationship: "brother" },
    { name: "Linda Park", email: "linda_park@hotmail.com", relationship: "sister" },
  ],
  plan: null,
  spouseEnabled: true,
  personalNotes: {
    parent1: "I've been thinking about our family stories and wanted a safe place for us to keep everything. I started this for you.",
    parent2: "I'm setting this up for both of you so we can preserve our memories together.",
  },
};

type OnboardingContextType = {
  state: OnboardingState;
  updateState: (updates: Partial<OnboardingState>) => void;
  resetOnboarding: () => void;
};

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export const OnboardingProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<OnboardingState>(INITIAL_STATE);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('lb_onboarding_state');
    if (saved) {
      try {
        setState(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse onboarding state", e);
      }
    }
    setIsInitialized(true);
  }, []);

  // Save to localStorage when state changes
  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('lb_onboarding_state', JSON.stringify(state));
    }
  }, [state, isInitialized]);

  const updateState = (updates: Partial<OnboardingState>) => {
    setState(prev => ({ ...prev, ...updates }));
  };

  const resetOnboarding = () => {
    setState(INITIAL_STATE);
    localStorage.removeItem('lb_onboarding_state');
  };

  return (
    <OnboardingContext.Provider value={{ state, updateState, resetOnboarding }}>
      {children}
    </OnboardingContext.Provider>
  );
};

export const useOnboarding = () => {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
};
