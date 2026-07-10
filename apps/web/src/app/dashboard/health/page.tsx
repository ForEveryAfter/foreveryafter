'use client';

// Was a server component (async default export). Converted to a client
// component so we can hook the first-visit intro-video overlay via the same
// flag pattern used on /wills, /letters, /occasions, /final-wishes. No
// server-side data was being fetched here (just a hardcoded userId), so the
// conversion is a no-op for behavior outside the new overlay.

import React, { useState, useEffect } from 'react';
import { Play } from 'lucide-react';
export const dynamic = 'force-dynamic';
import SharedInterviewEngine from '@/components/dashboard/SharedInterviewEngine';
import IntroVideoOverlay from '@/components/dashboard/IntroVideoOverlay';
import { fetchWithAuth } from '@/lib/api';

// First-play intro video for this section. Lives under
// apps/web/public/parent/healthandmedical/ — same `parent/<section>/` nesting
// as the other section videos. Keep this constant in sync if the asset is
// renamed. The flag tracks per-user dismissal via /interview/flags.
const HEALTH_INTRO_VIDEO =
  '/parent/healthandmedical/Legacy Bridge_ Health and Medical Story_1080p_caption.mp4';
const HEALTH_INTRO_FLAG = 'health_legacy_intro_dismissed';

export default function HealthLegacyPage() {
  const userId = '74656c6c-6d65-4123-8123-123456789012';
  const [showIntro, setShowIntro] = useState(false);

  // Check the per-section dismissal flag on mount. If never dismissed, show
  // the overlay. A failed read leaves the overlay hidden (better to skip the
  // video than to replay it after a previous dismissal).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const flags = await fetchWithAuth('/interview/flags', userId);
        const dismissed = Array.isArray(flags) && flags.some(
          (f: any) => f.flag === HEALTH_INTRO_FLAG
        );
        if (!cancelled && !dismissed) setShowIntro(true);
      } catch (err) {
        console.error('Failed to check health intro flag:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Persist the dismissal so the video doesn't reappear on the next visit.
  // Optimistically close first; the flag write is best-effort.
  const handleDismissIntro = async () => {
    setShowIntro(false);
    try {
      await fetchWithAuth('/interview/flags', userId, {
        method: 'POST',
        body: JSON.stringify({ flag: HEALTH_INTRO_FLAG }),
      });
    } catch (err) {
      console.error('Failed to save health intro flag:', err);
    }
  };

  return (
    <>
      {/* First-visit intro video — overlays the interview engine until the
          user dismisses it. The dismissal is persisted via /interview/flags
          so it never replays for the same user. */}
      {showIntro && (
        <IntroVideoOverlay
          videoUrl={HEALTH_INTRO_VIDEO}
          onDismiss={handleDismissIntro}
        />
      )}
      {/* Replay affordance — re-opens the intro overlay without touching the
          dismissal flag. Floats top-right of the engine so it doesn't disrupt
          the engine's own title/subtitle layout (which we can't edit from
          here without changing the shared component). Position is fixed to
          the viewport so it stays reachable while scrolling. */}
      <button
        type="button"
        onClick={() => setShowIntro(true)}
        className="fixed top-24 right-6 z-30 shrink-0 inline-flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-navy border border-zinc-200 hover:border-zinc-300 bg-white px-3 py-1.5 rounded-full transition-colors shadow-sm"
      >
        <Play className="w-3 h-3 fill-current" />
        Watch intro
      </button>
      <SharedInterviewEngine
        userId={userId}
        section="health_legacy"
        title="Family Health Legacy"
        subtitle="The health history your family carries forward"
        icon="🧬"
        audioPromptFolder="health"
        completionMessage="Thank you. This is one of the most important gifts you can leave your family."
      />
    </>
  );
}
