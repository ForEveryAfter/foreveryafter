'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, Check, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { getGuideSettings, checkInNow } from '@/lib/api';

// Friendly "time until" label for the next check-in date.
function untilLabel(iso: string | null): string {
  if (!iso) return 'not scheduled';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'due now';
  const days = Math.ceil(ms / 86_400_000);
  if (days >= 60) return `in ${Math.round(days / 30)} months`;
  if (days >= 14) return `in ${Math.round(days / 7)} weeks`;
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

export default function CheckInPill() {
  const { user } = useAuth();
  const [nextDueAt, setNextDueAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [justChecked, setJustChecked] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    getGuideSettings()
      .then((g) => setNextDueAt(g.nextDueAt))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const onCheckIn = async () => {
    if (!user?.guid || saving) return;
    setSaving(true);
    try {
      const r = await checkInNow(user.guid);
      setNextDueAt(r.nextDueAt);
      setJustChecked(true);
      setTimeout(() => setJustChecked(false), 2500);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  if (loading || error) return null;

  return (
    <button
      type="button"
      onClick={onCheckIn}
      disabled={saving}
      title="Check in now to reset your next check-in"
      className="bg-white border border-zinc-100 rounded-full px-4 py-2 text-xs font-bold text-zinc-500 shadow-sm flex items-center gap-2 hover:border-gold/40 hover:text-navy transition-all disabled:opacity-60"
    >
      {saving ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-gold" />
      ) : justChecked ? (
        <Check className="w-3.5 h-3.5 text-[#4A5E52]" />
      ) : (
        <ShieldCheck className="w-3.5 h-3.5 text-gold" />
      )}
      {justChecked ? 'Checked in ✓' : (
        <>
          <span className="text-navy">Check in now</span>
          <span className="text-zinc-300">·</span>
          <span className="font-medium text-zinc-400">next {untilLabel(nextDueAt)}</span>
        </>
      )}
    </button>
  );
}
