'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { useParentOnboarding } from '@/components/onboarding/ParentOnboardingContext';
import { getOnboarding } from '@/lib/api';

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const { hydrate } = useParentOnboarding();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }
    if (user?.inviteFlowStatus === 'pending') {
      router.replace('/invite-flow');
      return;
    }
    if (user?.onboardingComplete) {
      router.replace('/dashboard');
      return;
    }
    // Onboarding happens AFTER the first payment — an unpaid user must subscribe first.
    if (!user?.subscriptionActive) {
      router.replace('/dashboard');
      return;
    }
    // Resume: prefill the flow with whatever is already in the DB.
    getOnboarding()
      .then(hydrate)
      .catch(() => {})
      .finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isAuthenticated, user?.onboardingComplete, user?.inviteFlowStatus, user?.subscriptionActive]);

  if (
    isLoading ||
    !isAuthenticated ||
    user?.onboardingComplete ||
    user?.inviteFlowStatus === 'pending' ||
    !user?.subscriptionActive ||
    !ready
  ) {
    return (
      <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gold" />
      </div>
    );
  }
  return <>{children}</>;
}

export default function ParentOnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <OnboardingGate>{children}</OnboardingGate>
    </AuthProvider>
  );
}
