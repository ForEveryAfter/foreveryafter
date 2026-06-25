'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from '@/lib/auth-context';

function InviteGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace('/login');
    } else if (user?.inviteFlowStatus === 'completed') {
      router.replace('/dashboard/child/overview');
    } else if (user?.inviteFlowStatus !== 'pending') {
      router.replace('/dashboard');
    }
  }, [isLoading, isAuthenticated, user?.inviteFlowStatus, router]);

  if (isLoading || !isAuthenticated || user?.inviteFlowStatus !== 'pending') {
    return (
      <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }
  return <>{children}</>;
}

export default function InviteFlowLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <InviteGate>{children}</InviteGate>
    </AuthProvider>
  );
}
