'use client';

import { useEffect, useState } from 'react';
import { User, Loader2, Check } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { getAccountSettings, updateAccountSettings, type AccountSettings as AS } from '@/lib/api';

export default function AccountSettings() {
  const { user } = useAuth();
  const [account, setAccount] = useState<AS | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAccountSettings()
      .then((a) => {
        setAccount(a);
        setName([a.firstName, a.lastName].filter(Boolean).join(' '));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const dirty = account != null && name.trim() !== [account.firstName, account.lastName].filter(Boolean).join(' ');

  const save = async () => {
    if (!user?.guid || !dirty || saving) return;
    const parts = name.trim().split(/\s+/);
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ');
    setSaving(true);
    setError(null);
    try {
      const updated = await updateAccountSettings(user.guid, { firstName, lastName });
      setAccount(updated);
      setName([updated.firstName, updated.lastName].filter(Boolean).join(' '));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError('Couldn’t save your name. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm p-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-zinc-50 rounded-xl flex items-center justify-center">
          <User className="w-5 h-5 text-zinc-400" />
        </div>
        <h2 className="font-bold text-navy text-lg">Account</h2>
        {saving && <Loader2 className="w-4 h-4 animate-spin text-zinc-300" />}
        {saved && !saving && <Check className="w-4 h-4 text-[#4A5E52]" />}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-zinc-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading your account…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={save}
                className="w-full bg-zinc-50 border-none rounded-xl p-4 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Email</label>
              <input
                type="email"
                value={account?.email ?? ''}
                className="w-full bg-zinc-50 border-none rounded-xl p-4 text-sm text-zinc-400"
                readOnly
              />
            </div>
          </div>
          {dirty && (
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="text-sm font-medium text-[#4A5E52] hover:underline disabled:opacity-60"
            >
              Save name
            </button>
          )}
        </>
      )}
    </div>
  );
}
