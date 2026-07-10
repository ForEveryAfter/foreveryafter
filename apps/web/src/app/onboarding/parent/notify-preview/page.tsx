'use client';

import React, { useState } from 'react';
import OnboardingLayout from '@/components/onboarding/OnboardingLayout';
import { useParentOnboarding } from '@/components/onboarding/ParentOnboardingContext';
import { useAuth } from '@/lib/auth-context';
import { Mail, Loader2, Edit3, CheckCircle, ChevronLeft, ChevronRight, User, Heart } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { sendOnboardingNotifications } from '@/lib/api';

type EditableFieldProps = {
  value: string;
  onChange: (val: string) => void;
  label: string;
};

const EditableField = ({ value, onChange, label }: EditableFieldProps) => {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <div className="inline-block min-w-[150px]">
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
        Click to edit
      </span>
    </span>
  );
};

export default function ParentNotifyPreviewPage() {
  const { state, updateState } = useParentOnboarding();
  const { user } = useAuth();
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const ownerFirst = user?.name?.trim().split(/\s+/)[0] || 'Your parent';

  const handleSendAll = async () => {
    setSending(true);
    try {
      // Finalize account and generate RSA keys (the API uses the authenticated
      // user's internal id — no hardcoded guid).
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/identity/onboard`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      // Actually send the messages via Resend (server reads the family list from the
      // DB; we only pass the per-recipient personal notes here). Best-effort: a single
      // failed send doesn't block navigation — the user already finished onboarding.
      await sendOnboardingNotifications({
        childrenNote: state.personalNotes.children,
        spouseNote: state.spouseEnabled ? state.personalNotes.spouse : undefined,
      }).catch((err) => console.error('sendOnboardingNotifications failed:', err));

      router.push('/onboarding/parent/done');
    } catch (err) {
      console.error('Failed to finalize onboarding:', err);
      // Even if it fails, we proceed for the demo, but log it
      router.push('/onboarding/parent/done');
    }
  };

  return (
    <OnboardingLayout
      step={7}
      variant="parent"
      title="Prepare your family."
      subtitle="Before we open your guide, we'll send a warm message to your inner circle so they know what you've started."
      prevHref="/onboarding/parent/pricing"
    >
      <div className="space-y-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Children Notification Card */}
          <div className="bg-white rounded-[40px] shadow-xl border border-zinc-100 overflow-hidden flex flex-col ring-1 ring-zinc-50">
            <div className="bg-zinc-50 px-8 py-6 border-b border-zinc-100 flex items-center justify-between">
               <div className="flex items-center gap-3">
                 <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center border border-zinc-200">
                   <Mail className="w-4 h-4 text-zinc-400" />
                 </div>
                 <div className="flex flex-col text-[10px]">
                   <span className="font-bold text-zinc-400 uppercase tracking-widest">To Children</span>
                   <span className="text-zinc-300">{state.children.map((c) => c.name.split(' ')[0]).filter(Boolean).join(' & ') || 'Your children'}</span>
                 </div>
               </div>
               <div className="px-2 py-1 bg-amber-50 text-amber-600 rounded-full text-[8px] font-bold uppercase tracking-wider flex items-center gap-1">
                 <Edit3 className="w-2.5 h-2.5" /> Draft
               </div>
            </div>
            
            <div className="p-8 space-y-6 flex-1">
              <p className="text-xs font-bold text-zinc-300 uppercase tracking-widest">Subject: Your dad set something up for you.</p>
              <div className="text-sm text-navy leading-relaxed space-y-4">
                <p>Hello,</p>
                <p>I'm {user?.name || 'your parent'}.</p>
                <p className="p-4 bg-amber-50/30 rounded-xl italic border border-amber-50">
                  <EditableField 
                    value={state.personalNotes.children} 
                    onChange={(val) => updateState({ personalNotes: { ...state.personalNotes, children: val } })}
                    label="note"
                  />
                </p>
                <p>I've set up a ForEveryAfter to help organize our family's most important information and stories.</p>
                <div className="p-4 bg-zinc-50 rounded-xl text-zinc-400 text-center text-xs border border-dashed border-zinc-200">
                   NO Button for Children (Notification only)
                </div>
              </div>
            </div>
          </div>

          {/* Spouse Invitation Card (if enabled) */}
          {state.spouseEnabled && (
            <div className="bg-white rounded-[40px] shadow-xl border border-zinc-100 overflow-hidden flex flex-col ring-1 ring-zinc-50">
              <div className="bg-zinc-50 px-8 py-6 border-b border-zinc-100 flex items-center justify-between">
                 <div className="flex items-center gap-3">
                   <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center border border-zinc-200">
                     <Mail className="w-4 h-4 text-zinc-400" />
                   </div>
                   <div className="flex flex-col text-[10px]">
                     <span className="font-bold text-zinc-400 uppercase tracking-widest">To Spouse</span>
                     <span className="text-zinc-300">{state.spouse.name || 'Your spouse'}</span>
                   </div>
                 </div>
                 <div className="px-2 py-1 bg-amber-50 text-amber-600 rounded-full text-[8px] font-bold uppercase tracking-wider flex items-center gap-1">
                   <Edit3 className="w-2.5 h-2.5" /> Draft
                 </div>
              </div>
              
              <div className="p-8 space-y-6 flex-1">
                <p className="text-xs font-bold text-zinc-300 uppercase tracking-widest">Subject: {ownerFirst} set up a family guide.</p>
                <div className="text-sm text-navy leading-relaxed space-y-4">
                  <p>Hi <EditableField value={state.spouse.name.split(' ')[0]} onChange={() => {}} label="name" />,</p>
                  <p className="p-4 bg-amber-50/30 rounded-xl italic border border-amber-50">
                    <EditableField 
                      value={state.personalNotes.spouse} 
                      onChange={(val) => updateState({ personalNotes: { ...state.personalNotes, spouse: val } })}
                      label="note"
                    />
                  </p>
                  
                  <div className="py-4 flex justify-center">
                    <div className="bg-gold text-white px-6 py-3 rounded-xl font-bold text-xs shadow-lg shadow-gold/20 flex items-center gap-2">
                       Set up my guide <ChevronRight className="w-3 h-3" />
                    </div>
                  </div>

                  {state.billingOwner === 'self' && (
                    <p className="text-[10px] text-zinc-400 text-center italic">Payment managed by {ownerFirst}.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Bar */}
        <div className="flex flex-col items-center gap-8 pt-8">
           <button 
             onClick={handleSendAll}
             disabled={sending}
             className="w-full bg-gold text-white font-black text-xl py-6 rounded-3xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-4 shadow-xl shadow-gold/20"
           >
             {sending ? <Loader2 className="w-6 h-6 animate-spin" /> : <Mail className="w-6 h-6" />}
             {sending ? 'Sending all messages...' : 'Send all messages'}
           </button>

           <div className="flex flex-col items-center gap-2">
             <button 
               onClick={() => router.push('/onboarding/parent/done')}
               className="text-zinc-400 hover:text-navy text-sm font-bold underline underline-offset-4"
             >
               Send these later
             </button>
             <p className="text-[10px] text-zinc-300 italic">
               // Simulated 1.5s delay. No real emails sent.
             </p>
           </div>
        </div>
      </div>
    </OnboardingLayout>
  );
}
