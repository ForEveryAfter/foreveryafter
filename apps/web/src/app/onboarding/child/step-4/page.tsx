'use client';

import React from 'react';
import OnboardingLayout from '@/components/onboarding/OnboardingLayout';
import { useOnboarding } from '@/components/onboarding/OnboardingContext';
import { Users, Plus, Trash2 } from 'lucide-react';

export default function Step4Page() {
  const { state, updateState } = useOnboarding();

  const handleUpdate = (index: number, updates: any) => {
    const newSiblings = [...state.siblings];
    newSiblings[index] = { ...newSiblings[index], ...updates };
    updateState({ siblings: newSiblings });
  };

  const addSibling = () => {
    updateState({ 
      siblings: [...state.siblings, { name: '', email: '', relationship: 'sibling' }] 
    });
  };

  const removeSibling = (index: number) => {
    updateState({ 
      siblings: state.siblings.filter((_, i) => i !== index) 
    });
  };

  return (
    <OnboardingLayout
      step={4}
      title="Are there siblings or co-guides?"
      subtitle="Adding your siblings now ensures everyone has visibility when the moment comes. You'll all be co-guides together."
      nextHref="/onboarding/child/summary"
      prevHref="/onboarding/child/step-3"
      showSkip
      showBypass
    >
      <div className="space-y-8">
        <div className="space-y-4">
          {state.siblings.map((sibling, index) => (
            <div key={index} className="bg-white p-6 rounded-2xl border border-zinc-100 shadow-sm flex flex-col md:flex-row gap-4 relative group">
              <button 
                onClick={() => removeSibling(index)}
                className="absolute -top-2 -right-2 w-8 h-8 bg-white border border-zinc-100 rounded-full flex items-center justify-center text-zinc-300 hover:text-red-500 hover:border-red-100 shadow-sm transition-all md:opacity-0 group-hover:opacity-100"
              >
                <X className="w-4 h-4" />
              </button>
              
              <div className="flex-1 space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-300">Name</label>
                <input 
                  type="text" 
                  value={sibling.name}
                  onChange={(e) => handleUpdate(index, { name: e.target.value })}
                  className="w-full bg-zinc-50 border-none rounded-xl p-3 focus:ring-1 focus:ring-primary transition-all text-sm"
                  placeholder="e.g. Kevin Lee"
                />
              </div>
              <div className="flex-1 space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-300">Email Address</label>
                <input 
                  type="email" 
                  value={sibling.email}
                  onChange={(e) => handleUpdate(index, { email: e.target.value })}
                  className="w-full bg-zinc-50 border-none rounded-xl p-3 focus:ring-1 focus:ring-primary transition-all text-sm"
                  placeholder="sibling@example.com"
                />
              </div>
              <div className="md:w-32 space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-300">Role</label>
                <select 
                  value={sibling.relationship}
                  onChange={(e) => handleUpdate(index, { relationship: e.target.value })}
                  className="w-full bg-zinc-50 border-none rounded-xl p-3 focus:ring-1 focus:ring-primary transition-all text-sm"
                >
                  <option value="brother">Brother</option>
                  <option value="sister">Sister</option>
                  <option value="sibling">Sibling</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          ))}
        </div>

        <button 
          onClick={addSibling}
          className="w-full py-4 border-2 border-dashed border-zinc-200 rounded-2xl flex items-center justify-center gap-2 text-zinc-400 hover:text-primary hover:border-primary/30 transition-all font-bold text-sm"
        >
          <Plus className="w-5 h-5" /> Add another sibling
        </button>

        <div className="p-6 bg-gold/5 rounded-2xl border border-gold/10 flex gap-4">
          <div className="w-10 h-10 bg-gold/10 rounded-xl flex items-center justify-center flex-shrink-0 text-gold">
            <Users className="w-5 h-5" />
          </div>
          <p className="text-sm text-zinc-600 leading-relaxed">
            <span className="font-bold text-zinc-800">The Power of Co-Guides:</span> Adding siblings now distributes the emotional weight. You'll be able to see progress and contribute stories together.
          </p>
        </div>
      </div>
    </OnboardingLayout>
  );
}

import { X } from 'lucide-react';
