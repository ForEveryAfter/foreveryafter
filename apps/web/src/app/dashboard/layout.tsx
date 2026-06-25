'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2, ArrowRight, Lock } from 'lucide-react';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import DashboardNav from '@/components/dashboard/DashboardNav';
import FloatingChat from '@/components/dashboard/FloatingChat';
import { GuideReadOnlyProvider, type ReadOnlyReason } from '@/components/dashboard/ReadOnlyContext';

// Routes that stay fully interactive even when the guide is read-only:
//  - payments: the one thing they can always transact (to subscribe / reactivate)
//  - the child-side surfaces govern OTHER people's guides, not the logged-in user's
//    own subscription, so they must never be gated by it.
const EXEMPT_PREFIXES = [
  '/dashboard/payments',
  '/dashboard/child',
  '/dashboard/begin-sharing',
  '/dashboard/obituary',
  '/dashboard/parent-guide',
];

function FreePlanBanner() {
  return (
    <div className="bg-amber-50 border-b border-amber-200">
      <div className="max-w-6xl mx-auto px-6 py-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
        <Lock className="w-4 h-4 text-amber-600 shrink-0" />
        <span className="text-sm text-navy font-medium">
          You're on the free plan — this guide is read-only. Subscribe to start saving and editing.
        </span>
        <Link
          href="/dashboard/payments"
          className="inline-flex items-center gap-1 text-sm font-bold text-amber-700 hover:underline"
        >
          Subscribe <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const invitePending = user?.inviteFlowStatus === 'pending';
  const subscriptionActive = !!user?.subscriptionActive;
  const onboardingComplete = !!user?.onboardingComplete;

  // Read-only never applies on payments or the child-side surfaces.
  const onExemptRoute = EXEMPT_PREFIXES.some((p) => pathname?.startsWith(p));

  // Onboarding happens AFTER the first payment: a paid user who hasn't set up their own
  // guide is walked through it — but not while on payments / My Parent's Guide.
  const needsOnboarding = subscriptionActive && !onboardingComplete && !onExemptRoute;

  // Unpaid (free / expired / past-due) → the user's own guide is read-only. They can read
  // everything and navigate, but the only thing they can transact against is payments.
  const readOnly = !subscriptionActive && !onExemptRoute;
  const reason: ReadOnlyReason = readOnly ? 'no_payment' : null;

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) router.replace('/login');
    else if (invitePending) router.replace('/invite-flow');
    else if (needsOnboarding) router.replace('/onboarding/parent/step-1');
  }, [isLoading, isAuthenticated, invitePending, needsOnboarding, router]);

  if (isLoading || !isAuthenticated || invitePending || needsOnboarding) {
    return (
      <div className="min-h-screen bg-[#F7F5F0] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <GuideReadOnlyProvider value={{ readOnly, reason }}>
      <div className="min-h-screen bg-[#F7F5F0]">
        <DashboardNav />
        <main className="pt-16">
          {readOnly && <FreePlanBanner />}
          {/* Read-only mode is now enforced PER-COMPONENT via useGuideReadOnly() —
              not a blunt <fieldset disabled> that also kills navigation buttons
              (Walk Me Through, click into a question, Skip on the intro overlay).
              Each surface that writes is responsible for disabling its own record
              / type / upload / save controls; reads (navigation, audio playback)
              stay live. SharedInterviewEngine is wired; other sections (accounts,
              wills, letters, occasions, final-wishes) are TODO — they currently
              show the banner but writes hit the API and may be rejected there. */}
          {children}
        </main>
        <FloatingChat />
      </div>
    </GuideReadOnlyProvider>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardShell>{children}</DashboardShell>
    </AuthProvider>
  );
}
