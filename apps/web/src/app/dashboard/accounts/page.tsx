'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  Plus,
  MoreVertical,
  Trash2,
  Edit2,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Play,
} from 'lucide-react';
import {
  AccountsAudioPrompt,
  EntryForm,
  CATEGORY_ICONS,
  CATEGORY_LABELS
} from '@/components/dashboard/AccountsUIComponents';
import IntroVideoOverlay from '@/components/dashboard/IntroVideoOverlay';
import { fetchWithAuth } from '@/lib/api';

// First-play intro video for this section. Lives under
// apps/web/public/parent/accountsandlocation/ — directory name on disk uses
// the singular ("location"); keep this constant in sync if the asset is renamed.
// Mirrors the patterns in /wills, /letters, /occasions, /final-wishes, /health.
const ACCOUNTS_INTRO_VIDEO =
  '/parent/accountsandlocation/Legacy Bridge_ Accounts and Locations_1080p_caption.mp4';
const ACCOUNTS_INTRO_FLAG = 'accounts_intro_dismissed';

interface AccountEntry {
  id: string;
  category: string;
  label: string;
  is_required: boolean;
  handled_in_will: boolean;
  has_data: boolean;
  sort_order: number;
}

export default function AccountsPage() {
  const userId = '74656c6c-6d65-4123-8123-123456789012'; // Harold's hardcoded ID
  const [isVerified, setIsVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<AccountEntry[]>([]);
  const [showEntryForm, setShowEntryForm] = useState<{ category: string, entry?: AccountEntry } | null>(null);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customCategoryName, setCustomCategoryName] = useState('');
  // First-visit intro video. Per-section flag so landing on Accounts for the
  // first time surfaces this video independently of the dashboard-root one.
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
          (f: any) => f.flag === ACCOUNTS_INTRO_FLAG
        );
        if (!cancelled && !dismissed) setShowIntro(true);
      } catch (err) {
        console.error('Failed to check accounts intro flag:', err);
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
        body: JSON.stringify({ flag: ACCOUNTS_INTRO_FLAG }),
      });
    } catch (err) {
      console.error('Failed to save accounts intro flag:', err);
    }
  };

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  const fetchEntries = async () => {
    try {
      const res = await fetch(`${API_BASE}/accounts`, {
        credentials: 'include',
        headers: { 'x-user-id': userId },
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setEntries(data);
        setIsVerified(true);
      }
    } catch (err) {
      console.error('Failed to fetch entries:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, []);

  // Returns null on success (modal closes), or a human-readable error string
  // that the modal renders inline. Previously this silently console.error'd and
  // the modal would just sit open with no feedback — see Accounts modal on
  // /dashboard/accounts.
  const handleSaveEntry = async ({ label, data }: { label: string, data: string }): Promise<string | null> => {
    if (!showEntryForm) return null;
    try {
      const url = showEntryForm.entry
        ? `${API_BASE}/accounts/entry/${showEntryForm.entry.id}`
        : `${API_BASE}/accounts/entry`;

      const res = await fetch(url, {
        method: showEntryForm.entry ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: {
          'x-user-id': userId,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          category: showEntryForm.category,
          label,
          data: data || undefined
        })
      });

      if (res.ok) {
        fetchEntries();
        setShowEntryForm(null);
        return null;
      }
      const body = await res.json().catch(() => ({} as any));
      return body?.error || `Save failed (HTTP ${res.status})`;
    } catch (err: any) {
      console.error('Save error:', err);
      return err?.message || 'Could not reach the server.';
    }
  };

  const handleToggleWill = async (entry: AccountEntry) => {
    const newValue = !entry.handled_in_will;
    
    if (newValue && entry.has_data) {
      if (!confirm("This will remove your recorded entry. Your family will not see it. Continue?")) {
        return;
      }
    }

    try {
      const res = await fetch(`${API_BASE}/accounts/entry/${entry.id}/will-toggle`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 
          'x-user-id': userId,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ handled_in_will: newValue })
      });
      if (res.ok) fetchEntries();
    } catch (err) {
      console.error('Toggle error:', err);
    }
  };

  const handleDeleteEntry = async (id: string) => {
    if (!confirm("This will permanently remove this entry. Your family will not see it. This cannot be undone.")) return;
    try {
      const res = await fetch(`${API_BASE}/accounts/entry/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'x-user-id': userId }
      });
      if (res.ok) fetchEntries();
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const handleAddCustomCategory = async () => {
    if (!customCategoryName) return;
    try {
      const res = await fetch(`${API_BASE}/accounts/custom-category`, {
        method: 'POST',
        credentials: 'include',
        headers: { 
          'x-user-id': userId,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: customCategoryName })
      });
      if (res.ok) {
        fetchEntries();
        setCustomCategoryName('');
        setShowCustomModal(false);
      }
    } catch (err) {
      console.error('Custom category error:', err);
    }
  };

  if (loading) return (
    <>
      {/* Render the intro overlay even during the data-load spinner state —
          the video is independent of the entries fetch and shouldn't sit
          behind it. */}
      {showIntro && (
        <IntroVideoOverlay
          videoUrl={ACCOUNTS_INTRO_VIDEO}
          onDismiss={handleDismissIntro}
        />
      )}
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold" />
      </div>
    </>
  );

  if (isVerified === false && loading === false) {
    // This state shouldn't really be reached now as we auto-verify for parents
    // but we'll keep it as a fallback or for future TI mode
  }

  const fixedCategories = [
    'email', 'phone', 'bank', 'investment', 'property', 'vehicle', 'safe_deposit', 'insurance', 'storage'
  ];

  // How custom categories are represented in sensitive_entries (resolved here so
  // the render below is straightforward):
  //
  //   * Header row:  category='custom', label=<name>, encrypted_data IS NULL
  //                  Created by POST /accounts/custom-category. Just a marker.
  //
  //   * Entry rows:  category=<name>,   label=<entry label>, encrypted_data populated.
  //                  Saved via POST /accounts/entry — the page passes the catKey
  //                  (the literal category name) through as `category`.
  //
  // So a custom category exists in the UI if EITHER (a) there's a header row for
  // it, OR (b) there are entry rows whose category is not one of the fixed ones.
  // The union of both keeps the section visible after the header is added AND
  // after entries land — and tolerates legacy headerless data.
  const customFromHeaders = entries
    .filter((e) => e.category === 'custom' && !e.has_data)
    .map((e) => e.label);
  const customFromEntries = entries
    .filter((e) => e.category !== 'custom' && !fixedCategories.includes(e.category))
    .map((e) => e.category);
  const customCategoryHeaders = Array.from(new Set([...customFromHeaders, ...customFromEntries]));

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-12 pb-32">
      {/* First-visit intro video — overlays the page until dismissed. The
          dismissal is persisted via /interview/flags so it never replays for
          the same user. */}
      {showIntro && (
        <IntroVideoOverlay
          videoUrl={ACCOUNTS_INTRO_VIDEO}
          onDismiss={handleDismissIntro}
        />
      )}
      <header className="space-y-6">
        <Link href="/dashboard" className="flex items-center gap-2 text-sm font-bold text-zinc-400 hover:text-navy transition-colors">
          <ChevronLeft size={18} /> Back to Dashboard
        </Link>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <h1 className="font-playfair text-4xl font-black text-navy leading-tight">Accounts & Locations</h1>
            <p className="text-zinc-500">Secure access for your family when it matters most.</p>
          </div>
          {/* Right-side header chips: the existing encryption badge, plus the
              "Watch intro" replay affordance. Both wrapped in a flex container
              so they share the same row at md+ widths. */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 bg-teal-50 text-teal-600 px-4 py-2 rounded-full text-xs font-bold">
              <Lock size={14} /> RSA-2048 Encrypted
            </div>
            {/* Replay affordance — re-opens the intro overlay without touching
                the dismissal flag. */}
            <button
              type="button"
              onClick={() => setShowIntro(true)}
              className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-navy border border-zinc-200 hover:border-zinc-300 bg-white px-3 py-1.5 rounded-full transition-colors"
            >
              <Play className="w-3 h-3 fill-current" />
              Watch intro
            </button>
          </div>
        </div>
      </header>

      <AccountsAudioPrompt src="/parent/accounts/accounts-intro.wav" />

      <div className="space-y-10">
        {fixedCategories.concat(customCategoryHeaders).map((catKey) => {
          const isCustom = !fixedCategories.includes(catKey);
          const displayLabel = isCustom ? catKey : CATEGORY_LABELS[catKey];
          // Entries are matched by category-name equality for BOTH branches —
          // fixed categories store their key directly ('email', 'phone', …) and
          // custom categories store their literal user-supplied name ('Lego
          // Collection'). The page passes catKey straight through to the save
          // endpoint, so this filter is the same on both ends. We exclude the
          // headerless marker row (category='custom') because it's not an entry,
          // just the category placeholder.
          const entriesToRender = entries.filter(
            (e) => e.category === catKey && (e.has_data || !isCustom)
          );
          
          return (
            <section key={catKey} className="space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="text-gold">
                    {CATEGORY_ICONS[isCustom ? 'custom' : catKey]}
                  </div>
                  <h3 className="font-bold text-navy text-lg">{displayLabel}</h3>
                </div>
                {!isCustom && !['email', 'phone'].includes(catKey) && (
                   <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Handled in Will / Trust</span>
                        {/* We'll handle will toggle per entry or per category? Requirement says "under each category header... toggle switch" */}
                        {/* Actually, the toggle is per category if no entries, or per entry? */}
                        {/* "Handled in Will / Trust (fixed non-required categories only)" */}
                      </div>
                   </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3">
                {entriesToRender.length === 0 ? (
                  <button 
                    onClick={() => setShowEntryForm({ category: catKey })}
                    className="flex items-center justify-between p-6 bg-white rounded-3xl border border-zinc-100 border-dashed hover:border-gold/30 hover:bg-gold/5 transition-all group"
                  >
                    <span className="text-zinc-400 group-hover:text-gold transition-colors">Tap to add your first {displayLabel.toLowerCase()}...</span>
                    <Plus className="text-zinc-200 group-hover:text-gold" />
                  </button>
                ) : (
                  entriesToRender.map(entry => (
                    <div key={entry.id} className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm flex items-center justify-between group">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-navy">{entry.label}</span>
                          {entry.has_data && (
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">
                              <CheckCircle2 size={10} /> Recorded
                            </div>
                          )}
                          {entry.handled_in_will && (
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-primary bg-primary/5 px-2 py-0.5 rounded-full">
                              <Shield size={10} /> In Will
                            </div>
                          )}
                        </div>
                        {entry.has_data && <p className="text-[10px] text-zinc-300 mt-1 uppercase tracking-widest">●●●●●●●● Encrypted</p>}
                      </div>

                      <div className="flex items-center gap-4">
                        {!entry.is_required && !isCustom && (
                          <div className="flex items-center gap-2 pr-4 border-r border-zinc-50">
                            <span className="text-[9px] font-bold text-zinc-300 uppercase tracking-widest">Will/Trust</span>
                            <div 
                              onClick={() => handleToggleWill(entry)}
                              className={`w-10 h-5 rounded-full p-1 cursor-pointer transition-colors ${entry.handled_in_will ? 'bg-primary' : 'bg-zinc-200'}`}
                            >
                              <div className={`w-3 h-3 bg-white rounded-full transition-transform ${entry.handled_in_will ? 'translate-x-5' : 'translate-x-0'}`} />
                            </div>
                          </div>
                        )}
                        <button 
                          onClick={() => setShowEntryForm({ category: entry.category, entry })}
                          className="p-2 text-zinc-300 hover:text-gold transition-colors"
                        >
                          <Edit2 size={18} />
                        </button>
                        {!entry.is_required && (
                          <button 
                            onClick={() => handleDeleteEntry(entry.id)}
                            className="p-2 text-zinc-300 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
                {entriesToRender.length > 0 && (
                   <button 
                    onClick={() => setShowEntryForm({ category: catKey })}
                    className="flex items-center gap-2 text-xs font-bold text-gold hover:text-navy transition-colors mt-2 ml-2"
                   >
                     <Plus size={14} /> Add another {displayLabel.toLowerCase()}
                   </button>
                )}
              </div>
            </section>
          );
        })}

        <button 
          onClick={() => setShowCustomModal(true)}
          className="w-full py-8 border-2 border-zinc-100 border-dashed rounded-[32px] text-zinc-400 font-bold hover:border-gold/30 hover:text-gold transition-all flex flex-col items-center gap-2"
        >
          <div className="w-12 h-12 bg-zinc-50 rounded-2xl flex items-center justify-center group-hover:bg-gold/10">
            <Plus size={24} />
          </div>
          Add Custom Category
        </button>
      </div>

      {showEntryForm && (
        <EntryForm
          category={showEntryForm.category}
          label={showEntryForm.entry?.label}
          id={showEntryForm.entry?.id}
          hasData={!!showEntryForm.entry?.has_data}
          onClose={() => setShowEntryForm(null)}
          onSave={handleSaveEntry}
        />
      )}

      {showCustomModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-navy/20 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-[40px] shadow-2xl p-10 space-y-8 animate-in zoom-in-95 duration-300">
             <div className="text-center space-y-2">
                <h3 className="font-playfair text-2xl font-black text-navy">New Category</h3>
                <p className="text-sm text-zinc-500">Give your custom group a name.</p>
             </div>
             <input 
                type="text"
                autoFocus
                value={customCategoryName}
                onChange={(e) => setCustomCategoryName(e.target.value)}
                placeholder="e.g. Digital Assets"
                className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-6 py-4 font-bold text-navy outline-none focus:border-gold transition-all"
             />
             <div className="flex gap-4">
                <button onClick={() => setShowCustomModal(false)} className="flex-1 font-bold text-zinc-400">Cancel</button>
                <button 
                  onClick={handleAddCustomCategory}
                  className="flex-[2] bg-gold text-white font-black py-4 rounded-2xl shadow-lg shadow-gold/20"
                >
                  Create
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
