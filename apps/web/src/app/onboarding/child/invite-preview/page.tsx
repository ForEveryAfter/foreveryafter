'use client';

import React, { Suspense, useState } from 'react';
import OnboardingLayout from '@/components/onboarding/OnboardingLayout';
import { useOnboarding } from '@/components/onboarding/OnboardingContext';
import { Mail, Loader2, Edit3, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { sendEmail } from '@/lib/mock-email';

type EditableFieldProps = {
  value: string;
  onChange: (val: string) => void;
  label: string;
};

const EditableField = ({ value, onChange, label }: EditableFieldProps) => {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <div className="inline-block min-w-[200px]">
        <input 
          autoFocus
          className="w-full bg-amber-50 border-b-2 border-amber-400 focus:outline-none py-1 text-inherit font-inherit"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setIsEditing(false)}
          onKeyDown={(e) => e.key === 'Enter' && setIsEditing(false)}
        />
      </div>
    );
  }

  return (
    <span 
      onClick={() => setIsEditing(true)}
      className="inline-block transition-all cursor-pointer group relative"
    >
      <span className="border-b-2 border-amber-100 border-dashed group-hover:bg-amber-50 group-hover:border-amber-400 px-1 py-0.5 rounded transition-all">
        {value}
      </span>
      <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-navy text-white text-[8px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase font-bold tracking-widest">
        Click to edit {label}
      </span>
    </span>
  );
};

function InvitePreviewContent() {
  const { state, updateState } = useOnboarding();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isFree = searchParams.get('plan') === 'free';
  
  const [currentParent, setCurrentParent] = useState<'parent1' | 'parent2'>(
    state.parent2.active ? 'parent1' : 'parent1'
  );
  const [sending, setSending] = useState(false);

  const parent = currentParent === 'parent1' ? state.parent1 : state.parent2;
  const isSecondParent = currentParent === 'parent2';

  const handleSend = async () => {
    setSending(true);
    
    // Log calls to console as per spec
    await sendEmail(
      state.parent1.email, 
      "I'm starting a ForEveryAfter for us", 
      state.personalNotes.parent1
    );

    if (state.parent2.active) {
      await sendEmail(
        state.parent2.email, 
        "I'm starting a ForEveryAfter for us", 
        state.personalNotes.parent2
      );
    }

    router.push('/onboarding/child/confirmation');
  };

  return (
    <OnboardingLayout
      step={7}
      title="Preview the invitation."
      subtitle="The best stories start with a simple hello. We've drafted a warm message, but you can override it if you like."
      prevHref="/onboarding/child/pricing"
    >
      <div className="space-y-12">
        {/* Parent Tabs (if active) */}
        {state.parent2.active && (
          <div className="flex gap-2 p-1 bg-zinc-100 rounded-2xl w-fit">
            <button 
              onClick={() => setCurrentParent('parent1')}
              className={`px-6 py-3 rounded-xl font-bold text-sm transition-all ${currentParent === 'parent1' ? 'bg-white shadow-sm text-navy' : 'text-zinc-400 hover:text-navy'}`}
            >
              Preview {state.parent1.name.split(' ')[0]}'s
            </button>
            <button 
              onClick={() => setCurrentParent('parent2')}
              className={`px-6 py-3 rounded-xl font-bold text-sm transition-all ${currentParent === 'parent2' ? 'bg-white shadow-sm text-navy' : 'text-zinc-400 hover:text-navy'}`}
            >
              Preview {state.parent2.name.split(' ')[0]}'s
            </button>
          </div>
        )}

        {/* Email Envelope View */}
        <div className="bg-white rounded-[40px] shadow-2xl border border-zinc-100 overflow-hidden max-w-xl mx-auto ring-1 ring-zinc-100/50">
          <div className="bg-zinc-50 px-8 py-6 border-b border-zinc-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center border border-zinc-200">
                <Mail className="w-4 h-4 text-zinc-400" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none">To: {parent.name}</span>
                <span className="text-[10px] text-zinc-300 font-medium">{parent.email}</span>
              </div>
            </div>
            <div className="px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
              <Edit3 className="w-3 h-3" /> Draft
            </div>
          </div>

          <div className="p-10 md:p-12 font-inter text-navy leading-relaxed space-y-8">
            <div className="font-bold text-lg">
              Hi <EditableField 
                value={parent.name.split(' ')[0]} 
                onChange={(val) => {
                  const key = currentParent === 'parent1' ? 'parent1' : 'parent2';
                  updateState({ [key]: { ...state[key], name: val + ' ' + (state[key].name.split(' ')[1] || '') } });
                }}
                label="first name"
              />,
            </div>

            <div className="space-y-6">
              <p>
                I'm starting a <span className="font-bold">ForEveryAfter</span> for us.
              </p>
              
              <p className="bg-amber-50/50 p-6 rounded-2xl border border-amber-100 italic relative">
                <EditableField 
                  value={state.personalNotes[currentParent]} 
                  onChange={(val) => updateState({ personalNotes: { ...state.personalNotes, [currentParent]: val } })}
                  label="personal note"
                />
              </p>

              <p>
                It's a private space for us to record stories and keep our most important family information organized and secure. 
                Your son <span className="font-bold">{state.childName.split(' ')[0]}</span> began this for you.
              </p>
            </div>

            <div className="pt-8 border-t border-zinc-50 flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-400 mb-1">Sent via</p>
                <div className="flex items-center gap-2">
                  {/* Logo image contains the wordmark — no adjacent text span
                      needed. Bumped from 5px to 6px height because at 5px the
                      wordmark inside the image was pixel soup. */}
                  <img src="/logo.png" alt="ForEveryAfter" className="h-6 w-auto object-contain grayscale opacity-20" />
                </div>
              </div>
              <div className="flex flex-col items-end">
                <div className="w-12 h-12 bg-zinc-50 rounded-full flex items-center justify-center text-zinc-200">
                  <CheckCircle className="w-6 h-6" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="flex flex-col items-center gap-6">
          <button 
            onClick={handleSend}
            disabled={sending}
            className="w-full bg-primary text-white font-black text-lg py-5 rounded-3xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 shadow-xl shadow-primary/20"
          >
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mail className="w-5 h-5" />}
            {sending ? 'Sending invitations...' : `Send ${state.parent2.active ? 'both invitations' : 'invitation'}`}
          </button>
          
          <p className="text-zinc-400 text-xs italic">
            // NO real emails sent. Mock logs to console with 1.5s delay.
          </p>
        </div>
      </div>
    </OnboardingLayout>
  );
}

export default function InvitePreviewPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#FAFAF7]" />}>
      <InvitePreviewContent />
    </Suspense>
  );
}
