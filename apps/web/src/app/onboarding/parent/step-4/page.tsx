'use client';

import React from 'react';
import OnboardingLayout from '@/components/onboarding/OnboardingLayout';
import { Shield, Sparkles, Lock, Heart, CheckCircle2 } from 'lucide-react';

export default function ParentStep4Page() {
  const POINTS = [
    {
      icon: <Lock className="w-6 h-6 text-gold" />,
      title: "Private by default",
      desc: "Your guide is encrypted. No one—not even your children—can see your records until the moment you've specified."
    },
    {
      icon: <Sparkles className="w-6 h-6 text-gold" />,
      title: "The Gift of Certainty",
      desc: "By organizing this now, you're removing the guesswork and emotional burden from your family later."
    },
    {
      icon: <Heart className="w-6 h-6 text-gold" />,
      title: "Beyond just documents",
      desc: "Keep the stories, values, and 'soft' legacies that matter most, alongside the hard facts of your estate."
    },
    {
      icon: <Shield className="w-6 h-6 text-gold" />,
      title: "Always in your control",
      desc: "You can change access, update check-ins, or pause your guide at any time from your dashboard."
    }
  ];

  return (
    <OnboardingLayout
      step={4}
      variant="parent"
      title="Rest easy."
      subtitle="You've taken the first step in creating a bridge for your family. Here's what that means for you."
      nextHref="/onboarding/parent/summary"
      prevHref="/onboarding/parent/step-3"
    >
      <div className="space-y-12">
        <div className="grid grid-cols-1 gap-8">
          {POINTS.map((point, i) => (
            <div key={i} className="flex gap-6 items-start group">
              <div className="w-14 h-14 rounded-2xl bg-white border border-zinc-100 shadow-sm flex items-center justify-center shrink-0 group-hover:border-gold/30 transition-colors">
                {point.icon}
              </div>
              <div className="space-y-1 pt-2">
                <h3 className="font-bold text-navy text-lg">{point.title}</h3>
                <p className="text-zinc-500 text-sm leading-relaxed">{point.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="p-8 bg-navy text-white rounded-[40px] shadow-2xl relative overflow-hidden flex flex-col items-center text-center gap-4">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gold/10 blur-3xl rounded-full translate-x-10 -translate-y-10" />
          <CheckCircle2 className="w-10 h-10 text-gold" />
          <h4 className="font-playfair text-2xl font-bold italic">"I'm ready to build my legacy."</h4>
        </div>
      </div>
    </OnboardingLayout>
  );
}
