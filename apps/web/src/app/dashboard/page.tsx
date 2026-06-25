'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, Lock, Sparkles } from 'lucide-react';
import IntroVideoOverlay from '@/components/dashboard/IntroVideoOverlay';
import CheckInPill from '@/components/dashboard/CheckInPill';
import { useAuth } from '@/lib/auth-context';
import { fetchWithAuth, getProgress, type TileStatus } from '@/lib/api';

// `tileType` is the canonical server-side key from
// apps/api/src/shared/section-auth.ts:VALID_TILES (snake_case) — the value
// markTileStarted writes to tiles.tile_type. The visible tile.id stays as the
// older hyphenated value because it's the URL/keyword the rest of the page uses;
// we just keep the mapping explicit so server and client agree on identity.
const TILES = [
  { id: 'life-story', tileType: 'life_story',   title: 'My Life Story',         desc: 'Your words, your voice, your chapters.' },
  { id: 'accounts',   tileType: 'accounts',     title: 'Accounts & Locations',  desc: 'Where to find everything that matters.' },
  { id: 'health',     tileType: 'health',       title: 'Health & Medical',      desc: 'What your family needs in an emergency.' },
  { id: 'wills',      tileType: 'wills',        title: 'Wills & Trusts',        desc: 'Guidance and a place to keep what you\'ve prepared.' },
  { id: 'wishes',     tileType: 'final_wishes', title: 'Final Wishes',          desc: 'Your service, your way.' },
  { id: 'letters',    tileType: 'letters',      title: 'Letters to Loved Ones', desc: 'The things you most want them to know.' },
  { id: 'occasions',  tileType: 'occasions',    title: 'Special Occasions',     desc: 'Your voice at the moments you\'d most want to be there.', span: true },
] as const;

// Pill copy for each per-tile state. 'not_started' (or missing row) gets the
// default "Ready to start" prompt, which is the call-to-action — not a claim
// of progress.
function statusPill(status: TileStatus | null): { label: string; cls: string } {
  switch (status) {
    case 'complete':    return { label: 'Complete',    cls: 'text-primary bg-primary/10' };
    case 'in_progress': return { label: 'In progress', cls: 'text-gold bg-gold/10' };
    default:            return { label: 'Ready to start', cls: 'text-[#4A5E52] bg-[#4A5E52]/5' };
  }
}

export default function DashboardPage() {
  // This page is "My Guide" — the SESSION USER's own guide. Every linked child also
  // gets one at OAuth via ensureGuide() (apps/api/src/auth/routes.ts), and their
  // /dashboard is supposed to show THEIR data, not the parent they're linked to.
  // (The other parent's guides are reachable via /dashboard/child/overview, not here.)
  // Read-only / "free trial" mode is enforced at the layout via <fieldset disabled>
  // when user.subscriptionActive is false — applies to children who haven't paid.
  const { user } = useAuth();
  const userId = user?.userId || '';
  const firstName = user?.name?.trim().split(/\s+/)[0] || 'there';
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState(false);
  // How many of the 7 guide sections the logged-in user has started (from the DB).
  const [startedCount, setStartedCount] = useState<number | null>(null);
  // Per-tile status indexed by tile_type. Drives the bottom-right pill on each
  // tile. Filled from /settings/progress on mount; falls back to "Ready to start"
  // for any tile that doesn't have a row yet.
  const [tileStatusByType, setTileStatusByType] = useState<Record<string, TileStatus | null>>({});

  useEffect(() => {
    getProgress()
      .then((p) => {
        setStartedCount(p.startedCount);
        const map: Record<string, TileStatus | null> = {};
        for (const t of p.tiles || []) map[t.tile_type] = t.status;
        setTileStatusByType(map);
      })
      .catch(() => {});
  }, []);

  // Intro overlay shows until the user dismisses it. /interview/flags is session-
  // authed (sectionAuth repoints any client-supplied user id onto req.user.userId),
  // so the flag is stored against the real logged-in user — no per-browser demo
  // override needed.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchWithAuth('/interview/flags', userId)
      .then((flags: any) => {
        if (cancelled) return;
        const dismissed = Array.isArray(flags) && flags.some((f: any) => f.flag === 'intro_video_dismissed');
        if (!dismissed) setShowIntro(true);
      })
      .catch(() => { /* read failure — leave the overlay hidden */ });
    return () => { cancelled = true; };
  }, [userId]);

  const handleDismissIntro = async () => {
    setShowIntro(false);
    if (!userId) return;
    try {
      await fetchWithAuth('/interview/flags', userId, {
        method: 'POST',
        body: JSON.stringify({ flag: 'intro_video_dismissed' })
      });
    } catch (err) {
      console.error('Failed to save intro flag:', err);
    }
  };

  useEffect(() => {
    if (tooltip) {
      const timer = setTimeout(() => setTooltip(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [tooltip]);

  // ensureGuide() runs at OAuth callback — every signed-in user has their own
  // guide row. The dashboard always renders the "your guide" surface here; the
  // upsell-for-no-guide branch that used to live above is unreachable in the
  // current auth flow, so it was removed. Read-only enforcement (free / trial /
  // lapsed) lives in dashboard/layout.tsx via <fieldset disabled> + FreePlanBanner.
  return (
    <div className="max-w-6xl mx-auto px-6 py-10 font-inter text-navy">
      {showIntro && <IntroVideoOverlay onDismiss={handleDismissIntro} />}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
        <div>
          <h1 className="font-playfair text-3xl font-black">Welcome, {firstName}.</h1>
          <p className="text-zinc-500 mt-1">Your guide is ready to build. Start with your life story.</p>
        </div>
        <div className="flex items-center gap-3">
          <CheckInPill />
          <div className="bg-white border border-zinc-100 rounded-full px-4 py-2 text-xs font-bold text-zinc-500 shadow-sm flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-gold" />
            {startedCount ?? 0} of 7 sections started
          </div>
        </div>
      </div>

      {/* Suggested-starting-point hero — only while no section has been started.
          Gated on the RESOLVED count (not null) so the banner doesn't paint and
          then snap away once /settings/progress comes back. Pre-fetch we render
          nothing; once we know they're past it, we keep rendering nothing.
          TODO(backlog): once started, replace with a "pick up where you left off" card. */}
      {startedCount === 0 && (
        <div className="bg-gradient-to-br from-[#4A5E52] to-[#2D6A4F] rounded-[32px] p-10 md:p-14 text-white mb-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4 blur-2xl" />
          <div className="relative z-10 max-w-xl space-y-6">
            <div className="inline-block bg-white/10 px-3 py-1.5 rounded-full">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gold">Suggested Starting Point</span>
            </div>
            <h2 className="font-playfair text-3xl md:text-4xl font-black leading-tight">
              My life story — where would you like to begin?
            </h2>
            <p className="text-white/70 leading-relaxed">
              Start here. It&apos;s the most natural place. We&apos;ll guide you through gentle prompts — at your own pace.
            </p>
            <Link
              href="/dashboard/mystory"
              className="inline-flex items-center gap-2 bg-gold text-white font-bold px-8 py-4 rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-gold/30"
            >
              Start here <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        {TILES.map((tile) => {
          const isSpan = (tile as any).span;
          const status = tileStatusByType[tile.tileType] ?? null;
          const pill = statusPill(status);
          const content = (
            <div
              key={tile.id}
              className={`relative bg-white rounded-3xl border border-[#4A5E52] border-[1.5px] shadow-sm transition-all cursor-pointer group h-full hover:shadow-lg hover:-translate-y-0.5
                ${isSpan ? 'md:col-span-3' : ''}
              `}
            >
              {isSpan ? (
                <div className="p-8 flex items-center gap-5">
                  <div className="w-12 h-12 bg-gold/10 rounded-2xl flex items-center justify-center shrink-0">
                    <Sparkles className="w-6 h-6 text-gold" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-navy text-lg">{tile.title}</h3>
                    <p className="text-zinc-500 text-sm leading-relaxed">{tile.desc}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full shrink-0 ${pill.cls}`}>
                    {pill.label}
                  </span>
                </div>
              ) : (
                <div className="p-8">
                  <h3 className="font-bold text-navy text-lg mb-2">{tile.title}</h3>
                  <p className="text-zinc-500 text-sm leading-relaxed">{tile.desc}</p>
                  <div className="mt-4">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full ${pill.cls}`}>
                      {pill.label}
                    </span>
                  </div>
                </div>
              )}
              {tooltip === tile.id && (
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-navy text-white text-xs px-4 py-2 rounded-lg shadow-xl whitespace-nowrap z-20 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  Tap to start this section whenever you&apos;re ready.
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-navy rotate-45" />
                </div>
              )}
            </div>
          );

          // Every tile is now navigable — the per-tile status pill replaces
          // the older "ready/not ready" gate. Map tile.id to its route.
          const href = tile.id === 'life-story' ? '/dashboard/mystory'
                     : tile.id === 'accounts' ? '/dashboard/accounts'
                     : tile.id === 'health' ? '/dashboard/health'
                     : tile.id === 'wills' ? '/dashboard/wills'
                     : tile.id === 'wishes' ? '/dashboard/final-wishes'
                     : tile.id === 'occasions' ? '/dashboard/occasions'
                     : '/dashboard/letters';
          return (
            <Link key={tile.id} href={href} className={`block ${isSpan ? 'md:col-span-3' : ''}`}>
              {content}
            </Link>
          );
        })}
      </div>

      <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-12 h-12 bg-teal-50 rounded-2xl flex items-center justify-center">
            <Lock className="w-6 h-6 text-teal-600" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-bold text-navy">Your guide is locked</h3>
              <span className="text-[10px] font-bold uppercase tracking-widest text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">Protected</span>
            </div>
            {/* Primary-access name is set per guide once a Trusted Individual is
                designated. Until then we just surface the check-in cadence; the
                Manage access link on the right is the place to add the TI. */}
            <p className="text-sm text-zinc-500">
              Check-in every 6 months
            </p>
          </div>
        </div>
        <Link href="/dashboard/settings#access" className="border border-zinc-200 text-navy font-bold text-sm px-6 py-3 rounded-xl hover:bg-zinc-50 transition-colors whitespace-nowrap">
          Manage access
        </Link>
      </div>
    </div>
  );
}
