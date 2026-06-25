'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { useOnboarding } from './OnboardingContext';

type OnboardingLayoutProps = {
  children: React.ReactNode;
  step: number;
  title: string;
  subtitle?: string;
  nextHref?: string;
  prevHref?: string;
  onNext?: () => void;
  showSkip?: boolean;
  showBypass?: boolean;
  variant?: 'child' | 'parent';
};

export default function OnboardingLayout({
  children,
  step,
  title,
  subtitle,
  nextHref,
  prevHref,
  onNext,
  showSkip = false,
  showBypass = false,
  variant = 'child',
}: OnboardingLayoutProps) {
  const { updateState } = useOnboarding();
  const router = useRouter();

  const handleNext = () => {
    if (onNext) onNext();
    if (nextHref) router.push(nextHref);
  };

  const totalSteps = 7;
  const progress = (step / totalSteps) * 100;

  return (
    <div className="min-h-screen bg-[#FAFAF7] font-inter text-navy flex flex-col">
      {/* Header with Progress */}
      <header className="bg-white border-b border-zinc-100 px-6 py-4 md:px-12 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-8">
          <div className="flex items-center gap-4">
            <Link href="/register" className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
              <X className="w-5 h-5 text-zinc-400" />
            </Link>
            <div className="hidden md:block h-4 w-[1px] bg-zinc-200" />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Step {step} of {totalSteps}</span>
              <div className="w-32 h-1.5 bg-zinc-100 rounded-full mt-1 overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 ease-out ${variant === 'parent' ? 'bg-gold' : 'bg-primary'}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="LegacyBridge" className="w-6 h-6 object-contain grayscale opacity-50" />
            <span className="font-bold text-sm tracking-tight opacity-40">LegacyBridge</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-12 md:py-16">
        <div className="max-w-2xl">
          <div className="space-y-4 mb-12">
            <h1 className="font-playfair text-4xl md:text-5xl font-black leading-tight">{title}</h1>
            {subtitle && <p className="text-zinc-500 text-lg leading-relaxed">{subtitle}</p>}
          </div>

          <div className="space-y-12">
            {children}

            <div className="flex flex-col gap-6 pt-8">
              <div className="flex items-center gap-4">
                {prevHref && (
                  <button 
                    onClick={() => router.push(prevHref)}
                    className="p-4 rounded-xl border border-zinc-200 hover:bg-zinc-50 transition-colors"
                  >
                    <ArrowLeft className="w-6 h-6" />
                  </button>
                )}
                {(nextHref || onNext) && (
                  <button 
                    onClick={handleNext}
                    className={`flex-1 text-white font-bold py-4 px-8 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg ${variant === 'parent' ? 'bg-gold hover:bg-gold/90 shadow-gold/20' : 'bg-primary hover:bg-primary/90 shadow-primary/20'}`}
                  >
                    Continue <ArrowRight className="w-5 h-5" />
                  </button>
                )}
              </div>

              <div className="flex flex-col items-center gap-4">
                {showSkip && (
                  <button 
                    onClick={handleNext}
                    className="text-zinc-400 hover:text-navy text-sm font-medium transition-colors"
                  >
                    I'll do this later
                  </button>
                )}
                {showBypass && (
                  <Link 
                    href="/onboarding/parent/pricing"
                    className={`text-sm font-bold flex items-center gap-1 ${variant === 'parent' ? 'text-gold' : 'text-primary'}`}
                  >
                    Skip setup and go straight to pricing <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
