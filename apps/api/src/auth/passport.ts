/// <reference path="../types/passport-microsoft.d.ts" />
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as MicrosoftStrategy } from 'passport-microsoft';
import { supabase } from '../shared/supabase';

// The OAuth profile is stored in the session, augmented on login with the user's
// profile identity resolved by email:
//   userId — the INTERNAL profiles.user_id (server-side only, never sent to the client)
//   guid   — the PUBLIC handle the frontend uses and the API matches for ownership
// Both are null when the email has no profile yet (user not provisioned).
export interface SessionUser {
  provider: 'google' | 'microsoft';
  providerId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  userId?: string | null;
  guid?: string | null;
  role?: 'parent' | 'child' | null;
  onboardingComplete?: boolean;
  isTrial?: boolean;
  inviteFlowStatus?: 'pending' | 'completed' | null;
}

type ResolvedIdentity = Pick<SessionUser, 'userId' | 'guid' | 'role' | 'onboardingComplete' | 'isTrial' | 'inviteFlowStatus'>;
const EMPTY_IDENTITY: ResolvedIdentity = { userId: null, guid: null, role: null, onboardingComplete: false, isTrial: false, inviteFlowStatus: null };

// Resolve the user's profile from the OAuth email; provision one on first login
// (signup defaults to the 'parent' flow). Carries the internal user_id + public
// guid + whether they've finished onboarding into the session.
async function resolveOrCreateProfile(email: string, displayName?: string): Promise<ResolvedIdentity> {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, guid, role, onboarding_completed_at, is_trial, invite_flow_status')
    .eq('email', email)
    .maybeSingle();
  if (error) console.error('[Auth] profile lookup failed:', error.message);

  if (data) {
    return {
      userId: data.user_id,
      guid: data.guid,
      role: (data.role as any) ?? null,
      onboardingComplete: !!data.onboarding_completed_at,
      isTrial: !!data.is_trial,
      inviteFlowStatus: (data.invite_flow_status as any) ?? null,
    };
  }

  // First login → provision a profile (user_id + guid self-generate via defaults).
  const parts = (displayName || '').trim().split(/\s+/).filter(Boolean);
  const { data: created, error: insErr } = await supabase
    .from('profiles')
    .insert({
      email,
      first_name: parts[0] || null,
      last_name: parts.length > 1 ? parts.slice(1).join(' ') : null,
      role: 'parent',
    })
    .select('user_id, guid, role, onboarding_completed_at, invite_flow_status')
    .single();
  if (insErr) {
    console.error('[Auth] profile provisioning failed:', insErr.message);
    return EMPTY_IDENTITY;
  }
  return {
    userId: created.user_id,
    guid: created.guid,
    role: (created.role as any) ?? null,
    onboardingComplete: !!created.onboarding_completed_at,
    isTrial: false,
    inviteFlowStatus: (created.invite_flow_status as any) ?? null,
  };
}

export function setupPassport() {
  const apiBase = process.env.API_PUBLIC_URL || 'http://localhost:3001';

  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || 'dummy',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'dummy',
    callbackURL: `${apiBase}/auth/google/callback`,
    scope: ['profile', 'email'],
  }, async (_accessToken, _refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) return done(new Error('No email found in Google profile'));
      const identity = await resolveOrCreateProfile(email, profile.displayName);
      const user: SessionUser = {
        provider: 'google',
        providerId: profile.id,
        email,
        name: profile.displayName,
        avatarUrl: profile.photos?.[0]?.value,
        ...identity,
      };
      return done(null, user);
    } catch (err) {
      return done(err as any);
    }
  }));

  passport.use(new MicrosoftStrategy({
    clientID: process.env.MICROSOFT_CLIENT_ID || 'dummy',
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || 'dummy',
    callbackURL: `${apiBase}/auth/microsoft/callback`,
    scope: ['user.read'],
    tenant: 'common', // allow personal (hotmail/outlook) + work accounts
  }, async (_accessToken: string, _refreshToken: string, profile: any, done: any) => {
    try {
      const email = profile.emails?.[0]?.value || profile._json?.mail || profile._json?.userPrincipalName;
      if (!email) return done(new Error('No email found in Microsoft profile'));
      const identity = await resolveOrCreateProfile(email, profile.displayName);
      const user: SessionUser = {
        provider: 'microsoft',
        providerId: profile.id,
        email,
        name: profile.displayName,
        ...identity,
      };
      return done(null, user);
    } catch (err) {
      return done(err as any);
    }
  }));

  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((user: Express.User, done) => done(null, user));
}
