'use client';

import { useEffect, useState } from 'react';
import { Shield, Lock, ChevronDown, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import {
  getGuideSettings,
  getFamilyMembers,
  updateGuideSettings,
  type GuideSettings,
  type FamilyMember,
} from '@/lib/api';

const relLabel = (m: FamilyMember) =>
  m.relationship ? `${m.display_name} (${m.relationship[0].toUpperCase()}${m.relationship.slice(1)})` : m.display_name;

const formatDue = (iso: string | null) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

export default function TrustedIndividualsSettings() {
  const { user } = useAuth();
  const [guide, setGuide] = useState<GuideSettings | null>(null);
  const [family, setFamily] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getGuideSettings(), getFamilyMembers()])
      .then(([g, f]) => {
        setGuide(g);
        setFamily(f);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const patch = async (changes: Parameters<typeof updateGuideSettings>[1]) => {
    if (!user?.guid || !guide || saving) return;
    const previous = guide;
    setGuide({ ...guide, ...(changes as Partial<GuideSettings>) }); // optimistic
    setSaving(true);
    setError(null);
    try {
      setGuide(await updateGuideSettings(user.guid, changes));
    } catch {
      setGuide(previous);
      setError('Couldn’t save that change. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const selectClass =
    'w-full bg-zinc-50 border-none rounded-xl p-4 appearance-none text-sm font-medium disabled:opacity-60';

  return (
    <div id="access" className="bg-white rounded-3xl border border-zinc-100 shadow-sm p-8 space-y-6 scroll-mt-24">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center">
          <Shield className="w-5 h-5 text-teal-600" />
        </div>
        <h2 className="font-bold text-navy text-lg">Trusted Individuals</h2>
        {saving && <Loader2 className="w-4 h-4 animate-spin text-zinc-300" />}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading || !guide ? (
        <div className="flex items-center gap-2 py-6 text-zinc-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading your guide settings…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Primary Trusted Individual</label>
              <div className="relative">
                <select
                  value={guide.primaryTiMemberId ?? ''}
                  disabled={saving}
                  onChange={(e) => patch({ primaryTiMemberId: e.target.value || null })}
                  className={selectClass}
                >
                  <option value="">Not set</option>
                  {family.map((m) => (
                    <option key={m.id} value={m.id}>{relLabel(m)}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-300 pointer-events-none" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Secondary Trusted Individual</label>
              <div className="relative">
                <select
                  value={guide.secondaryTiMemberId ?? ''}
                  disabled={saving}
                  onChange={(e) => patch({ secondaryTiMemberId: e.target.value || null })}
                  className={selectClass}
                >
                  <option value="">Not set</option>
                  {family.map((m) => (
                    <option key={m.id} value={m.id}>{relLabel(m)}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-300 pointer-events-none" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Check-in Cadence</label>
              <div className="relative">
                <select
                  value={guide.intervalMonths}
                  disabled={saving}
                  onChange={(e) => patch({ intervalMonths: Number(e.target.value) as GuideSettings['intervalMonths'] })}
                  className={selectClass}
                >
                  <option value={3}>Every 3 months</option>
                  <option value={6}>Every 6 months</option>
                  <option value={12}>Every 12 months</option>
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-300 pointer-events-none" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Guide Lock Mode</label>
              <div className="relative">
                <select
                  value={guide.lockMode}
                  disabled={saving}
                  onChange={(e) => patch({ lockMode: e.target.value as GuideSettings['lockMode'] })}
                  className={selectClass}
                >
                  <option value="checkin">Locked until missed check-in</option>
                  <option value="manual">Manual release</option>
                  <option value="open">Open now</option>
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-300 pointer-events-none" />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-50">
            <div className="flex items-center gap-3">
              <Lock className="w-4 h-4 text-teal-600" />
              <p className="text-sm text-zinc-500">
                Guide status:{' '}
                <span className="font-bold text-navy">{guide.isLocked ? 'Locked — Protected' : 'Unlocked'}</span>
              </p>
            </div>
            <p className="text-xs text-zinc-400 mt-2 italic">Next check-in due: {formatDue(guide.nextDueAt)}</p>
          </div>
        </>
      )}
    </div>
  );
}
