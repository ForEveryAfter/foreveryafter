'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronRight, ShieldCheck, CheckCircle } from 'lucide-react';

const FAMILY_MEMBERS = [
  { id: 'kevin', name: 'Kevin Lee', email: 'kevin_lee@hotmail.com', relationship: 'Brother', initials: 'KL', color: 'bg-blue-100 text-blue-700' },
  { id: 'dorothy', name: 'Dorothy Lee', email: 'dorothy_lee@hotmail.com', relationship: 'Mother', initials: 'DL', color: 'bg-amber-100 text-amber-700' },
];

export default function SetupTrustedRepPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<string>('kevin');
  const [confirmed, setConfirmed] = useState(false);

  const handleFinish = () => {
    console.log('[MOCK] Trusted Representative set to:', selected);
    console.log('[MOCK] Abbreviated onboarding complete for Myron Lee');
    setConfirmed(true);
    setTimeout(() => router.push('/dashboard/child/overview'), 2000);
  };

  if (confirmed) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6 font-inter text-navy">
        <div className="text-center space-y-6 max-w-md">
          <div className="w-20 h-20 bg-[#1E3A5F]/5 rounded-[28px] flex items-center justify-center mx-auto">
            <CheckCircle className="w-10 h-10 text-[#1E3A5F]" />
          </div>
          <h1 className="font-playfair text-3xl font-black">Your guide is ready.</h1>
          <p className="text-zinc-500">Redirecting to your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 font-inter text-navy">
      <div className="mb-10">
        <div className="flex items-center gap-3 text-zinc-300 text-sm mb-4">
          <span className="text-[#1E3A5F] font-bold">Step 1</span>
          <ChevronRight className="w-4 h-4" />
          <span className="text-[#1E3A5F] font-bold">Step 2</span>
          <ChevronRight className="w-4 h-4" />
          <span className="text-navy font-bold">Step 3: Trusted Representative</span>
        </div>
        <h1 className="font-playfair text-3xl font-black mb-2">Who do you trust most?</h1>
        <p className="text-zinc-500">Your Trusted Representative will be the first point of contact when your guide activates.</p>
      </div>

      {/* Selection Cards */}
      <div className="space-y-4 mb-8">
        {FAMILY_MEMBERS.map((person) => {
          const isSelected = selected === person.id;
          return (
            <div
              key={person.id}
              onClick={() => setSelected(person.id)}
              className={`bg-white rounded-2xl border-2 p-6 flex items-center justify-between cursor-pointer transition-all ${
                isSelected ? 'border-[#1E3A5F] shadow-md' : 'border-zinc-100 hover:border-zinc-200'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm ${person.color}`}>
                  {person.initials}
                </div>
                <div>
                  <h3 className="font-bold text-navy">{person.name}</h3>
                  <p className="text-xs text-zinc-400">{person.email} · {person.relationship}</p>
                </div>
              </div>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                isSelected ? 'bg-[#1E3A5F] border-[#1E3A5F]' : 'border-zinc-200'
              }`}>
                {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
              </div>
            </div>
          );
        })}
      </div>

      {/* TR Explanation */}
      <div className="bg-zinc-50 rounded-2xl p-6 mb-10 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-[#1E3A5F]" />
          <h3 className="text-sm font-bold text-navy">What a Trusted Representative can do</h3>
        </div>
        <ul className="space-y-2">
          {[
            'Extend your check-in windows',
            'Request early access on behalf of the family',
            'Coordinate with other recipients',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-zinc-500">
              <Check className="w-4 h-4 text-teal-500 shrink-0 mt-0.5" /> {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center">
        <button onClick={() => router.back()} className="text-sm text-zinc-400 hover:text-navy font-medium">
          ← Back
        </button>
        <button
          onClick={handleFinish}
          className="bg-[#1E3A5F] text-white font-bold px-8 py-4 rounded-xl hover:bg-[#1E3A5F]/90 transition-all flex items-center gap-2"
        >
          Finish setup <CheckCircle className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
