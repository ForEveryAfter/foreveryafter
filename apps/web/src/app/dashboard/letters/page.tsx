'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  Mic,
  Video,
  Type,
  Loader2,
  RotateCcw,
  X,
  AlertTriangle,
  Play,
} from 'lucide-react';
import {
  fetchWithAuth,
  getFamilyMembers,
  addFamilyMember,
  type FamilyMember as ApiFamilyMember,
} from '@/lib/api';
import Recorder from '@/components/dashboard/Recorder';
import IntroVideoOverlay from '@/components/dashboard/IntroVideoOverlay';

// First-play intro video for this section. The file is shipped statically under
// apps/web/public/parent/messagesforlovedones/ — directory name on disk uses
// the plural ("messages"); keep this constant in sync if the asset is renamed.
// Mirrors the willandtrust + specialoccassion patterns elsewhere in the app.
const LETTERS_INTRO_VIDEO =
  '/parent/messagesforlovedones/Legacy Bridge_ Messages for Loved Ones_1080p_caption.mp4';
const LETTERS_INTRO_FLAG = 'letters_intro_dismissed';

// Letters can be addressed to ANYONE the parent considers a loved one — this
// includes immediate family. Contrast with the Final Wishes notify list, which
// excludes immediate family because they'll receive the released files anyway.
// "Immediate family is immediate family" per the spec — they're letter
// recipients by default and the picker doesn't filter them out.
const LETTERS_IMMEDIATE_REL = new Set(['spouse', 'partner', 'son', 'daughter', 'child', 'mother', 'father', 'parent']);
const LETTERS_SIBLING_REL = new Set(['brother', 'sister', 'sibling']);

function splitDisplayName(s: string): { first: string; last: string } {
  const parts = (s || '').trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

// Bridge from the API shape (display_name / phone) to this page's local shape
// (first_name / last_name / mobile). member_guid is just the family_members.id
// — the letters table's recipient_guid is keyed off that.
function toLocalMember(m: ApiFamilyMember, sortOrder: number): FamilyMember {
  const { first, last } = splitDisplayName(m.display_name);
  return {
    id: m.id,
    member_guid: m.id,
    first_name: first,
    last_name: last || null,
    relationship: (m.relationship || 'other').toLowerCase(),
    email: m.email,
    mobile: m.phone,
    sort_order: sortOrder,
  };
}

const USER_ID = '74656c6c-6d65-4123-8123-123456789012';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const MAX_RECORDING_SECONDS = 5 * 60; // 5 minutes

// ─── Types ────────────────────────────────────────────────────────────────────
interface FamilyMember {
  id: string;
  member_guid: string;
  first_name: string;
  last_name: string | null;
  relationship: string;
  email: string | null;
  mobile: string | null;
  sort_order: number;
}

interface Letter {
  recipient_guid: string;
  format: 'typed' | 'audio' | 'video' | null;
  content_text: string | null;
  audio_path: string | null;
  video_path: string | null;
  status: 'not_started' | 'in_progress' | 'complete';
  updated_at: string;
}

interface RecipientsData {
  immediate: FamilyMember[];
  siblings: FamilyMember[];
  show_trusted_friend_slot: boolean;
  additional: FamilyMember[];
}

type Format = 'typed' | 'audio' | 'video';

const ADDITIONAL_SLOTS = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fullName(m: FamilyMember) {
  return [m.first_name, m.last_name].filter(Boolean).join(' ');
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function wordCountHint(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return '';
  const mins = Math.max(1, Math.round(words / 200));
  return `~${mins} min read`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Status Pill ──────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: Letter['status'] }) {
  const map = {
    not_started: { label: 'Not started', cls: 'bg-zinc-100 text-zinc-400' },
    in_progress:  { label: 'In progress',  cls: 'bg-gold/10 text-gold' },
    complete:     { label: 'Complete',     cls: 'bg-primary/10 text-primary' },
  };
  const { label, cls } = map[status];
  return (
    <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full whitespace-nowrap ${cls}`}>
      {label}
    </span>
  );
}

// ─── Countdown Timer ─────────────────────────────────────────────────────────
function useCountdown(active: boolean, maxSeconds: number, onExpire: () => void) {
  const [remaining, setRemaining] = useState(maxSeconds);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (active) {
      setRemaining(maxSeconds);
      intervalRef.current = setInterval(() => {
        setRemaining(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            onExpire();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setRemaining(maxSeconds);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [active, maxSeconds]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

// ─── Add Person Modal ─────────────────────────────────────────────────────────
// Two affordances stacked:
//   1. Pick from existing family & friends (any relationship — including
//      immediate family, per the user spec).
//   2. Or add someone brand-new (creates a family_members row with
//      relationship='friend' by default).
function AddPersonModal({
  pickable,
  onClose,
  onPick,
  onSave,
}: {
  pickable: FamilyMember[];
  onClose: () => void;
  onPick: (member: FamilyMember) => void;
  onSave: (member: FamilyMember) => void | Promise<void>;
}) {
  const [form, setForm] = useState({ first_name: '', last_name: '', relationship: 'friend', email: '', mobile: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const RELATIONSHIPS = ['friend', 'sibling', 'colleague', 'neighbor', 'attorney', 'advisor', 'other'];

  async function handleSave() {
    if (!form.first_name || !form.relationship) return;
    setSaving(true);
    setError(null);
    try {
      const display_name = [form.first_name, form.last_name].filter(Boolean).join(' ').trim();
      const created = await addFamilyMember({
        display_name,
        email: form.email || null,
        phone: form.mobile || null,
        relationship: form.relationship,
      });
      // Hand back a row in the page's local FamilyMember shape (id/member_guid,
      // split name, mobile/sort_order). Caller (handlePersonAdded) refetches
      // the master roster so this row also lands in allFamily naturally.
      await onSave(toLocalMember(created, 999));
    } catch (err: any) {
      setError(err?.message || 'Failed to add person. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-navy/20 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-[40px] shadow-2xl border border-zinc-100 overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-500">
        <div className="px-10 py-7 bg-zinc-50 border-b border-zinc-100 flex items-center justify-between">
          <h3 className="font-bold text-navy">Add a person</h3>
          <button onClick={onClose} className="text-zinc-300 hover:text-navy transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-10 space-y-6">
          {/* Picker — eligible existing family & friends. Includes immediate
              family per spec ("immediate family is immediate family" — they
              can be picked as letter recipients just like anyone else). */}
          {pickable.length > 0 && (
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                Pick from your family &amp; friends
              </label>
              <select
                value=""
                onChange={(e) => {
                  const m = pickable.find((x) => x.member_guid === e.target.value);
                  if (m) onPick(m);
                }}
                className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-xl px-4 py-3 text-navy outline-none focus:border-gold text-sm transition-all"
              >
                <option value="">Select someone…</option>
                {pickable.map((m) => (
                  <option key={m.member_guid} value={m.member_guid}>
                    {fullName(m)}
                    {m.relationship ? ` · ${capitalize(m.relationship)}` : ''}
                    {m.email ? ` · ${m.email}` : m.mobile ? ` · ${m.mobile}` : ''}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-zinc-400 italic">
                Don&apos;t see them? Add someone new below.
              </p>
            </div>
          )}

          {/* Visual separator between the two affordances */}
          {pickable.length > 0 && (
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-zinc-100" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-300">Or add someone new</span>
              <div className="flex-1 h-px bg-zinc-100" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">First Name *</label>
              <input
                type="text"
                value={form.first_name}
                onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-xl px-4 py-3 text-navy outline-none focus:border-gold text-sm transition-all"
                placeholder="e.g. James"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Last Name</label>
              <input
                type="text"
                value={form.last_name}
                onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-xl px-4 py-3 text-navy outline-none focus:border-gold text-sm transition-all"
                placeholder="e.g. Peterson"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Relationship *</label>
            <select
              value={form.relationship}
              onChange={e => setForm(f => ({ ...f, relationship: e.target.value }))}
              className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-xl px-4 py-3 text-navy outline-none focus:border-gold text-sm transition-all appearance-none"
            >
              {RELATIONSHIPS.map(r => <option key={r} value={r}>{capitalize(r)}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-xl px-4 py-3 text-navy outline-none focus:border-gold text-sm transition-all"
              placeholder="email@example.com"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <div className="flex gap-4 pt-2">
            <button onClick={onClose} className="flex-1 py-4 font-bold text-zinc-400 hover:text-navy transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.first_name}
              className="flex-[2] bg-navy text-white font-black py-4 rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-navy/20 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : null}
              {saving ? 'Adding…' : 'Add person'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Expanded Letter Editor ───────────────────────────────────────────────────
function LetterEditor({
  member,
  letter,
  onSaved,
  onClose,
}: {
  member: FamilyMember;
  letter: Letter | null;
  onSaved: (updated: Letter) => void;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<Format>(letter?.format || 'typed');
  const [text, setText] = useState(letter?.content_text || '');
  const [saving, setSaving] = useState(false);
  const [recordingActive, setRecordingActive] = useState(false);

  const countdown = useCountdown(recordingActive, MAX_RECORDING_SECONDS, () => {
    // auto-stop signal: Recorder reads this via a ref — handled via onSave callback below
  });

  async function saveTyped() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const data = await fetchWithAuth(`/letters/${member.member_guid}`, USER_ID, {
        method: 'POST',
        body: JSON.stringify({ format: 'typed', content_text: text, status: 'complete' }),
      });
      onSaved(data);
    } catch (err) {
      alert('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function saveAudio(blob: Blob) {
    setSaving(true);
    setRecordingActive(false);
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'letter.wav');
      const data = await fetchWithAuth(`/letters/${member.member_guid}/audio`, USER_ID, {
        method: 'POST',
        body: formData,
      });
      onSaved(data);
    } catch (err) {
      alert('Failed to save audio. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function saveVideo(blob: Blob) {
    setSaving(true);
    setRecordingActive(false);
    try {
      const formData = new FormData();
      formData.append('video', blob, 'letter.mp4');
      const data = await fetchWithAuth(`/letters/${member.member_guid}/video`, USER_ID, {
        method: 'POST',
        body: formData,
      });
      onSaved(data);
    } catch (err) {
      alert('Failed to save video. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const isComplete = letter?.status === 'complete';

  return (
    <div className="border-t border-zinc-100 mt-4 pt-5 space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-playfair text-xl font-black text-navy">{fullName(member)}</h3>
          <p className="text-xs text-zinc-400 capitalize">{member.relationship}</p>
        </div>
        {isComplete && letter?.updated_at && (
          <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
            Last updated {formatDate(letter.updated_at)}
          </p>
        )}
      </div>

      {/* Format Pills */}
      <div className="flex gap-1 p-1 bg-zinc-100 rounded-xl w-fit">
        {(['typed', 'audio', 'video'] as Format[]).map(f => (
          <button
            key={f}
            onClick={() => setFormat(f)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              format === f ? 'bg-white text-navy shadow-sm' : 'text-zinc-400 hover:text-navy'
            }`}
          >
            {f === 'typed' ? <Type size={12} /> : f === 'audio' ? <Mic size={12} /> : <Video size={12} />}
            {capitalize(f)}
          </button>
        ))}
      </div>

      {/* ── TYPED ── */}
      {format === 'typed' && (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={`Write your letter to ${member.first_name}…`}
            rows={10}
            className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-5 py-4 text-navy outline-none focus:border-gold transition-all resize-none text-sm leading-relaxed"
          />
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] text-zinc-400">
              {text.trim() ? wordCountHint(text) : 'Write as little or as much as you like'}
            </span>
            <span className="text-[10px] text-zinc-400 font-bold">
              {text.trim().split(/\s+/).filter(Boolean).length} words
            </span>
          </div>
          <button
            onClick={saveTyped}
            disabled={saving || !text.trim()}
            className="w-full bg-navy text-white font-black py-4 rounded-xl hover:scale-[1.01] active:scale-[0.99] transition-all shadow-lg shadow-navy/20 disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : null}
            {saving ? 'Saving…' : isComplete ? 'Overwrite & Save' : 'Save Letter'}
          </button>
        </div>
      )}

      {/* ── AUDIO ── */}
      {format === 'audio' && (
        <div className="space-y-4">
          {recordingActive && (
            <div className="flex items-center gap-2 justify-center py-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="font-mono text-sm font-bold text-navy">{countdown} remaining</span>
            </div>
          )}
          <Recorder
            type="audio"
            onSave={saveAudio}
            onRecordingStart={() => setRecordingActive(true)}
            onRecordingStop={() => setRecordingActive(false)}
          />
          {saving && (
            <div className="flex items-center justify-center gap-2 text-sm text-zinc-400">
              <Loader2 size={16} className="animate-spin" /> Saving audio…
            </div>
          )}
        </div>
      )}

      {/* ── VIDEO ── */}
      {format === 'video' && (
        <div className="space-y-4">
          {recordingActive && (
            <div className="flex items-center gap-2 justify-center py-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="font-mono text-sm font-bold text-navy">{countdown} remaining</span>
            </div>
          )}
          <Recorder
            type="video"
            onSave={saveVideo}
            onRecordingStart={() => setRecordingActive(true)}
            onRecordingStop={() => setRecordingActive(false)}
          />
          {saving && (
            <div className="flex items-center justify-center gap-2 text-sm text-zinc-400">
              <Loader2 size={16} className="animate-spin" /> Saving video…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Recipient Row ─────────────────────────────────────────────────────────────
function RecipientRow({
  member,
  letter,
  isOpen,
  onToggle,
  onSaved,
}: {
  member: FamilyMember;
  letter: Letter | null;
  isOpen: boolean;
  onToggle: () => void;
  onSaved: (updated: Letter) => void;
}) {
  const status = letter?.status || 'not_started';

  return (
    <div className={`bg-white rounded-2xl border transition-all duration-200 overflow-hidden ${
      isOpen ? 'border-primary/20 shadow-lg shadow-primary/5' : 'border-zinc-100 hover:border-zinc-200'
    }`}>
      {/* Row Header — always visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-5 text-left group"
      >
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-colors ${
            status === 'complete' ? 'bg-primary text-white' : 'bg-zinc-100 text-zinc-400 group-hover:bg-primary/10 group-hover:text-primary'
          }`}>
            {status === 'complete' ? <CheckCircle2 size={20} /> : (
              <span>{member.first_name.charAt(0)}{(member.last_name || '').charAt(0)}</span>
            )}
          </div>
          <div>
            <p className="font-bold text-navy">{fullName(member)}</p>
            <p className="text-xs text-zinc-400 capitalize">{member.relationship}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill status={status} />
          <ChevronRight size={16} className={`text-zinc-300 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
        </div>
      </button>

      {/* Expanded editor */}
      {isOpen && (
        <div className="px-5 pb-6">
          <LetterEditor
            member={member}
            letter={letter}
            onSaved={onSaved}
            onClose={onToggle}
          />
        </div>
      )}
    </div>
  );
}

// ─── Group Section ────────────────────────────────────────────────────────────
function GroupSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 px-1">{title}</h2>
      <div className="grid gap-2">{children}</div>
    </section>
  );
}

// ─── Empty Slot ───────────────────────────────────────────────────────────────
function EmptySlot({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      onClick={onAdd}
      className="w-full flex items-center gap-4 p-5 bg-white rounded-2xl border-2 border-dashed border-zinc-200 hover:border-navy/30 hover:bg-zinc-50 transition-all group"
    >
      <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-300 group-hover:text-navy group-hover:bg-zinc-200 transition-colors">
        <Plus size={18} />
      </div>
      <span className="text-sm font-bold text-zinc-400 group-hover:text-navy transition-colors">Add a person</span>
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function LettersPage() {
  const [recipients, setRecipients] = useState<RecipientsData | null>(null);
  const [letters, setLetters] = useState<Letter[]>([]);
  const [loading, setLoading] = useState(true);
  // Surface fetch failures with a visible banner — same pattern as Occasions
  // and Family. Empty arrays now mean "no data on file"; a non-null loadError
  // means "we couldn't even reach the server."
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  // Master roster from /settings/family. The AddPersonModal's picker filters
  // this list down to people not currently shown as letter recipients.
  const [allFamily, setAllFamily] = useState<FamilyMember[]>([]);
  // First-visit intro video. Per-section flag (not the dashboard-root one) so
  // landing on Letters for the first time surfaces this video independently.
  const [showIntro, setShowIntro] = useState(false);

  // Check the per-section dismissal flag on mount. If never dismissed, show
  // the overlay. A failed read leaves the overlay hidden (better to skip the
  // video than risk replaying it after a previous dismissal).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const flags = await fetchWithAuth('/interview/flags', USER_ID);
        const dismissed = Array.isArray(flags) && flags.some(
          (f: any) => f.flag === LETTERS_INTRO_FLAG
        );
        if (!cancelled && !dismissed) setShowIntro(true);
      } catch (err) {
        console.error('Failed to check letters intro flag:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Persist the dismissal so the video doesn't reappear on the next visit.
  // Optimistically close first; the flag write is best-effort.
  const handleDismissIntro = async () => {
    setShowIntro(false);
    try {
      await fetchWithAuth('/interview/flags', USER_ID, {
        method: 'POST',
        body: JSON.stringify({ flag: LETTERS_INTRO_FLAG }),
      });
    } catch (err) {
      console.error('Failed to save letters intro flag:', err);
    }
  };

  // ── Load ──────────────────────────────────────────────────────────────────
  // Pull the real family roster from /settings/family (single source of truth)
  // and the existing letter rows in parallel. Categorize:
  //   - Immediate family (spouse, child, parent, etc.) → always shown
  //   - Sibling → shown in the Siblings & Trusted Friend group
  //   - Others (friends, neighbors, etc.) → shown in Additional only if they
  //     already have a letter row. Other friends can be added via the picker.
  const loadAll = useCallback(async () => {
    setLoadError(null);
    try {
      const [members, letterRows] = await Promise.all([
        getFamilyMembers(),
        fetchWithAuth('/letters', USER_ID).catch(() => [] as Letter[]),
      ]);
      const all = members.map((m, i) => toLocalMember(m, i));
      const lettersByRecipient = new Set((letterRows as Letter[]).map((l) => l.recipient_guid));

      const immediate = all.filter((m) => LETTERS_IMMEDIATE_REL.has(m.relationship));
      const siblings = all.filter((m) => LETTERS_SIBLING_REL.has(m.relationship));
      const additional = all.filter(
        (m) =>
          !LETTERS_IMMEDIATE_REL.has(m.relationship) &&
          !LETTERS_SIBLING_REL.has(m.relationship) &&
          lettersByRecipient.has(m.member_guid)
      );

      setAllFamily(all);
      setRecipients({
        immediate,
        siblings,
        show_trusted_friend_slot: true,
        additional,
      });
      setLetters(letterRows as Letter[]);
    } catch (err: any) {
      console.error('Failed to load letters page:', err);
      setLoadError(err?.message || 'Could not load this page right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  function getLetter(memberGuid: string): Letter | null {
    return letters.find(l => l.recipient_guid === memberGuid) || null;
  }

  function handleToggle(id: string) {
    setOpenId(prev => prev === id ? null : id);
  }

  function handleSaved(memberGuid: string, updated: Letter) {
    setLetters(prev => {
      const other = prev.filter(l => l.recipient_guid !== memberGuid);
      return [...other, updated];
    });
    // Keep row open so they see the result
  }

  // Picker flow — user picked an existing family member. Add them as a letter
  // recipient locally. If they're immediate / sibling, they'll already be in
  // their dedicated group, so we route based on relationship. Persistence (a
  // letters_to_loved_ones row) is created lazily when they actually save
  // content, not on this "pick".
  function handlePersonPicked(member: FamilyMember) {
    setRecipients((prev) => {
      if (!prev) return prev;
      const rel = member.relationship;
      const already = (arr: FamilyMember[]) => arr.some((m) => m.member_guid === member.member_guid);
      if (LETTERS_IMMEDIATE_REL.has(rel) && !already(prev.immediate)) {
        return { ...prev, immediate: [...prev.immediate, member] };
      }
      if (LETTERS_SIBLING_REL.has(rel) && !already(prev.siblings)) {
        return { ...prev, siblings: [...prev.siblings, member] };
      }
      if (!already(prev.additional)) {
        return { ...prev, additional: [...prev.additional, member] };
      }
      return prev;
    });
    setShowAddModal(false);
    setOpenId(member.member_guid);
  }

  // New-person flow — created a brand-new family_members row. Refetch the
  // roster so categorization is consistent, then open their editor.
  async function handlePersonAdded(member: FamilyMember) {
    await loadAll();
    setShowAddModal(false);
    setOpenId(member.member_guid);
  }

  // How many additional slots remain
  const additionalCount = recipients?.additional.length || 0;
  const emptySlots = Math.max(0, ADDITIONAL_SLOTS - additionalCount);

  if (loading) {
    return (
      <>
        {/* Render the intro overlay even during the data-load spinner state —
            the video is independent of the recipients/letters fetches and
            shouldn't sit behind them. */}
        {showIntro && (
          <IntroVideoOverlay
            videoUrl={LETTERS_INTRO_VIDEO}
            onDismiss={handleDismissIntro}
          />
        )}
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" />
        </div>
      </>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-10 animate-in fade-in duration-500 pb-20">
      {/* First-visit intro video — overlays the page until dismissed. The
          dismissal is persisted via /interview/flags so it never replays for
          the same user. */}
      {showIntro && (
        <IntroVideoOverlay
          videoUrl={LETTERS_INTRO_VIDEO}
          onDismiss={handleDismissIntro}
        />
      )}
      {/* Add Person Modal — picker shows family & friends not already on the
          page (immediate stays included per spec, but filtered if they're
          already auto-listed). Falls through to "Add someone new" if they
          want to write to a brand-new person. */}
      {showAddModal && recipients && (
        <AddPersonModal
          pickable={(() => {
            const shown = new Set<string>([
              ...recipients.immediate.map((m) => m.member_guid),
              ...recipients.siblings.map((m) => m.member_guid),
              ...recipients.additional.map((m) => m.member_guid),
            ]);
            return allFamily.filter((m) => !shown.has(m.member_guid));
          })()}
          onClose={() => setShowAddModal(false)}
          onPick={handlePersonPicked}
          onSave={handlePersonAdded}
        />
      )}

      {/* ── Header ──
          Flex row so the "Watch intro" replay button sits at the top-right
          without disrupting the title/subtitle stack. */}
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-playfair text-4xl font-black text-navy flex items-center gap-3">
            💌 Letters to Loved Ones
          </h1>
          <p className="text-zinc-500">
            The things you most want them to know — in your own words.
          </p>
        </div>
        {/* Replay affordance — re-opens the intro overlay without touching
            the dismissal flag (so it doesn't reappear on its own next visit). */}
        <button
          type="button"
          onClick={() => setShowIntro(true)}
          className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-navy border border-zinc-200 hover:border-zinc-300 bg-white px-3 py-1.5 rounded-full transition-colors"
        >
          <Play className="w-3 h-3 fill-current" />
          Watch intro
        </button>
      </header>

      {loadError && (
        <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-2xl px-5 py-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">Couldn&apos;t load this page: {loadError}</span>
          <button onClick={() => void loadAll()} className="font-bold underline">Retry</button>
        </div>
      )}

      {/* ── Group 1: Immediate Family ── */}
      {recipients?.immediate && recipients.immediate.length > 0 && (
        <GroupSection title="Immediate Family">
          {recipients.immediate.map(member => (
            <RecipientRow
              key={member.member_guid}
              member={member}
              letter={getLetter(member.member_guid)}
              isOpen={openId === member.member_guid}
              onToggle={() => handleToggle(member.member_guid)}
              onSaved={(updated) => handleSaved(member.member_guid, updated)}
            />
          ))}
        </GroupSection>
      )}

      {/* ── Group 2: Siblings & Trusted Friend ── */}
      {((recipients?.siblings && recipients.siblings.length > 0) || recipients?.show_trusted_friend_slot) && (
        <GroupSection title="Siblings & Trusted Friend">
          {recipients?.siblings.map(member => (
            <RecipientRow
              key={member.member_guid}
              member={member}
              letter={getLetter(member.member_guid)}
              isOpen={openId === member.member_guid}
              onToggle={() => handleToggle(member.member_guid)}
              onSaved={(updated) => handleSaved(member.member_guid, updated)}
            />
          ))}
          {recipients?.show_trusted_friend_slot && (
            <EmptySlot onAdd={() => setShowAddModal(true)} />
          )}
        </GroupSection>
      )}

      {/* ── Group 3: Additional ── */}
      <GroupSection title="Additional">
        {recipients?.additional.map(member => (
          <RecipientRow
            key={member.member_guid}
            member={member}
            letter={getLetter(member.member_guid)}
            isOpen={openId === member.member_guid}
            onToggle={() => handleToggle(member.member_guid)}
            onSaved={(updated) => handleSaved(member.member_guid, updated)}
          />
        ))}
        {/* Show ONE "Add a person" placeholder at a time. The Additional
            section is open-ended — there's no real cap, so a row of N empty
            placeholders was just visual noise. After adding, the next empty
            slot reappears below the new row automatically. */}
        {emptySlots > 0 && (
          <EmptySlot onAdd={() => setShowAddModal(true)} />
        )}
      </GroupSection>
    </div>
  );
}
