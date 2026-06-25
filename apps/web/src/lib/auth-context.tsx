'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Mirrors the public SessionUser returned by /auth/me (apps/api/src/auth).
// Note: the internal profiles.user_id is intentionally never sent to the client;
// the frontend identifies the user only by `guid`.
export interface SessionUser {
  provider: 'google' | 'microsoft';
  providerId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  guid?: string | null;
  role?: 'parent' | 'child' | null;
  onboardingComplete?: boolean;
  isTrial?: boolean;
  inviteFlowStatus?: 'pending' | 'completed' | null;
  // Calculated server-side: an active, unexpired subscription. false = free/lapsed/
  // past-due → the user's own guide is read-only (payments stay transactable).
  subscriptionActive?: boolean;
}

interface AuthContextValue {
  user: SessionUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/me`, { credentials: 'include' });
      setUser(res.ok ? (await res.json()).user : null);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
    } finally {
      setUser(null);
      // Land on the marketing site, not /login — signed-out users should see
      // the public homepage and choose to sign in again from there.
      window.location.href = '/';
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

/** Initials for the avatar, derived from name (falling back to email). */
export function userInitials(user: SessionUser | null): string {
  if (!user) return '';
  const source = user.name?.trim() || user.email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}
