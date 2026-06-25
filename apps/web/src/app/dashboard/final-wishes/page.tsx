'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus,
  Trash2,
  Upload,
  Link as LinkIcon,
  Video,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Camera,
  Image,
} from 'lucide-react';
import Link from 'next/link';
import {
  fetchWithAuth,
  getFamilyMembers,
  addFamilyMember,
  updateFamilyMember,
  type FamilyMember,
} from '@/lib/api';
import Recorder from '@/components/dashboard/Recorder';

// Notifees who would receive the released files anyway — they don't need to be
// on the notify list. Matches the same definition used by the child overview
// + payment-takeover logic (apps/api/src/relationships/routes.ts).
const IMMEDIATE_FAMILY_REL = new Set(['son', 'daughter', 'spouse']);

const USER_ID = '74656c6c-6d65-4123-8123-123456789012';
// Image previews on the PhotoTile go through the same /storage/* proxy the rest
// of the app uses — gated by requireStorageAccess (apps/api/src/shared/section-auth.ts).
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ─── Types ────────────────────────────────────────────────────────────────────
interface NotifyPerson {
  id: string;
  name: string;
  contact: string;
}

interface FinalWishes {
  service_type: string | null;
  service_notes: string;
  body_preference: string | null;
  body_notes: string;
  service_video_path: string | null;
  service_video_url: string;
  obituary_own_words: string;
  obituary_photo_path: string | null;
  funeral_program_photo_path: string | null;
  notify_list: NotifyPerson[];
}

const EMPTY: FinalWishes = {
  service_type: null,
  service_notes: '',
  body_preference: null,
  body_notes: '',
  service_video_path: null,
  service_video_url: '',
  obituary_own_words: '',
  obituary_photo_path: null,
  funeral_program_photo_path: null,
  notify_list: [],
};

const SERVICE_OPTIONS = [
  'Religious service',
  'Celebration of life',
  'Private, family only',
  'No service',
  'Whatever feels right',
];

const BODY_OPTIONS = [
  'Buried',
  'Cremated',
  'Green burial',
  'Donated to science',
  'No preference',
];

// ─── Autosave Hook ────────────────────────────────────────────────────────────

type SaveStatus = 'idle' | 'saving' | 'saved' | 'retrying' | 'failed';

function useAutosave() {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const pendingRef = useRef<Partial<FinalWishes> | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const failCountRef = useRef(0);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);

  const doSave = useCallback(async (patch: Partial<FinalWishes>) => {
    setStatus('saving');
    try {
      await fetchWithAuth('/final-wishes', USER_ID, {
        method: 'POST',
        body: JSON.stringify(patch),
      });
      failCountRef.current = 0;
      setSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setStatus('saved');
      pendingRef.current = null;
    } catch (err) {
      console.error('Autosave failed:', err);
      failCountRef.current++;
      if (failCountRef.current >= 3) {
        setStatus('failed');
      } else {
        setStatus('retrying');
        retryTimerRef.current = setTimeout(() => doSave(patch), 5000);
      }
    }
  }, []);

  const schedule = useCallback((patch: Partial<FinalWishes>, immediate = false) => {
    // Merge with any pending changes
    pendingRef.current = { ...(pendingRef.current || {}), ...patch };

    if (timerRef.current) clearTimeout(timerRef.current);

    if (immediate) {
      doSave(pendingRef.current);
    } else {
      timerRef.current = setTimeout(() => {
        if (pendingRef.current) doSave(pendingRef.current);
      }, 1500);
    }
  }, [doSave]);

  const retry = useCallback(() => {
    failCountRef.current = 0;
    if (pendingRef.current) {
      doSave(pendingRef.current);
    }
  }, [doSave]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  return { status, savedAt, schedule, retry };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PillGroup({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(value === opt ? '' : opt)}
          className={`px-4 py-2 rounded-full text-sm font-bold border transition-all ${
            value === opt
              ? 'bg-navy text-white border-navy'
              : 'bg-white text-zinc-500 border-zinc-200 hover:border-navy/30 hover:text-navy'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-100 p-6 space-y-5">
      {children}
    </div>
  );
}

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div>
      <h3 className="font-bold text-navy text-lg">{label}</h3>
      {hint && <p className="text-sm text-zinc-400 mt-0.5 italic">{hint}</p>}
    </div>
  );
}

function SaveIndicator({ status, savedAt, onRetry }: { status: SaveStatus; savedAt: string | null; onRetry: () => void }) {
  if (status === 'idle') return null;

  return (
    <div className="sticky top-20 z-30 flex justify-end">
      <div className="bg-white/90 backdrop-blur-sm border border-zinc-100 rounded-full px-4 py-2 shadow-sm">
        {status === 'saving' && (
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
            <Loader2 size={12} className="animate-spin" /> Saving...
          </span>
        )}
        {status === 'saved' && (
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-primary uppercase tracking-widest" title={savedAt ? `Saved at ${savedAt}` : undefined}>
            <CheckCircle2 size={12} /> All changes saved
          </span>
        )}
        {status === 'retrying' && (
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-amber-600 uppercase tracking-widest">
            <AlertTriangle size={12} /> Couldn&apos;t save — retrying
          </span>
        )}
        {status === 'failed' && (
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-red-500 uppercase tracking-widest">
            <AlertTriangle size={12} /> Save failed.
            <button onClick={onRetry} className="underline ml-1">Retry</button>
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Photo Upload Tile ────────────────────────────────────────────────────────

// ─── Notify list picker ───────────────────────────────────────────────────────
// Three affordances stacked vertically:
//   1. selected notifyees → display-only cards with X to remove
//   2. picker → dropdown of eligible family & friends (excluding immediate
//      family who'll already receive the released files, and excluding anyone
//      already on the notify list)
//   3. "Add someone new" → inline form that creates a new family_members row
//      with relationship='friend' (visible everywhere else family is referenced)
function NotifyListPicker({
  notifyList,
  familyAndFriends,
  onAddFromContacts,
  onAddNewPerson,
  onRemove,
}: {
  notifyList: NotifyPerson[];
  familyAndFriends: FamilyMember[];
  onAddFromContacts: (m: FamilyMember) => void;
  onAddNewPerson: (name: string, contact: string) => Promise<void>;
  onRemove: (id: string) => void;
}) {
  const eligible = familyAndFriends.filter(
    (m) =>
      !IMMEDIATE_FAMILY_REL.has((m.relationship || '').toLowerCase()) &&
      !notifyList.some((n) => n.id === m.id)
  );

  // Add-new-person inline form state.
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newContact, setNewContact] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const submitNew = async () => {
    if (!newName.trim() || adding) return;
    setAdding(true);
    setAddError(null);
    try {
      await onAddNewPerson(newName, newContact);
      setNewName('');
      setNewContact('');
      setShowNewForm(false);
    } catch (err: any) {
      setAddError(err?.message || 'Could not add this person right now.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Selected notifyees */}
      {notifyList.length > 0 && (
        <div className="space-y-2">
          {notifyList.map((p) => (
            <div key={p.id} className="bg-white border border-zinc-100 rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-navy truncate">{p.name || 'Unnamed'}</p>
                {p.contact && <p className="text-xs text-zinc-400 truncate">{p.contact}</p>}
              </div>
              <button
                onClick={() => onRemove(p.id)}
                aria-label={`Remove ${p.name} from notify list`}
                className="text-zinc-300 hover:text-red-500 transition-colors p-1.5"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Picker: dropdown of eligible family & friends. Native <select> so it
          works on mobile + keyboards out of the box. Resets to "" after each
          pick so the same option text can be reselected if removed later. */}
      {eligible.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 ml-1">
            Pick from your family &amp; friends
          </label>
          <select
            value=""
            onChange={(e) => {
              const m = eligible.find((x) => x.id === e.target.value);
              if (m) onAddFromContacts(m);
            }}
            className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-xl px-4 py-3 text-sm text-navy outline-none focus:border-gold transition-all"
          >
            <option value="">Select someone…</option>
            {eligible.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
                {m.relationship ? ` · ${m.relationship}` : ''}
                {m.email ? ` · ${m.email}` : m.phone ? ` · ${m.phone}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Add-new-person inline form. Collapsed by default — only opens when the
          user explicitly clicks. Cancel restores closed state without saving. */}
      {showNewForm ? (
        <div className="bg-zinc-50 border-2 border-zinc-100 rounded-xl p-4 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
            Add someone new
          </p>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name"
            className="w-full bg-white border border-zinc-100 rounded-lg px-4 py-2.5 text-navy outline-none focus:border-gold transition-all text-sm font-medium"
          />
          <input
            type="text"
            value={newContact}
            onChange={(e) => setNewContact(e.target.value)}
            placeholder="Email or phone"
            className="w-full bg-white border border-zinc-100 rounded-lg px-4 py-2.5 text-navy outline-none focus:border-gold transition-all text-sm"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submitNew(); } }}
          />
          {addError && <p className="text-xs text-red-500">{addError}</p>}
          <p className="text-[10px] text-zinc-400 italic">
            They'll be added to your family &amp; friends as a <strong>friend</strong>, and to this notify list.
          </p>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => { setShowNewForm(false); setNewName(''); setNewContact(''); setAddError(null); }}
              disabled={adding}
              className="text-sm text-zinc-400 hover:text-navy font-medium px-3 py-1.5 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitNew}
              disabled={adding || !newName.trim()}
              className="bg-navy text-white font-bold text-sm px-4 py-2 rounded-lg hover:bg-navy/90 transition-colors disabled:opacity-60 inline-flex items-center gap-1.5"
            >
              {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add to notify
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowNewForm(true)}
          className="flex items-center gap-2 text-sm font-bold text-navy border-2 border-dashed border-zinc-200 hover:border-navy/40 px-5 py-3 rounded-xl transition-all"
        >
          <Plus size={16} /> Add someone new
        </button>
      )}

      {/* Empty state — when there's nothing to pick from AND nothing in the list. */}
      {notifyList.length === 0 && eligible.length === 0 && !showNewForm && (
        <p className="text-xs text-zinc-400 italic">
          No one on the list yet. Add anyone you'd want notified that doesn't already get the released files.
        </p>
      )}
    </div>
  );
}

function PhotoTile({
  label,
  tag,
  currentPath,
  onUploaded,
  onRemoved,
}: {
  label: string;
  tag: 'obituary' | 'funeral_program';
  currentPath: string | null;
  onUploaded: (path: string) => void;
  onRemoved: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  // Set to true if the <img> fails to load (S3 outage, missing file, expired
  // session, etc.) — falls back to the same check-icon stub we used to render
  // unconditionally, so Replace/Remove stay reachable.
  const [imageError, setImageError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset the error flag whenever the underlying path changes so a successful
  // re-upload retries the image instead of staying stuck on the fallback.
  useEffect(() => { setImageError(false); }, [currentPath]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('photo', file);
      const res = await fetchWithAuth(`/final-wishes/photo/${tag}`, USER_ID, {
        method: 'POST',
        body: formData,
      });
      onUploaded(res.path);
    } catch (err) {
      alert('Photo upload failed. Please try again.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleRemove() {
    try {
      await fetchWithAuth(`/final-wishes/photo/${tag}`, USER_ID, { method: 'DELETE' });
      onRemoved();
    } catch (err) {
      alert('Failed to remove photo.');
    }
  }

  return (
    <div className="border border-zinc-100 rounded-2xl overflow-hidden flex-1 min-w-[200px]">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/heic"
        className="hidden"
        onChange={handleUpload}
      />
      <div className={`aspect-[4/3] flex items-center justify-center overflow-hidden ${currentPath ? 'bg-zinc-100' : 'bg-zinc-50'}`}>
        {uploading ? (
          <Loader2 size={24} className="text-zinc-400 animate-spin" />
        ) : currentPath && !imageError ? (
          // object-contain = "shrink to fit" — preserves aspect, no crop.
          // crossOrigin=use-credentials lets the cookie ride along so the API's
          // /storage/* auth gate sees the session.
          <img
            src={`${API_BASE_URL}/storage/${currentPath}`}
            alt={label}
            crossOrigin="use-credentials"
            onError={() => setImageError(true)}
            className="w-full h-full object-contain"
          />
        ) : currentPath && imageError ? (
          // Auth-gate or network failed — keep the check-icon stub so the
          // Replace/Remove controls below stay usable.
          <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-zinc-200 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6 text-zinc-400" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Photo uploaded</p>
            <p className="text-[10px] text-zinc-300">(preview unavailable)</p>
          </div>
        ) : (
          <button
            onClick={() => inputRef.current?.click()}
            className="w-full h-full flex flex-col items-center justify-center gap-2 text-zinc-300 hover:text-navy transition-colors cursor-pointer"
          >
            <Camera size={24} />
            <span className="text-xs font-bold">Click to upload</span>
            <span className="text-[10px] text-zinc-300">JPG, PNG, or HEIC</span>
          </button>
        )}
      </div>
      <div className="p-4 space-y-2">
        <p className="text-xs font-bold text-navy">{label}</p>
        {currentPath && (
          <div className="flex gap-3">
            <button onClick={() => inputRef.current?.click()} className="text-xs font-bold text-zinc-400 hover:text-navy transition-colors">
              Replace
            </button>
            <button onClick={handleRemove} className="text-xs font-bold text-red-400 hover:text-red-600 transition-colors">
              Remove
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FinalWishesPage() {
  const [wishes, setWishes] = useState<FinalWishes>(EMPTY);
  const [loading, setLoading] = useState(true);

  // Video state
  const [videoFileName, setVideoFileName] = useState<string | null>(null);
  const [videoUrlInput, setVideoUrlInput] = useState('');
  const [videoMode, setVideoMode] = useState<'upload' | 'link' | 'record'>('upload');
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Parent's full family & friends roster. Drives BOTH the "currently on
  // notify" cards AND the "Pick from contacts" dropdown — derived from this
  // single list via the `notify` flag (no separate notifyList state).
  // Refetched after any toggle so the picker recomputes instantly.
  const [familyAndFriends, setFamilyAndFriends] = useState<FamilyMember[]>([]);

  // Derived view of the notify list. Cards rendered by NotifyListPicker.
  // Filters out immediate family (they get the released files automatically,
  // per the section's hint text).
  const notifyList: NotifyPerson[] = familyAndFriends
    .filter(
      (m) =>
        m.notify &&
        !IMMEDIATE_FAMILY_REL.has((m.relationship || '').toLowerCase())
    )
    .map((m) => ({
      id: m.id,
      name: m.display_name,
      contact: m.email || m.phone || '',
    }));

  // Autosave
  const { status: saveStatus, savedAt, schedule: scheduleSave, retry: retrySave } = useAutosave();

  // ── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const data = await fetchWithAuth('/final-wishes', USER_ID);
        if (data && Object.keys(data).length > 0) {
          setWishes({
            service_type: data.service_type || null,
            service_notes: data.service_notes || '',
            body_preference: data.body_preference || null,
            body_notes: data.body_notes || '',
            service_video_path: data.service_video_path || null,
            service_video_url: data.service_video_url || '',
            obituary_own_words: data.obituary_own_words || '',
            obituary_photo_path: data.obituary_photo_path || null,
            funeral_program_photo_path: data.funeral_program_photo_path || null,
            notify_list: data.notify_list || [],
          });
          // notify_list is no longer the source of truth — see notifyList
          // derivation above. Skipped intentionally.
          setVideoFileName(data.service_video_path ? data.service_video_path.split('/').pop() || null : null);
          setVideoUrlInput(data.service_video_url || '');
        }
      } catch (err) {
        console.error('Failed to load final wishes:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
    // Family roster loads in parallel — failure is non-blocking; the picker just
    // shows no options and the user can still use "Add new person".
    getFamilyMembers()
      .then(setFamilyAndFriends)
      .catch((err) => console.error('Failed to load family members:', err));
  }, []);

  // ── Field update helpers ────────────────────────────────────────────────
  function updateField<K extends keyof FinalWishes>(key: K, value: FinalWishes[K], immediate = false) {
    setWishes((prev) => ({ ...prev, [key]: value }));
    scheduleSave({ [key]: value }, immediate);
  }

  // Pill selections save immediately
  function updatePill<K extends keyof FinalWishes>(key: K, value: FinalWishes[K]) {
    updateField(key, value, true);
  }

  // ── Notify list helpers ─────────────────────────────────────────────────
  // Single source of truth is family_members.notify. The Final Wishes Q3 picker
  // is just a view onto the same field; toggling here updates the row.
  async function addFromContacts(member: FamilyMember) {
    if (member.notify) return; // already on
    try {
      await updateFamilyMember(member.id, { notify: true });
    } catch (err) {
      console.error('Failed to add to notify:', err);
    }
    // Refresh roster so eligible/selected lists recompute.
    getFamilyMembers().then(setFamilyAndFriends).catch(() => {});
  }

  // Create a brand-new person on the family & friends roster. Server defaults
  // relationship='friend' and notify=true, so the new person lands on the
  // notify list automatically.
  async function addNewPerson(name: string, contact: string) {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const isEmail = contact.includes('@');
    await addFamilyMember({
      display_name: trimmedName,
      email: isEmail ? contact.trim() : null,
      phone: !isEmail && contact.trim() ? contact.trim() : null,
      relationship: 'friend',
      // notify default is true server-side; pass explicitly so the intent is
      // visible at the call site.
      notify: true,
    });
    // Refresh roster — picker derives selected vs eligible from this list.
    getFamilyMembers().then(setFamilyAndFriends).catch(() => {});
  }

  // Remove from notify list = toggle notify=false. We never delete the row
  // here; the person stays on the family & friends roster as a contact, just
  // not on the "tell them when the guide activates" list.
  async function removePerson(id: string) {
    try {
      await updateFamilyMember(id, { notify: false });
    } catch (err) {
      console.error('Failed to remove from notify:', err);
    }
    getFamilyMembers().then(setFamilyAndFriends).catch(() => {});
  }

  // ── Video upload ────────────────────────────────────────────────────────
  async function handleVideoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingVideo(true);
    try {
      const formData = new FormData();
      formData.append('video', file);
      const res = await fetchWithAuth('/final-wishes/video', USER_ID, {
        method: 'POST',
        body: formData,
      });
      setVideoFileName(res.file_name);
      setWishes((prev) => ({ ...prev, service_video_path: res.path, service_video_url: '' }));
      setVideoUrlInput('');
    } catch (err) {
      alert('Video upload failed. Please try again.');
    } finally {
      setUploadingVideo(false);
    }
  }

  // ── Video record ────────────────────────────────────────────────────────
  // Browser-recorded Blob shape — webm from <Recorder type="video">. Same
  // /final-wishes/video endpoint as upload; multer just sees a different
  // mimetype + filename. The Recorder enforces its own 200MB / duration caps
  // before this fires, so the only failure mode here is server-side.
  async function handleVideoRecord(blob: Blob) {
    setUploadingVideo(true);
    try {
      // Construct an honest-to-goodness File. Blob-with-filename is supposed to
      // work the same way, but in practice a Blob whose `type` is empty (some
      // browser/codec combos) gets uploaded as Content-Type: text/plain, which
      // multer rejects. File constructor takes explicit type + name and the
      // browser is required to respect both — bulletproof.
      const file = new File([blob], 'service-recording.webm', {
        type: blob.type && blob.type.startsWith('video/') ? blob.type : 'video/webm',
      });
      const formData = new FormData();
      formData.append('video', file);
      const res = await fetchWithAuth('/final-wishes/video', USER_ID, {
        method: 'POST',
        body: formData,
      });
      setVideoFileName(res.file_name || 'service-recording.webm');
      setWishes((prev) => ({ ...prev, service_video_path: res.path, service_video_url: '' }));
      setVideoUrlInput('');
    } catch (err: any) {
      // Surface the server's specific message (e.g. multer's "Invalid video type")
      // instead of a generic "try again" alert. fetchWithAuth throws an Error with
      // the message field from the server's JSON error body.
      alert(`Video save failed: ${err?.message || 'unknown error'}`);
      // Re-throw so the Recorder's inline banner shows the same message and
      // keeps the just-recorded blob queued for retry (don't make the user re-record).
      throw err;
    } finally {
      setUploadingVideo(false);
    }
  }

  async function handleRemoveVideo() {
    try {
      await fetchWithAuth('/final-wishes/video', USER_ID, { method: 'DELETE' });
      setVideoFileName(null);
      setVideoUrlInput('');
      setWishes((prev) => ({ ...prev, service_video_path: null, service_video_url: '' }));
    } catch (err) {
      alert('Failed to remove video.');
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-10 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="space-y-2">
        <h1 className="font-playfair text-4xl font-black text-navy">
          Final Wishes
        </h1>
        <p className="text-zinc-500">
          Your service, your way. Leave no doubt about what matters most.
        </p>
      </header>

      {/* Save indicator — sticky top-right */}
      <SaveIndicator status={saveStatus} savedAt={savedAt} onRetry={retrySave} />

      {/* Q1: Service */}
      <SectionCard>
        <FieldLabel label="What kind of service do you want?" />
        <PillGroup
          options={SERVICE_OPTIONS}
          value={wishes.service_type}
          onChange={(v) => updatePill('service_type', v || null)}
        />
        <textarea
          value={wishes.service_notes}
          onChange={(e) => updateField('service_notes', e.target.value)}
          placeholder="Specific songs, readings, where to gather after, anything else you'd like..."
          rows={4}
          className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-5 py-4 text-navy outline-none focus:border-gold transition-all resize-none text-sm"
        />

        {/* Video */}
        <div className="space-y-3 pt-2">
          <FieldLabel
            label="A video to play at your service"
            hint="A message, a memory, something that captures who you are."
          />
          <div className="flex gap-1 p-1 bg-zinc-100 rounded-xl w-fit">
            {(['upload', 'link', 'record'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setVideoMode(m)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  videoMode === m ? 'bg-white text-navy shadow-sm' : 'text-zinc-400 hover:text-navy'
                }`}
              >
                {m === 'upload' ? 'Upload File' : m === 'link' ? 'Paste Link' : 'Record'}
              </button>
            ))}
          </div>

          {(videoFileName || wishes.service_video_path) && (
            <div className="space-y-3">
              {/* Inline player. The browser proxies through /storage/* which is
                  session-gated by requireStorageAccess; crossOrigin=use-credentials
                  carries the cookie so the gate sees the session. object-contain
                  preserves aspect ratio inside the rounded frame.
                  preload="metadata" loads just enough to render the first frame
                  + duration so the user can scrub — not the whole 200 MB blob. */}
              {wishes.service_video_path && (
                <video
                  key={wishes.service_video_path}
                  src={`${API_BASE_URL}/storage/${wishes.service_video_path}`}
                  controls
                  preload="metadata"
                  crossOrigin="use-credentials"
                  className="w-full rounded-2xl bg-black aspect-video object-contain"
                />
              )}
              <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
                <CheckCircle2 size={16} className="text-primary shrink-0" />
                <span className="text-sm font-bold text-navy flex-1 truncate">{videoFileName || 'Video uploaded'}</span>
                <button
                  onClick={handleRemoveVideo}
                  aria-label="Delete video and record again"
                  title="Delete video and record again"
                  className="text-zinc-400 hover:text-red-500 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}

          {videoMode === 'upload' && !videoFileName && (
            <>
              <input ref={videoInputRef} type="file" accept="video/mp4,video/quicktime" className="hidden" onChange={handleVideoUpload} />
              <button
                onClick={() => videoInputRef.current?.click()}
                disabled={uploadingVideo}
                className="w-full border-2 border-dashed border-zinc-200 rounded-2xl py-8 flex flex-col items-center gap-3 text-zinc-400 hover:border-navy/30 hover:text-navy transition-all disabled:opacity-50"
              >
                {uploadingVideo ? <Loader2 size={24} className="animate-spin" /> : <Upload size={24} />}
                <span className="text-sm font-bold">{uploadingVideo ? 'Uploading...' : 'Click to upload MP4 or MOV'}</span>
              </button>
            </>
          )}

          {videoMode === 'link' && (
            <div className="relative">
              <LinkIcon size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="url"
                value={videoUrlInput}
                onChange={(e) => { setVideoUrlInput(e.target.value); updateField('service_video_url' as any, e.target.value); }}
                placeholder="https://youtube.com/... or https://vimeo.com/..."
                className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl pl-10 pr-5 py-4 text-navy outline-none focus:border-gold transition-all text-sm"
              />
            </div>
          )}

          {/* In-browser video recording. Hidden once a video exists for this guide
              — the saved-file row above (already covers BOTH upload and record paths
              via service_video_path / videoFileName) replaces it until removed. */}
          {videoMode === 'record' && !videoFileName && !wishes.service_video_path && (
            <Recorder type="video" onSave={handleVideoRecord} />
          )}
        </div>
      </SectionCard>

      {/* Photos for the family */}
      <SectionCard>
        <FieldLabel
          label="Photos for the family"
          hint="Two photos your family will use when the time comes. Pick ones you'd want remembered."
        />
        <div className="flex flex-col md:flex-row gap-4">
          <PhotoTile
            label="Obituary photo"
            tag="obituary"
            currentPath={wishes.obituary_photo_path}
            onUploaded={(path) => setWishes(prev => ({ ...prev, obituary_photo_path: path }))}
            onRemoved={() => setWishes(prev => ({ ...prev, obituary_photo_path: null }))}
          />
          <PhotoTile
            label="Funeral program photo"
            tag="funeral_program"
            currentPath={wishes.funeral_program_photo_path}
            onUploaded={(path) => setWishes(prev => ({ ...prev, funeral_program_photo_path: path }))}
            onRemoved={() => setWishes(prev => ({ ...prev, funeral_program_photo_path: null }))}
          />
        </div>
      </SectionCard>

      {/* Q2: Body */}
      <SectionCard>
        <FieldLabel label="What would you like done with your body?" />
        <PillGroup
          options={BODY_OPTIONS}
          value={wishes.body_preference}
          onChange={(v) => updatePill('body_preference', v || null)}
        />
        <textarea
          value={wishes.body_notes}
          onChange={(e) => updateField('body_notes', e.target.value)}
          placeholder="Open or closed casket, where to scatter ashes, any other specifics..."
          rows={3}
          className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-5 py-4 text-navy outline-none focus:border-gold transition-all resize-none text-sm"
        />
      </SectionCard>

      {/* Q3: Notify list */}
      <SectionCard>
        <FieldLabel
          label="Who should be notified?"
          hint="People outside the immediate family — old friends, colleagues, anyone your family might not think to call. Your immediate family (spouse, children) doesn't need to be on this list — they'll receive the released files automatically."
        />
        <NotifyListPicker
          notifyList={notifyList}
          familyAndFriends={familyAndFriends}
          onAddFromContacts={addFromContacts}
          onAddNewPerson={addNewPerson}
          onRemove={removePerson}
        />
      </SectionCard>

      {/* Obituary */}
      <SectionCard>
        <FieldLabel
          label="Obituary"
          hint="Optional — but something your family will keep forever. Doesn't need to be polished. Write it in your own words, whenever it feels right."
        />
        <div className="space-y-1">
          <textarea
            value={wishes.obituary_own_words}
            onChange={(e) => updateField('obituary_own_words', e.target.value.slice(0, 1500))}
            placeholder="Write anything you'd like people to know about you — your life, your loves, what mattered most..."
            rows={9}
            className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-5 py-4 text-navy outline-none focus:border-gold transition-all resize-none text-sm"
          />
          <div className="text-right text-[10px] text-zinc-400 font-bold pr-1">
            {wishes.obituary_own_words.length} / 1500
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
