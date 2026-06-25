'use client';

import { useEffect, useState } from 'react';
import { Bell, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import {
  getNotificationSettings,
  updateNotificationSettings,
  type NotificationSettings as NS,
} from '@/lib/api';

const ITEMS: { key: keyof NS; label: string; desc: string }[] = [
  { key: 'check_in_reminders', label: 'Check-in reminders', desc: 'Get reminded before your check-in is due.' },
  { key: 'family_activity', label: 'Family activity', desc: 'Notified when a family member accepts an invite.' },
  { key: 'product_updates', label: 'Product updates', desc: 'New features and platform news.' },
];

export default function NotificationSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<NS | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<keyof NS | null>(null);

  useEffect(() => {
    getNotificationSettings()
      .then(setSettings)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const toggle = async (key: keyof NS) => {
    if (!settings || savingKey || !user?.guid) return;
    const previous = settings;
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next); // optimistic
    setSavingKey(key);
    setError(null);
    try {
      const saved = await updateNotificationSettings(user.guid, { [key]: next[key] });
      setSettings(saved);
    } catch (e: any) {
      setSettings(previous); // revert on failure
      setError('Couldn’t save that change. Please try again.');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm p-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gold/10 rounded-xl flex items-center justify-center">
          <Bell className="w-5 h-5 text-gold" />
        </div>
        <h2 className="font-bold text-navy text-lg">Notifications</h2>
        {savingKey && <Loader2 className="w-4 h-4 animate-spin text-zinc-300" />}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading || !settings ? (
        <div className="flex items-center gap-2 py-6 text-zinc-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading your preferences…
        </div>
      ) : (
        <div className="space-y-4">
          {ITEMS.map((item) => {
            const on = settings[item.key];
            return (
              <div key={item.key} className="flex items-center justify-between py-3 border-b border-zinc-50 last:border-b-0">
                <div>
                  <p className="text-sm font-medium text-navy">{item.label}</p>
                  <p className="text-xs text-zinc-400">{item.desc}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={item.label}
                  disabled={!!savingKey}
                  onClick={() => toggle(item.key)}
                  className={`w-10 h-6 rounded-full flex items-center px-0.5 transition-colors disabled:opacity-60 ${on ? 'bg-[#4A5E52]' : 'bg-zinc-200'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${on ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
