'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Users, ChevronRight, Shield } from 'lucide-react';

const FAMILY_MEMBERS = [
  { id: 'kevin', name: 'Kevin Lee', email: 'kevin_lee@hotmail.com', relationship: 'Brother', initials: 'KL', color: 'bg-blue-100 text-blue-700' },
  { id: 'dorothy', name: 'Dorothy Lee', email: 'dorothy_lee@hotmail.com', relationship: 'Mother', initials: 'DL', color: 'bg-amber-100 text-amber-700' },
];

export default function SetupRecipientsPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [primaryContact, setPrimaryContact] = useState<string>('');

  const toggleSelection = (id: string) => {
    setSelected(prev => {
      const next = prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id];
      if (next.length === 1) setPrimaryContact(next[0]);
      return next;
    });
  };

  const handleContinue = () => {
    console.log('[MOCK] Recipients selected:', selected, '| Primary:', primaryContact);
    router.push('/dashboard/child/setup/trusted-rep');
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 font-inter text-navy">
      <div className="mb-10">
        <div className="flex items-center gap-3 text-zinc-300 text-sm mb-4">
          <span className="text-[#1E3A5F] font-bold">Step 1</span>
          <ChevronRight className="w-4 h-4" />
          <span className="text-navy font-bold">Step 2: Recipients</span>
          <ChevronRight className="w-4 h-4" />
          <span>Step 3</span>
        </div>
        <h1 className="font-playfair text-3xl font-black mb-2">Who should be notified?</h1>
        <p className="text-zinc-500">Select the people who should know about your guide when the time comes.</p>
      </div>

      {/* Multi-Select Cards */}
      <div className="space-y-4 mb-8">
        {FAMILY_MEMBERS.map((person) => {
          const isSelected = selected.includes(person.id);
          return (
            <div
              key={person.id}
              onClick={() => toggleSelection(person.id)}
              className={`bg-white rounded-2xl border-2 p-6 flex items-center justify-between cursor-pointer transition-all ${
                isSelected ? 'border-[#1E3A5F] shadow-md' : 'border-zinc-100 hover:border-zinc-200'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm ${person.color}`}>
                  {person.initials}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-navy">{person.name}</h3>
                    {isSelected && primaryContact === person.id && (
                      <span className="text-[10px] font-bold uppercase tracking-widest bg-gold/10 text-gold px-2 py-0.5 rounded-full">
                        First contact
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400">{person.email} · {person.relationship}</p>
                </div>
              </div>
              <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                isSelected ? 'bg-[#1E3A5F] border-[#1E3A5F]' : 'border-zinc-200'
              }`}>
                {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
              </div>
            </div>
          );
        })}
      </div>

      {/* Primary Contact Selection */}
      {selected.length >= 2 && (
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6 mb-8 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Who should we contact first?</h3>
          <div className="space-y-3">
            {selected.map((id) => {
              const person = FAMILY_MEMBERS.find(p => p.id === id)!;
              return (
                <label
                  key={id}
                  className={`flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-colors ${
                    primaryContact === id ? 'bg-[#1E3A5F]/5' : 'hover:bg-zinc-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="primary"
                    checked={primaryContact === id}
                    onChange={() => setPrimaryContact(id)}
                    className="w-4 h-4 text-[#1E3A5F] accent-[#1E3A5F]"
                  />
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${person.color}`}>
                    {person.initials}
                  </div>
                  <span className="font-medium text-navy text-sm">{person.name}</span>
                  {primaryContact === id && (
                    <span className="text-[10px] font-bold uppercase tracking-widest bg-gold/10 text-gold px-2 py-0.5 rounded-full ml-auto">
                      First contact
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected Summary */}
      {selected.length > 0 && (
        <div className="flex items-center gap-3 mb-8">
          <div className="flex -space-x-2">
            {selected.map((id) => {
              const person = FAMILY_MEMBERS.find(p => p.id === id)!;
              return (
                <div key={id} className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[10px] ring-2 ring-white ${person.color}`}>
                  {person.initials}
                </div>
              );
            })}
          </div>
          <span className="text-sm text-zinc-500">{selected.length} recipient{selected.length > 1 ? 's' : ''} selected</span>
        </div>
      )}

      {/* Continue */}
      <div className="flex justify-between items-center">
        <button onClick={() => router.back()} className="text-sm text-zinc-400 hover:text-navy font-medium">
          ← Back
        </button>
        <button
          onClick={handleContinue}
          disabled={selected.length === 0}
          className="bg-[#1E3A5F] text-white font-bold px-8 py-4 rounded-xl hover:bg-[#1E3A5F]/90 transition-all disabled:opacity-30 disabled:pointer-events-none flex items-center gap-2"
        >
          Continue <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
