'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { PartyPopper, CheckCircle, ArrowRight, Heart, Share2 } from 'lucide-react';
import { useOnboarding } from '@/components/onboarding/OnboardingContext';

export default function ConfirmationPage() {
  const { state } = useOnboarding();

  return (
    <div className="min-h-screen bg-[#FAFAF7] font-inter text-navy flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-xl w-full space-y-12">
        <div className="relative inline-block">
          <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full scale-150 animate-pulse" />
          <div className="relative bg-white w-24 h-24 rounded-[32px] shadow-2xl flex items-center justify-center text-primary border border-zinc-100">
            <CheckCircle className="w-12 h-12" />
          </div>
          <div className="absolute -top-2 -right-2 bg-gold text-white p-2 rounded-full shadow-lg">
            <PartyPopper className="w-5 h-5" />
          </div>
        </div>

        <div className="space-y-4">
          <h1 className="font-playfair text-4xl md:text-5xl font-black">Invitations Sent!</h1>
          <p className="text-zinc-500 text-lg leading-relaxed max-w-md mx-auto">
            You've taken a beautiful step for your family. We'll notify you as soon as {state.parent1.name.split(' ')[0]} {state.parent2.active ? `and ${state.parent2.name.split(' ')[0]}` : ''} opens their guide.
          </p>
        </div>

        <div className="bg-white p-8 rounded-[40px] shadow-xl border border-zinc-100 grid grid-cols-2 gap-8 divide-x divide-zinc-50">
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2 text-primary">
              <Heart className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Story Count</span>
            </div>
            <p className="text-2xl font-black">0</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2 text-gold">
              <Share2 className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Co-Guides</span>
            </div>
            <p className="text-2xl font-black">{state.siblings.length + 1}</p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-6">
          <Link 
            href="/dashboard"
            className="w-full bg-primary text-white font-black text-xl py-6 rounded-3xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 shadow-xl shadow-primary/20"
          >
            Go to dashboard <ArrowRight className="w-5 h-5" />
          </Link>
          
          <button className="text-zinc-400 hover:text-navy font-bold text-sm underline underline-offset-4">
            Wait, I need to add more family
          </button>
        </div>
      </div>
    </div>
  );
}
