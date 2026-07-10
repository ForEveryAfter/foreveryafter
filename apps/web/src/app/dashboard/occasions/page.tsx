'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronRight,
  CheckCircle2,
  Plus,
  Trash2,
  Mic,
  Video,
  Type,
  Loader2,
  X,
  Calendar,
  Sparkles,
  AlertTriangle,
  Play,
} from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';
import Recorder from '@/components/dashboard/Recorder';
import IntroVideoOverlay from '@/components/dashboard/IntroVideoOverlay';

// First-play intro video for this section. The file is shipped statically under
// apps/web/public/parent/specialoccassion/ — note the directory name carries
// the original on-disk spelling ("occassion"); keep it in sync if the asset is
// ever renamed. Mirrors the willandtrust pattern in /dashboard/wills.
const SPECIAL_OCCASIONS_INTRO_VIDEO =
  '/parent/specialoccassion/Legacy Bridge - Special Occasions_1080p_caption.mp4';
const SPECIAL_OCCASIONS_INTRO_FLAG = 'special_occasions_intro_dismissed';

const USER_ID = '74656c6c-6d65-4123-8123-123456789012';
// Saved-state playback URLs go through /storage/* (session-gated via
// requireStorageAccess in apps/api/src/shared/section-auth.ts).
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const MAX_RECORDING_SECONDS = 5 * 60;

// ─── Types ────────────────────────────────────────────────────────────────────
interface FamilyMember {
  id: string;
  member_guid: string | null;
  first_name: string;
  last_name: string | null;
  relationship: string;
  email: string | null;
  mobile: string | null;
  sort_order: number;
}

interface Occasion {
  id: string;
  guide_id: string;
  recipient_guid: string | null;
  is_family_message: boolean;
  title: string;
  occasion_date: string | null;
  format: 'text' | 'audio' | 'video';
  content_text: string | null;
  audio_path: string | null;
  video_path: string | null;
  status: 'not_started' | 'in_progress' | 'complete';
  created_at: string;
  updated_at: string;
}

interface RecipientsData {
  family: FamilyMember;
  immediate: FamilyMember[];
  siblings: FamilyMember[];
  show_trusted_friend_slot: boolean;
  additional: FamilyMember[];
}

type Format = 'text' | 'audio' | 'video';

const ADDITIONAL_SLOTS = 5;

// ─── Occasion Suggestion Chips ────────────────────────────────────────────────
const OCCASION_SUGGESTIONS: Record<string, string[]> = {
  child: ['Birthday', 'Wedding day', 'Graduation', 'Birth of their first child', 'First home'],
  spouse: ['Birthday', 'Wedding anniversary', "Mother's Day", "Father's Day"],
  partner: ['Birthday', 'Wedding anniversary'],
  family: ['Christmas', 'Hanukkah', 'Thanksgiving', 'Anniversary of my passing'],
  default: ['Birthday', 'A milestone'],
};

function getSuggestions(relationship: string): string[] {
  const key = relationship.toLowerCase();
  return OCCASION_SUGGESTIONS[key] || OCCASION_SUGGESTIONS.default;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fullName(m: FamilyMember) {
  return [m.first_name, m.last_name].filter(Boolean).join(' ');
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDisplayDate(dateStr: string | null): string {
  if (!dateStr) return 'no date';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function wordCountHint(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return '';
  const mins = Math.max(1, Math.round(words / 200));
  return `~${mins} min read`;
}

// ─── Status Pill ──────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: Occasion['status'] }) {
  const map = {
    not_started: { label: 'Not started', cls: 'bg-zinc-100 text-zinc-400' },
    in_progress: { label: 'In progress', cls: 'bg-gold/10 text-gold' },
    complete: { label: 'Recorded', cls: 'bg-primary/10 text-primary' },
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
function AddPersonModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (member: FamilyMember) => void;
}) {
  const [form, setForm] = useState({ first_name: '', last_name: '', relationship: 'friend', email: '', mobile: '' });
  const [saving, setSaving] = useState(false);

  const RELATIONSHIPS = ['friend', 'sibling', 'colleague', 'neighbor', 'attorney', 'advisor', 'other'];

  async function handleSave() {
    if (!form.first_name || !form.relationship) return;
    setSaving(true);
    try {
      const data = await fetchWithAuth('/letters/family-members', USER_ID, {
        method: 'POST',
        body: JSON.stringify(form),
      });
      onSave(data);
    } catch (err) {
      alert('Failed to add person. Please try again.');
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
        <div className="p-10 space-y-5">
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
              {saving ? 'Adding...' : 'Add person'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Create Occasion Modal ───────────────────────────────────────────────────
function CreateOccasionModal({
  recipientId,
  recipientName,
  relationship,
  isFamilyMessage,
  onClose,
  onCreated,
}: {
  recipientId: string | null;
  recipientName: string;
  relationship: string;
  isFamilyMessage: boolean;
  onClose: () => void;
  onCreated: (occasion: Occasion) => void;
}) {
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState('');
  const [occasionDate, setOccasionDate] = useState('');
  const [format, setFormat] = useState<Format>('text');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [recordingActive, setRecordingActive] = useState(false);

  const countdown = useCountdown(recordingActive, MAX_RECORDING_SECONDS, () => {});

  const suggestions = isFamilyMessage
    ? OCCASION_SUGGESTIONS.family
    : getSuggestions(relationship);

  async function handleSaveText() {
    setSaving(true);
    try {
      const data = await fetchWithAuth('/occasions', USER_ID, {
        method: 'POST',
        body: JSON.stringify({
          title,
          recipient_guid: isFamilyMessage ? null : recipientId,
          is_family_message: isFamilyMessage,
          occasion_date: occasionDate || null,
          format: 'text',
          content_text: text,
        }),
      });
      onCreated(data);
    } catch (err) {
      alert('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveRecording(blob: Blob, type: 'audio' | 'video') {
    setSaving(true);
    setRecordingActive(false);
    try {
      // First create the occasion row
      const occasion = await fetchWithAuth('/occasions', USER_ID, {
        method: 'POST',
        body: JSON.stringify({
          title,
          recipient_guid: isFamilyMessage ? null : recipientId,
          is_family_message: isFamilyMessage,
          occasion_date: occasionDate || null,
          format: type,
        }),
      });

      // Then upload the file. Use File (not Blob) and a .webm filename — the
      // browser's MediaRecorder writes webm regardless of what we tag it. The
      // server's multer fileFilter accepts webm by mime AND by extension, so
      // .webm is the honest label. Naming it .wav/.mp4 worked too thanks to
      // the extension fallback but stored the wrong extension server-side.
      const safeType = blob.type && blob.type.startsWith(type === 'audio' ? 'audio/' : 'video/')
        ? blob.type
        : (type === 'audio' ? 'audio/webm' : 'video/webm');
      const file = new File([blob], `occasion.webm`, { type: safeType });
      const formData = new FormData();
      formData.append(type, file);
      const updated = await fetchWithAuth(`/occasions/${occasion.id}/${type}`, USER_ID, {
        method: 'POST',
        body: formData,
      });

      onCreated(updated);
    } catch (err: any) {
      // Surface the server's specific message instead of a generic "try again".
      // fetchWithAuth throws an Error whose .message is the server's JSON `error`.
      alert(`Failed to save ${type}: ${err?.message || 'unknown error'}`);
      // Re-throw so the Recorder's inline banner shows the same message and
      // keeps the just-recorded blob queued for retry.
      throw err;
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-navy/20 backdrop-blur-sm">
      <div className="bg-white w-full max-w-lg rounded-[40px] shadow-2xl border border-zinc-100 overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-500 max-h-[90vh] overflow-y-auto">
        <div className="px-10 py-7 bg-zinc-50 border-b border-zinc-100 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h3 className="font-bold text-navy">New occasion for {recipientName}</h3>
            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-0.5">Step {step} of 3</p>
          </div>
          <button onClick={onClose} className="text-zinc-300 hover:text-navy transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-10 space-y-8">
          {/* ── Step 1: Title ── */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">What&apos;s the occasion?</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-5 py-4 text-navy outline-none focus:border-gold text-sm transition-all"
                  placeholder="e.g. Sarah's 16th birthday"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Suggestions</p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map(s => (
                    <button
                      key={s}
                      onClick={() => setTitle(s)}
                      className={`px-4 py-2 rounded-full text-xs font-medium transition-all ${
                        title === s
                          ? 'bg-navy text-white'
                          : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setStep(2)}
                disabled={!title.trim()}
                className="w-full bg-navy text-white font-black py-4 rounded-xl hover:scale-[1.01] active:scale-[0.99] transition-all shadow-lg shadow-navy/20 disabled:opacity-40"
              >
                Continue
              </button>
            </div>
          )}

          {/* ── Step 2: Date + Format ── */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                  When should this play? <span className="text-zinc-300">(optional)</span>
                </label>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-300" />
                  <input
                    type="date"
                    value={occasionDate}
                    onChange={e => setOccasionDate(e.target.value)}
                    className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl pl-11 pr-5 py-4 text-navy outline-none focus:border-gold text-sm transition-all"
                  />
                </div>
                <p className="text-[10px] text-zinc-400 italic">You can leave this blank if you don&apos;t know yet.</p>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">How do you want to share this?</label>
                <div className="flex gap-1 p-1 bg-zinc-100 rounded-xl">
                  {(['text', 'audio', 'video'] as Format[]).map(f => (
                    <button
                      key={f}
                      onClick={() => setFormat(f)}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
                        format === f ? 'bg-white text-navy shadow-sm' : 'text-zinc-400 hover:text-navy'
                      }`}
                    >
                      {f === 'text' ? <Type size={14} /> : f === 'audio' ? <Mic size={14} /> : <Video size={14} />}
                      {capitalize(f)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-4 font-bold text-zinc-400 hover:text-navy transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="flex-[2] bg-navy text-white font-black py-4 rounded-xl hover:scale-[1.01] active:scale-[0.99] transition-all shadow-lg shadow-navy/20"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Record / Write ── */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="bg-zinc-50 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <p className="font-bold text-navy text-sm">{title}</p>
                  <p className="text-[10px] text-zinc-400">{occasionDate ? formatDisplayDate(occasionDate) : 'No date set'}</p>
                </div>
                <button onClick={() => setStep(1)} className="text-xs font-bold text-gold hover:underline">Edit</button>
              </div>

              {format === 'text' && (
                <div className="space-y-2">
                  <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder={`Write your message for ${recipientName}...`}
                    rows={8}
                    className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-5 py-4 text-navy outline-none focus:border-gold transition-all resize-none text-sm leading-relaxed"
                    autoFocus
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
                    onClick={handleSaveText}
                    disabled={saving || !text.trim()}
                    className="w-full bg-navy text-white font-black py-4 rounded-xl hover:scale-[1.01] active:scale-[0.99] transition-all shadow-lg shadow-navy/20 disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {saving ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                    {saving ? 'Saving...' : 'Save occasion'}
                  </button>
                </div>
              )}

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
                    onSave={(blob) => handleSaveRecording(blob, 'audio')}
                    onRecordingStart={() => setRecordingActive(true)}
                    onRecordingStop={() => setRecordingActive(false)}
                  />
                  {saving && (
                    <div className="flex items-center justify-center gap-2 text-sm text-zinc-400">
                      <Loader2 size={16} className="animate-spin" /> Saving audio...
                    </div>
                  )}
                </div>
              )}

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
                    onSave={(blob) => handleSaveRecording(blob, 'video')}
                    onRecordingStart={() => setRecordingActive(true)}
                    onRecordingStop={() => setRecordingActive(false)}
                  />
                  {saving && (
                    <div className="flex items-center justify-center gap-2 text-sm text-zinc-400">
                      <Loader2 size={16} className="animate-spin" /> Saving video...
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={() => setStep(2)}
                className="w-full py-3 text-sm font-bold text-zinc-400 hover:text-navy transition-colors"
              >
                Back
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Occasion Editor (inline, for editing existing occasions) ────────────────
function OccasionEditor({
  occasion,
  onSaved,
  onDeleted,
}: {
  occasion: Occasion;
  onSaved: (updated: Occasion) => void;
  onDeleted: (id: string) => void;
}) {
  const [format, setFormat] = useState<Format>(occasion.format);
  const [text, setText] = useState(occasion.content_text || '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [recordingActive, setRecordingActive] = useState(false);
  // True when the user clicked "Re-record" — swaps the saved playback view for
  // the Recorder so they can capture new content. Reset whenever the saved
  // path changes (e.g. after a successful save) so the new clip plays back.
  const [replacing, setReplacing] = useState(false);
  useEffect(() => { setReplacing(false); }, [occasion.audio_path, occasion.video_path]);

  const countdown = useCountdown(recordingActive, MAX_RECORDING_SECONDS, () => {});

  async function saveTyped() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const data = await fetchWithAuth(`/occasions/${occasion.id}`, USER_ID, {
        method: 'PATCH',
        body: JSON.stringify({ format: 'text', content_text: text, status: 'complete' }),
      });
      onSaved(data);
    } catch (err) {
      alert('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function saveRecording(blob: Blob, type: 'audio' | 'video') {
    setSaving(true);
    setRecordingActive(false);
    try {
      // File + explicit type/name — see handleSaveRecording in the wizard
      // above for why Blob alone isn't enough.
      const safeType = blob.type && blob.type.startsWith(type === 'audio' ? 'audio/' : 'video/')
        ? blob.type
        : (type === 'audio' ? 'audio/webm' : 'video/webm');
      const file = new File([blob], `occasion.webm`, { type: safeType });
      const formData = new FormData();
      formData.append(type, file);
      const data = await fetchWithAuth(`/occasions/${occasion.id}/${type}`, USER_ID, {
        method: 'POST',
        body: formData,
      });
      onSaved(data);
    } catch (err) {
      // Re-throw so the Recorder's inline banner shows the server's specific message
      // (e.g. "Recording is too big …" / "Video is too long …"). The recorded blob is
      // kept in the Recorder so the user can record again without losing it.
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this occasion? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await fetchWithAuth(`/occasions/${occasion.id}`, USER_ID, { method: 'DELETE' });
      onDeleted(occasion.id);
    } catch (err) {
      alert('Failed to delete. Please try again.');
    } finally {
      setDeleting(false);
    }
  }

  const isComplete = occasion.status === 'complete';

  return (
    <div className="border-t border-zinc-100 mt-3 pt-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Format Pills */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 p-1 bg-zinc-100 rounded-xl w-fit">
          {(['text', 'audio', 'video'] as Format[]).map(f => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                format === f ? 'bg-white text-navy shadow-sm' : 'text-zinc-400 hover:text-navy'
              }`}
            >
              {f === 'text' ? <Type size={12} /> : f === 'audio' ? <Mic size={12} /> : <Video size={12} />}
              {capitalize(f)}
            </button>
          ))}
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="p-2 text-zinc-300 hover:text-red-500 transition-colors"
          title="Delete occasion"
        >
          {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
        </button>
      </div>

      {/* Text */}
      {format === 'text' && (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Write your message..."
            rows={6}
            className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-5 py-4 text-navy outline-none focus:border-gold transition-all resize-none text-sm leading-relaxed"
          />
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] text-zinc-400">
              {text.trim() ? wordCountHint(text) : ''}
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
            {saving ? 'Saving...' : isComplete ? 'Overwrite & Save' : 'Save'}
          </button>
        </div>
      )}

      {/* Audio — same saved-state / re-record pattern as video below. */}
      {format === 'audio' && (
        <div className="space-y-4">
          {occasion.audio_path && !replacing ? (
            <>
              <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-4 flex items-center gap-3">
                <Mic size={18} className="text-primary shrink-0" />
                <audio
                  key={occasion.audio_path}
                  src={`${API_BASE_URL}/storage/${occasion.audio_path}`}
                  controls
                  preload="metadata"
                  crossOrigin="use-credentials"
                  className="flex-1 min-w-0"
                />
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => setReplacing(true)}
                  className="text-xs font-bold text-zinc-400 hover:text-navy transition-colors"
                >
                  Re-record
                </button>
              </div>
            </>
          ) : (
            <>
              {recordingActive && (
                <div className="flex items-center gap-2 justify-center py-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="font-mono text-sm font-bold text-navy">{countdown} remaining</span>
                </div>
              )}
              <Recorder
                type="audio"
                onSave={(blob) => saveRecording(blob, 'audio')}
                onRecordingStart={() => setRecordingActive(true)}
                onRecordingStop={() => setRecordingActive(false)}
              />
              {occasion.audio_path && replacing && (
                <div className="flex justify-end">
                  <button
                    onClick={() => setReplacing(false)}
                    className="text-xs font-bold text-zinc-400 hover:text-navy transition-colors"
                  >
                    Cancel — keep saved audio
                  </button>
                </div>
              )}
              {saving && (
                <div className="flex items-center justify-center gap-2 text-sm text-zinc-400">
                  <Loader2 size={16} className="animate-spin" /> Saving audio...
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Video — show the saved clip (if any) with native controls;
          "Re-record" swaps it for the Recorder so the parent can capture a
          new take. Re-record is a soft action: the saved file stays in
          storage until the new clip lands (server-side replaces on POST). */}
      {format === 'video' && (
        <div className="space-y-4">
          {occasion.video_path && !replacing ? (
            <>
              <video
                key={occasion.video_path}
                src={`${API_BASE_URL}/storage/${occasion.video_path}`}
                controls
                preload="metadata"
                crossOrigin="use-credentials"
                className="w-full rounded-2xl bg-black aspect-video object-contain"
              />
              <div className="flex justify-end">
                <button
                  onClick={() => setReplacing(true)}
                  className="text-xs font-bold text-zinc-400 hover:text-navy transition-colors"
                >
                  Re-record
                </button>
              </div>
            </>
          ) : (
            <>
              {recordingActive && (
                <div className="flex items-center gap-2 justify-center py-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="font-mono text-sm font-bold text-navy">{countdown} remaining</span>
                </div>
              )}
              <Recorder
                type="video"
                onSave={(blob) => saveRecording(blob, 'video')}
                onRecordingStart={() => setRecordingActive(true)}
                onRecordingStop={() => setRecordingActive(false)}
              />
              {/* Cancel back to the saved view if we entered re-record mode
                  but changed our mind without producing a new clip. */}
              {occasion.video_path && replacing && (
                <div className="flex justify-end">
                  <button
                    onClick={() => setReplacing(false)}
                    className="text-xs font-bold text-zinc-400 hover:text-navy transition-colors"
                  >
                    Cancel — keep saved video
                  </button>
                </div>
              )}
              {saving && (
                <div className="flex items-center justify-center gap-2 text-sm text-zinc-400">
                  <Loader2 size={16} className="animate-spin" /> Saving video...
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Occasion Row ─────────────────────────────────────────────────────────────
function OccasionRow({
  occasion,
  isOpen,
  onToggle,
  onSaved,
  onDeleted,
}: {
  occasion: Occasion;
  isOpen: boolean;
  onToggle: () => void;
  onSaved: (updated: Occasion) => void;
  onDeleted: (id: string) => void;
}) {
  return (
    <div className={`bg-white rounded-2xl border transition-all duration-200 overflow-hidden ${
      isOpen ? 'border-primary/20 shadow-lg shadow-primary/5' : 'border-zinc-100 hover:border-zinc-200'
    }`}>
      <button onClick={onToggle} className="w-full flex items-center justify-between p-4 text-left group">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
            occasion.status === 'complete' ? 'bg-primary text-white' : 'bg-zinc-100 text-zinc-400'
          }`}>
            {occasion.status === 'complete' ? <CheckCircle2 size={16} /> : <Calendar size={14} />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-navy text-sm truncate">{occasion.title}</p>
            <p className="text-[10px] text-zinc-400">{formatDisplayDate(occasion.occasion_date)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusPill status={occasion.status} />
          <ChevronRight size={14} className={`text-zinc-300 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
        </div>
      </button>
      {isOpen && (
        <div className="px-4 pb-4">
          <OccasionEditor occasion={occasion} onSaved={onSaved} onDeleted={onDeleted} />
        </div>
      )}
    </div>
  );
}

// ─── Recipient Section ────────────────────────────────────────────────────────
function RecipientSection({
  member,
  occasions,
  openId,
  onToggle,
  onSaved,
  onDeleted,
  onAddOccasion,
}: {
  member: FamilyMember;
  occasions: Occasion[];
  openId: string | null;
  onToggle: (id: string) => void;
  onSaved: (updated: Occasion) => void;
  onDeleted: (id: string) => void;
  onAddOccasion: () => void;
}) {
  const isFamilyTarget = member.relationship === 'family';
  const name = isFamilyTarget ? 'The Family' : fullName(member);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-navy text-sm">{name}</h3>
          {!isFamilyTarget && (
            <span className="text-[10px] text-zinc-400 capitalize">({member.relationship})</span>
          )}
        </div>
        <span className="text-[10px] font-bold text-zinc-300">{occasions.length} occasion{occasions.length !== 1 ? 's' : ''}</span>
      </div>

      {occasions.map(occ => (
        <OccasionRow
          key={occ.id}
          occasion={occ}
          isOpen={openId === occ.id}
          onToggle={() => onToggle(occ.id)}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      ))}

      <button
        onClick={onAddOccasion}
        className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 border-dashed border-zinc-200 hover:border-navy/30 hover:bg-zinc-50 transition-all group"
      >
        <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-300 group-hover:text-navy group-hover:bg-zinc-200 transition-colors">
          <Plus size={16} />
        </div>
        <span className="text-sm font-bold text-zinc-400 group-hover:text-navy transition-colors">
          Add an occasion for {isFamilyTarget ? 'the family' : member.first_name}
        </span>
      </button>
    </div>
  );
}

// ─── Group Section ────────────────────────────────────────────────────────────
function GroupSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 px-1">{title}</h2>
      <div className="space-y-4">{children}</div>
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
export default function OccasionsPage() {
  const [recipients, setRecipients] = useState<RecipientsData | null>(null);
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [loading, setLoading] = useState(true);
  // Surface fetch failures as a visible banner instead of silently rendering
  // an empty page (the previous behavior — recipients=null + empty additional
  // placeholders looked indistinguishable from "fresh account, nothing to do").
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAddPersonModal, setShowAddPersonModal] = useState(false);
  const [createModal, setCreateModal] = useState<{
    recipientId: string | null;
    recipientName: string;
    relationship: string;
    isFamilyMessage: boolean;
  } | null>(null);
  // First-visit intro video. We persist a per-section flag rather than reusing
  // the dashboard-root `intro_video_dismissed` so each section's video can be
  // surfaced independently the first time the user lands on it.
  const [showIntro, setShowIntro] = useState(false);

  // Check the per-section dismissal flag on mount. We only show the intro when
  // it's NEVER been dismissed — a failed flag read leaves the overlay hidden
  // (better to skip the video than to re-show it after the user has already
  // dismissed it once).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const flags = await fetchWithAuth('/interview/flags', USER_ID);
        const dismissed = Array.isArray(flags) && flags.some(
          (f: any) => f.flag === SPECIAL_OCCASIONS_INTRO_FLAG
        );
        if (!cancelled && !dismissed) setShowIntro(true);
      } catch (err) {
        console.error('Failed to check special-occasions intro flag:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Persist the dismissal so the video doesn't reappear on the next visit.
  // Optimistically close the overlay first; the flag write is best-effort
  // (worst case: the user sees the video again next mount, which is mild).
  const handleDismissIntro = async () => {
    setShowIntro(false);
    try {
      await fetchWithAuth('/interview/flags', USER_ID, {
        method: 'POST',
        body: JSON.stringify({ flag: SPECIAL_OCCASIONS_INTRO_FLAG }),
      });
    } catch (err) {
      console.error('Failed to save special-occasions intro flag:', err);
    }
  };

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const [recipData, occasionsData] = await Promise.all([
        fetchWithAuth('/occasions/recipients', USER_ID),
        fetchWithAuth('/occasions', USER_ID),
      ]);
      setRecipients(recipData);
      setOccasions(occasionsData);
    } catch (err: any) {
      console.error('Failed to load occasions:', err);
      setLoadError(err?.message || 'Could not load this page right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function getOccasionsFor(memberId: string | null, isFamilyMessage: boolean): Occasion[] {
    if (isFamilyMessage) return occasions.filter(o => o.is_family_message);
    return occasions.filter(o => !o.is_family_message && o.recipient_guid === memberId);
  }

  function handleToggle(id: string) {
    setOpenId(prev => prev === id ? null : id);
  }

  function handleSaved(updated: Occasion) {
    setOccasions(prev => prev.map(o => o.id === updated.id ? updated : o));
  }

  function handleDeleted(id: string) {
    setOccasions(prev => prev.filter(o => o.id !== id));
    setOpenId(null);
  }

  function handleCreated(occasion: Occasion) {
    setOccasions(prev => [...prev, occasion]);
    setCreateModal(null);
    setOpenId(occasion.id);
  }

  function handlePersonAdded(member: FamilyMember) {
    setRecipients(prev => {
      if (!prev) return prev;
      return { ...prev, additional: [...prev.additional, member] };
    });
    setShowAddPersonModal(false);
  }

  const additionalCount = recipients?.additional.length || 0;
  const emptySlots = Math.max(0, ADDITIONAL_SLOTS - additionalCount);

  if (loading) {
    return (
      <>
        {/* Render the intro overlay even during the data-load spinner state —
            the video is independent of recipients/occasions data and there's
            no reason to delay it behind those fetches. */}
        {showIntro && (
          <IntroVideoOverlay
            videoUrl={SPECIAL_OCCASIONS_INTRO_VIDEO}
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
      {/* First-visit intro video — overlays the page until the user dismisses
          it. The dismissal is persisted via /interview/flags, so it never
          replays for the same user. */}
      {showIntro && (
        <IntroVideoOverlay
          videoUrl={SPECIAL_OCCASIONS_INTRO_VIDEO}
          onDismiss={handleDismissIntro}
        />
      )}
      {showAddPersonModal && (
        <AddPersonModal
          onClose={() => setShowAddPersonModal(false)}
          onSave={handlePersonAdded}
        />
      )}

      {createModal && (
        <CreateOccasionModal
          recipientId={createModal.recipientId}
          recipientName={createModal.recipientName}
          relationship={createModal.relationship}
          isFamilyMessage={createModal.isFamilyMessage}
          onClose={() => setCreateModal(null)}
          onCreated={handleCreated}
        />
      )}

      {/* ── Header ──
          Flex row so the "Watch intro" replay button can sit at the top-right
          of the section without disrupting the existing title/subtitle stack. */}
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-playfair text-4xl font-black text-navy">
            Special Occasions
          </h1>
          <p className="text-zinc-500">
            Your voice at the moments you&apos;d most want to be there.
          </p>
        </div>
        {/* Replay affordance — flips showIntro back to true without touching
            the dismissal flag, so the user can re-watch on demand but the
            video still doesn't auto-play on every subsequent visit. */}
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
          <button onClick={() => void load()} className="font-bold underline">Retry</button>
        </div>
      )}

      {/* ── The Family ── */}
      {recipients && (
        <GroupSection title="The Family">
          <RecipientSection
            member={recipients.family}
            occasions={getOccasionsFor(null, true)}
            openId={openId}
            onToggle={handleToggle}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
            onAddOccasion={() => setCreateModal({
              recipientId: null,
              recipientName: 'The Family',
              relationship: 'family',
              isFamilyMessage: true,
            })}
          />
        </GroupSection>
      )}

      {/* ── Immediate Family ── */}
      {recipients?.immediate && recipients.immediate.length > 0 && (
        <GroupSection title="Immediate Family">
          {recipients.immediate.map(member => (
            <RecipientSection
              key={member.id}
              member={member}
              occasions={getOccasionsFor(member.id, false)}
              openId={openId}
              onToggle={handleToggle}
              onSaved={handleSaved}
              onDeleted={handleDeleted}
              onAddOccasion={() => setCreateModal({
                recipientId: member.id,
                recipientName: fullName(member),
                relationship: member.relationship,
                isFamilyMessage: false,
              })}
            />
          ))}
        </GroupSection>
      )}

      {/* ── Siblings & Trusted Friend ── */}
      {((recipients?.siblings && recipients.siblings.length > 0) || recipients?.show_trusted_friend_slot) && (
        <GroupSection title="Siblings & Trusted Friend">
          {recipients?.siblings.map(member => (
            <RecipientSection
              key={member.id}
              member={member}
              occasions={getOccasionsFor(member.id, false)}
              openId={openId}
              onToggle={handleToggle}
              onSaved={handleSaved}
              onDeleted={handleDeleted}
              onAddOccasion={() => setCreateModal({
                recipientId: member.id,
                recipientName: fullName(member),
                relationship: member.relationship,
                isFamilyMessage: false,
              })}
            />
          ))}
          {recipients?.show_trusted_friend_slot && (
            <EmptySlot onAdd={() => setShowAddPersonModal(true)} />
          )}
        </GroupSection>
      )}

      {/* ── Additional ── */}
      <GroupSection title="Additional">
        {recipients?.additional.map(member => (
          <RecipientSection
            key={member.id}
            member={member}
            occasions={getOccasionsFor(member.id, false)}
            openId={openId}
            onToggle={handleToggle}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
            onAddOccasion={() => setCreateModal({
              recipientId: member.id,
              recipientName: fullName(member),
              relationship: member.relationship,
              isFamilyMessage: false,
            })}
          />
        ))}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <EmptySlot key={`empty-${i}`} onAdd={() => setShowAddPersonModal(true)} />
        ))}
      </GroupSection>
    </div>
  );
}
