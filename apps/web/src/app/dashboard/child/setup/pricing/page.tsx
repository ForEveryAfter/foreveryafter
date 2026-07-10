'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Tag, ArrowRight, Loader2, ChevronRight } from 'lucide-react';

const FAMILY_DISCOUNT = 0.20;

const PLANS = [
  { id: 'annual', name: 'Annual', price: 49, period: '/year', featured: false },
  { id: 'five-year', name: '5-Year', price: 179, period: 'one-time', featured: true },
  { id: 'ten-year', name: '10-Year', price: 299, period: 'one-time', featured: false },
];

export default function SetupPricingPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [processing, setProcessing] = useState(false);

  const handleSelect = (planId: string) => {
    setSelected(planId);
    setShowCheckout(true);
  };

  const handleCheckout = async () => {
    setProcessing(true);
    console.log('[MOCK] Checkout completed for plan:', selected, '— family discount applied');
    await new Promise(r => setTimeout(r, 1500));
    router.push('/dashboard/child/setup/recipients');
  };

  const selectedPlan = PLANS.find(p => p.id === selected);

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 font-inter text-navy">
      <div className="mb-10">
        <h1 className="font-playfair text-3xl font-black mb-2">Set up your guide</h1>
        <p className="text-zinc-500">Choose your plan and get started.</p>
      </div>

      {/* Family Discount Banner */}
      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 mb-8 flex items-center gap-4">
        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
          <Tag className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <p className="font-bold text-amber-800 text-sm">Family member discount applied — 20% off all plans.</p>
          <p className="text-xs text-amber-600 mt-0.5">
            This discount is applied automatically because you&apos;re already part of a ForEveryAfter family.
          </p>
        </div>
      </div>

      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {PLANS.map((plan) => {
          const discounted = Math.round(plan.price * (1 - FAMILY_DISCOUNT) * 100) / 100;
          const isSelected = selected === plan.id;

          return (
            <div
              key={plan.id}
              onClick={() => handleSelect(plan.id)}
              className={`relative bg-white rounded-[28px] p-8 transition-all cursor-pointer ${
                isSelected
                  ? 'border-2 border-gold shadow-xl scale-[1.02]'
                  : plan.featured
                    ? 'border-2 border-[#1E3A5F] shadow-lg'
                    : 'border border-zinc-100 shadow-sm hover:shadow-md hover:-translate-y-0.5'
              }`}
            >
              {plan.featured && !isSelected && (
                <div className="absolute -top-3 left-6 bg-[#1E3A5F] text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
                  Recommended
                </div>
              )}
              {isSelected && (
                <div className="absolute -top-3 left-6 bg-gold text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
                  Selected
                </div>
              )}

              <div className="space-y-4">
                <h3 className="font-bold text-navy text-lg">{plan.name}</h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-navy">${discounted.toFixed(2)}</span>
                  <span className="text-sm text-zinc-300 line-through">${plan.price}</span>
                </div>
                <span className="text-xs text-zinc-400">{plan.period}</span>

                <div className="space-y-2 pt-3">
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <Check className="w-3.5 h-3.5 text-[#1E3A5F]" /> Unlimited stories
                  </div>
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <Check className="w-3.5 h-3.5 text-[#1E3A5F]" /> Secure vault
                  </div>
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <Check className="w-3.5 h-3.5 text-[#1E3A5F]" /> Unlimited co-guides
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Checkout Summary */}
      {showCheckout && selectedPlan && (
        <div className="bg-white rounded-[28px] border border-zinc-100 shadow-sm p-8 mb-8 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Checkout Summary</h3>
          <div className="space-y-3 pt-2">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">{selectedPlan.name} Plan</span>
              <span className="text-navy font-medium">${selectedPlan.price.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-amber-600 font-medium">Family discount (20%)</span>
              <span className="text-amber-600 font-medium">−${(selectedPlan.price * FAMILY_DISCOUNT).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold border-t border-zinc-50 pt-3">
              <span className="text-navy">Total</span>
              <span className="text-navy">${(selectedPlan.price * (1 - FAMILY_DISCOUNT)).toFixed(2)}</span>
            </div>
          </div>
          <button
            onClick={handleCheckout}
            disabled={processing}
            className="w-full bg-[#1E3A5F] text-white font-bold py-4 rounded-xl hover:bg-[#1E3A5F]/90 transition-all flex items-center justify-center gap-2 mt-4"
          >
            {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : <ChevronRight className="w-5 h-5" />}
            {processing ? 'Processing...' : 'Complete purchase'}
          </button>
          <p className="text-[10px] text-zinc-300 text-center italic">// No real Stripe integration. Simulated checkout.</p>
        </div>
      )}

      {/* Skip */}
      <div className="text-center">
        <Link
          href="/dashboard/child/overview"
          className="text-sm text-zinc-400 hover:text-navy font-medium underline underline-offset-4"
        >
          Not right now
        </Link>
      </div>
    </div>
  );
}
