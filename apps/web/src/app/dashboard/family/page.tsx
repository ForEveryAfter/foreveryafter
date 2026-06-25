'use client';

import React, { useState, useEffect } from 'react';
import { Edit2, Plus, X, Trash2, AlertTriangle, CheckCircle, Shield, ChevronDown, Loader2 } from 'lucide-react';
import { getFamilyMembers, addFamilyMember, updateFamilyMember, type FamilyMember } from '@/lib/api';

type Person = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  relationship: string;
  type: 'family' | 'friend';
  notify: boolean;
  isPrimaryAccess?: boolean;
  avatarColor: string;
};

// Whether a row belongs in the "Family" section vs "Friends" section. Anything
// not in this set (friend, neighbor, attorney, null, etc.) is a friend.
const FAMILY_RELATIONSHIPS = new Set([
  'spouse', 'son', 'daughter', 'mother', 'father', 'parent', 'sister', 'brother', 'sibling',
]);

const RELATIONSHIPS = ['Spouse', 'Son', 'Daughter', 'Brother', 'Sister', 'Parent', 'Friend', 'Neighbor', 'Attorney', 'Financial Advisor', 'Other'];

// Stable, hash-derived avatar color so the same person always gets the same
// chip regardless of where they appear on the page.
const AVATAR_COLORS = [
  'bg-amber-100 text-amber-700',
  'bg-blue-100 text-blue-700',
  'bg-rose-100 text-rose-700',
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
  'bg-orange-100 text-orange-700',
  'bg-teal-100 text-teal-700',
];
function avatarFor(id: string): string {
  let hash = 0;
  for (const c of id) hash = (hash + c.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function splitName(displayName: string): { firstName: string; lastName: string } {
  const parts = (displayName || '').trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function titleCase(s: string | null): string {
  if (!s) return '';
  return s[0].toUpperCase() + s.slice(1).toLowerCase();
}

function toPerson(m: FamilyMember, primaryTiId: string | null): Person {
  const rel = (m.relationship || '').toLowerCase();
  const isFamily = FAMILY_RELATIONSHIPS.has(rel);
  const { firstName, lastName } = splitName(m.display_name);
  return {
    id: m.id,
    firstName,
    lastName,
    email: m.email || '',
    mobile: m.phone || '',
    relationship: titleCase(m.relationship) || 'Friend',
    type: isFamily ? 'family' : 'friend',
    // notify lives on family_members.notify (default true server-side).
    notify: m.notify,
    isPrimaryAccess: m.id === primaryTiId,
    avatarColor: avatarFor(m.id),
  };
}

export default function FamilyPage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [friends, setFriends] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPerson, setNewPerson] = useState({
    firstName: '', lastName: '', email: '', mobile: '', relationship: 'Friend',
  });

  async function loadRoster() {
    setLoadError(null);
    try {
      const members = await getFamilyMembers();
      // TODO(primary-ti-badge): a real primaryTiId comes from the user's
      // guides row (guides.primary_ti_member_id). Skipping the lookup for now;
      // it'll be a single extra GET to /settings/guide when we wire it.
      const primaryTiId: string | null = null;
      const persons = members.map((m) => toPerson(m, primaryTiId));
      setPeople(persons.filter((p) => p.type === 'family'));
      setFriends(persons.filter((p) => p.type === 'friend'));
    } catch (err: any) {
      setLoadError(err?.message || 'Could not load your family & friends right now.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadRoster(); }, []);
  const [duplicateEmail, setDuplicateEmail] = useState<Person | null>(null);
  const [duplicatePhone, setDuplicatePhone] = useState<Person | null>(null);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [removeWarning, setRemoveWarning] = useState<string | null>(null);

  const allPeople = [...people, ...friends];

  // Persist the notify flag to family_members.notify. Optimistic update of
  // both lists (the person might be in `people` OR `friends`) so the toggle
  // feels instant; on PATCH failure we revert + show the load banner.
  const toggleNotify = async (id: string) => {
    const inPeople = people.find((p) => p.id === id);
    const inFriends = friends.find((p) => p.id === id);
    const current = inPeople || inFriends;
    if (!current) return;
    const next = !current.notify;
    if (inPeople) setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, notify: next } : p)));
    if (inFriends) setFriends((prev) => prev.map((p) => (p.id === id ? { ...p, notify: next } : p)));
    try {
      await updateFamilyMember(id, { notify: next });
    } catch (err: any) {
      // Revert.
      if (inPeople) setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, notify: !next } : p)));
      if (inFriends) setFriends((prev) => prev.map((p) => (p.id === id ? { ...p, notify: !next } : p)));
      setLoadError(err?.message || 'Could not save that change.');
    }
  };

  const checkDuplicates = () => {
    const emailMatch = allPeople.find(p => p.email.toLowerCase() === newPerson.email.toLowerCase());
    const phoneMatch = newPerson.mobile ? allPeople.find(p => p.mobile && p.mobile === newPerson.mobile) : null;
    setDuplicateEmail(emailMatch || null);
    setDuplicatePhone(phoneMatch || null);
    return !!emailMatch;
  };

  const handleAddPerson = async () => {
    if (!newPerson.firstName || !newPerson.email) return;
    const hasDupe = checkDuplicates();
    if (hasDupe && !confirmDuplicate) return;

    setAdding(true);
    try {
      // POST to /settings/family — server defaults relationship to 'friend' if
      // we don't pass one, but we always pass it (from the form) for clarity.
      await addFamilyMember({
        display_name: `${newPerson.firstName} ${newPerson.lastName}`.trim(),
        email: newPerson.email || null,
        phone: newPerson.mobile || null,
        relationship: newPerson.relationship.toLowerCase(),
      });
      // Refetch so the new row gets sorted into Family vs Friends correctly.
      await loadRoster();
      setNewPerson({ firstName: '', lastName: '', email: '', mobile: '', relationship: 'Friend' });
      setShowAddForm(false);
      setDuplicateEmail(null);
      setDuplicatePhone(null);
      setConfirmDuplicate(false);
    } catch (err: any) {
      // Keep the form open with the values intact so the user can retry.
      setLoadError(err?.message || 'Could not add this person right now.');
    } finally {
      setAdding(false);
    }
  };

  // TODO(remove-persistence): no DELETE /settings/family/:id yet. Removing here
  // currently just hides the row in local state; on next page load it'll be
  // back. Mark this as a follow-up — add the DELETE endpoint, then call it
  // from this handler and refetch via loadRoster().
  const handleRemovePerson = (id: string) => {
    const person = allPeople.find(p => p.id === id);
    if (person?.isPrimaryAccess) {
      setRemoveWarning(id);
      return;
    }
    setPeople(prev => prev.filter(p => p.id !== id));
    setFriends(prev => prev.filter(p => p.id !== id));
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10 font-inter text-navy">
        <h1 className="font-playfair text-3xl font-black mb-2">Family &amp; Friends</h1>
        <p className="text-zinc-500 mb-10">Manage the people connected to your guide.</p>
        <div className="flex items-center gap-2 text-zinc-400 text-sm py-10">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 font-inter text-navy">
      <div className="mb-10">
        <h1 className="font-playfair text-3xl font-black mb-2">Family & Friends</h1>
        <p className="text-zinc-500">Manage the people connected to your guide.</p>
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-2xl px-5 py-3 mb-6 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{loadError}</span>
          <button onClick={() => { setLoadError(null); loadRoster(); }} className="font-bold underline">Retry</button>
        </div>
      )}

      {/* Family Section */}
      <div className="mb-14">
        <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-6">Family</h2>
        <div className="space-y-4">
          {people.map((person) => (
            <div key={person.id} className="bg-white rounded-3xl border border-zinc-100 shadow-sm p-6 flex items-center justify-between gap-4">
              <div className="flex items-center gap-5">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm ${person.avatarColor}`}>
                  {person.firstName[0]}{person.lastName[0]}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-navy">{person.firstName} {person.lastName}</h3>
                    <span className="text-[10px] font-bold uppercase tracking-widest bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full">
                      {person.relationship}
                    </span>
                    {person.isPrimaryAccess && (
                      <span className="text-[10px] font-bold uppercase tracking-widest bg-teal-50 text-teal-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Shield className="w-2.5 h-2.5" /> Primary access
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-zinc-400 mt-0.5">{person.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {/* Notify Toggle */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-300">Notify</span>
                  <div
                    onClick={() => toggleNotify(person.id)}
                    className={`w-10 h-6 rounded-full flex items-center px-0.5 cursor-pointer transition-colors ${person.notify ? 'bg-[#4A5E52]' : 'bg-zinc-200'}`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${person.notify ? 'translate-x-4' : 'translate-x-0'}`} />
                  </div>
                </div>

                <button className="text-zinc-300 hover:text-navy text-sm font-medium transition-colors">
                  Edit
                </button>
                <button
                  onClick={() => handleRemovePerson(person.id)}
                  aria-label={`Remove ${person.firstName}`}
                  className="text-zinc-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Friends Section */}
      <div className="mb-10">
        <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-6">Friends</h2>

        {friends.length === 0 && !showAddForm && (
          <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm p-10 text-center space-y-3">
            <p className="text-zinc-400 font-medium">No friends added yet.</p>
            <p className="text-xs text-zinc-300 max-w-md mx-auto">
              Friends are notified when your guide activates — for example, if they&apos;re named in a special occasion video or a final wish.
            </p>
          </div>
        )}

        {friends.length > 0 && (
          <div className="space-y-4 mb-6">
            {friends.map((person) => (
              <div key={person.id} className="bg-white rounded-3xl border border-zinc-100 shadow-sm p-6 flex items-center justify-between gap-4">
                <div className="flex items-center gap-5">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm ${person.avatarColor}`}>
                    {person.firstName[0]}{person.lastName[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-navy">{person.firstName} {person.lastName}</h3>
                      <span className="text-[10px] font-bold uppercase tracking-widest bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full">
                        {person.relationship}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-400 mt-0.5">{person.email}</p>
                  </div>
                </div>

                {/* Same right-cluster as the Family section: notify toggle +
                    Edit + Remove. The toggle's onClick writes through to
                    family_members.notify via PATCH; UI is optimistic. */}
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-300">Notify</span>
                    <div
                      onClick={() => toggleNotify(person.id)}
                      role="switch"
                      aria-checked={person.notify}
                      className={`w-10 h-6 rounded-full flex items-center px-0.5 cursor-pointer transition-colors ${person.notify ? 'bg-[#4A5E52]' : 'bg-zinc-200'}`}
                    >
                      <div className={`w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${person.notify ? 'translate-x-4' : 'translate-x-0'}`} />
                    </div>
                  </div>
                  <button className="text-zinc-300 hover:text-navy text-sm font-medium transition-colors">
                    Edit
                  </button>
                  <button
                    onClick={() => handleRemovePerson(person.id)}
                    aria-label={`Remove ${person.firstName}`}
                    className="text-zinc-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Person Button */}
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full py-4 border-2 border-dashed border-zinc-200 rounded-2xl flex items-center justify-center gap-2 text-zinc-400 hover:text-[#4A5E52] hover:border-[#4A5E52]/30 transition-all font-bold text-sm mt-4"
          >
            <Plus className="w-5 h-5" /> Add a person
          </button>
        )}

        {/* Inline Add Form */}
        {showAddForm && (
          <div className="bg-white rounded-3xl border border-zinc-100 shadow-lg p-8 mt-4 space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-navy text-lg">Add a person</h3>
              <button onClick={() => { setShowAddForm(false); setDuplicateEmail(null); setDuplicatePhone(null); }} className="p-1 hover:bg-zinc-50 rounded-lg">
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">First Name</label>
                <input
                  type="text"
                  value={newPerson.firstName}
                  onChange={(e) => setNewPerson({ ...newPerson, firstName: e.target.value })}
                  className="w-full bg-zinc-50 border-none rounded-xl p-3 focus:ring-1 focus:ring-[#4A5E52] transition-all text-sm"
                  placeholder="e.g. James"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Last Name</label>
                <input
                  type="text"
                  value={newPerson.lastName}
                  onChange={(e) => setNewPerson({ ...newPerson, lastName: e.target.value })}
                  className="w-full bg-zinc-50 border-none rounded-xl p-3 focus:ring-1 focus:ring-[#4A5E52] transition-all text-sm"
                  placeholder="e.g. Peterson"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Email</label>
                <input
                  type="email"
                  value={newPerson.email}
                  onChange={(e) => {
                    setNewPerson({ ...newPerson, email: e.target.value });
                    setDuplicateEmail(null);
                    setConfirmDuplicate(false);
                  }}
                  onBlur={checkDuplicates}
                  className="w-full bg-zinc-50 border-none rounded-xl p-3 focus:ring-1 focus:ring-[#4A5E52] transition-all text-sm"
                  placeholder="email@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Mobile (optional)</label>
                <input
                  type="tel"
                  value={newPerson.mobile}
                  onChange={(e) => {
                    setNewPerson({ ...newPerson, mobile: e.target.value });
                    setDuplicatePhone(null);
                  }}
                  onBlur={checkDuplicates}
                  className="w-full bg-zinc-50 border-none rounded-xl p-3 focus:ring-1 focus:ring-[#4A5E52] transition-all text-sm"
                  placeholder="555-000-0000"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Relationship</label>
              <div className="relative">
                <select
                  value={newPerson.relationship}
                  onChange={(e) => setNewPerson({ ...newPerson, relationship: e.target.value })}
                  className="w-full bg-zinc-50 border-none rounded-xl p-3 appearance-none focus:ring-1 focus:ring-[#4A5E52] transition-all text-sm"
                >
                  {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-300 pointer-events-none" />
              </div>
            </div>

            {/* Duplicate Email Warning */}
            {duplicateEmail && (
              <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl space-y-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-amber-800">
                      This email matches {duplicateEmail.firstName} {duplicateEmail.lastName}.
                    </p>
                    <p className="text-xs text-amber-600 mt-1">This person is already in your guide.</p>
                  </div>
                </div>
                <div className="flex gap-3 ml-8">
                  <button
                    onClick={() => { setShowAddForm(false); setDuplicateEmail(null); }}
                    className="text-xs font-bold text-amber-700 bg-amber-100 px-4 py-2 rounded-lg hover:bg-amber-200 transition-colors"
                  >
                    Yes, skip adding again
                  </button>
                  <button
                    onClick={() => { setConfirmDuplicate(true); setDuplicateEmail(null); }}
                    className="text-xs font-bold text-zinc-500 bg-white border border-zinc-200 px-4 py-2 rounded-lg hover:bg-zinc-50 transition-colors"
                  >
                    No, this is someone else
                  </button>
                </div>
              </div>
            )}

            {/* Duplicate Phone Warning */}
            {duplicatePhone && !duplicateEmail && (
              <div className="p-4 bg-amber-50/60 border border-amber-100/60 rounded-2xl flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-600">
                  This phone number is already used by <span className="font-bold">{duplicatePhone.firstName} {duplicatePhone.lastName}</span>. You can still add this person.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => { setShowAddForm(false); setDuplicateEmail(null); setDuplicatePhone(null); }}
                className="text-sm font-medium text-zinc-400 hover:text-navy px-4 py-2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddPerson}
                disabled={!newPerson.firstName || !newPerson.email || adding}
                className="bg-[#4A5E52] text-white font-bold text-sm px-6 py-3 rounded-xl hover:bg-[#4A5E52]/90 transition-all disabled:opacity-30 disabled:pointer-events-none flex items-center gap-2"
              >
                {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {adding ? 'Adding…' : 'Add person'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Remove Primary Warning Modal */}
      {removeWarning && (
        <div className="fixed inset-0 bg-navy/30 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h3 className="font-bold text-navy text-lg">Cannot remove primary access person</h3>
                <p className="text-sm text-zinc-500 mt-2 leading-relaxed">
                  You must set a new primary access person in <span className="font-bold text-navy">Settings</span> before removing this person from your guide.
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setRemoveWarning(null)}
                className="bg-[#4A5E52] text-white font-bold text-sm px-6 py-3 rounded-xl"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
