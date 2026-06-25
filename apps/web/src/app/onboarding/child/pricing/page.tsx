'use client';

import React, { useState } from 'react';
import OnboardingLayout from '@/components/onboarding/OnboardingLayout';
import { useOnboarding } from '@/components/onboarding/OnboardingContext';
import { Check, Loader2, Info, Tag, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface AppliedDiscount {
  code: string;
  discount_type: 'fixed' | 'percentage';
  discount_value: number;
}

function calcDiscount(price: number, discount: AppliedDiscount | null): number {
  if (!discount) return price;
  if (discount.discount_type === 'fixed') return Math.max(0, price - discount.discount_value);
  return Math.max(0, Math.round(price * (1 - discount.discount_value / 100) * 100) / 100);
}

function discountLabel(d: AppliedDiscount): string {
  return d.discount_type === 'fixed' ? `$${d.discount_value} off` : `${d.discount_value}% off`;
}

export default function PricingPage() {
  const { state, updateState } = useOnboarding();
  const router = useRouter();
  const [processing, setProcessing] = useState<string | null>(null);

  const PLANS = [
    { id: 'annual', name: 'Annual', price: 49, spouseAddon: 19, period: 'per year' },
    { id: 'five-year', name: 'Five-year', price: 179, spouseAddon: 49, period: 'one-time' },
    { id: 'ten-year', name: 'Ten-year', price: 299, spouseAddon: 69, period: 'one-time' },
  ];

  // Discount code state
  const [discountInput, setDiscountInput] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<AppliedDiscount | null>(null);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  const handleApplyCode = async () => {
    if (!discountInput.trim()) return;
    setValidating(true);
    setDiscountError(null);
    try {
      const res = await fetch(`${API_URL}/billing/validate-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: discountInput.trim() }),
      });
      const data = await res.json();
      if (data.valid) {
        setAppliedDiscount({ code: data.code, discount_type: data.discount_type, discount_value: data.discount_value });
        setDiscountError(null);
      } else {
        setDiscountError('Code invalid');
        setAppliedDiscount(null);
      }
    } catch {
      setDiscountError('Code invalid');
      setAppliedDiscount(null);
    } finally {
      setValidating(false);
    }
  };

  const handleRemoveCode = () => {
    setAppliedDiscount(null);
    setDiscountInput('');
    setDiscountError(null);
  };

  const handleSelectPlan = async (planId: string) => {
    setProcessing(planId);
    updateState({ plan: planId as any });

    // Simulate payment processing
    await new Promise(resolve => setTimeout(resolve, 1500));

    router.push('/onboarding/child/invite-preview');
  };

  const handleFreeStart = () => {
    updateState({ plan: 'free' });
    router.push('/onboarding/child/invite-preview?plan=free');
  };

  return (
    <OnboardingLayout
      step={6}
      title="Choose a plan for Harold."
      subtitle="Pricing is simple. Choose a duration that fits your family's needs. All plans include full guide features and secure storage."
      prevHref="/onboarding/child/summary"
      onNext={() => {
        if (state.plan) {
          router.push('/onboarding/child/invite-preview');
        } else {
          handleSelectPlan('annual');
        }
      }}
    >
      <div className="space-y-12">
        {/* Spouse Toggle */}
        <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm flex items-center justify-between">
          <div className="flex gap-4">
            <div className="w-10 h-10 bg-primary/5 rounded-xl flex items-center justify-center text-primary">
              <Check className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-navy">Include spouse (Dorothy)</h3>
              <p className="text-xs text-zinc-400">Combined records and stories for both parents.</p>
            </div>
          </div>
          <div
            onClick={() => updateState({ spouseEnabled: !state.spouseEnabled })}
            className={`w-14 h-8 rounded-full flex items-center px-1 cursor-pointer transition-colors ${state.spouseEnabled ? 'bg-primary' : 'bg-zinc-200'}`}
          >
            <div className={`w-6 h-6 bg-white rounded-full transition-transform ${state.spouseEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
          </div>
        </div>

        {/* Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => {
            const baseTotal = state.spouseEnabled ? plan.price + plan.spouseAddon : plan.price;
            const discountedTotal = calcDiscount(baseTotal, appliedDiscount);
            const hasDiscount = appliedDiscount && discountedTotal < baseTotal;
            const isProcessing = processing === plan.id;

            return (
              <div
                key={plan.id}
                className={`relative bg-white p-8 rounded-[32px] border-2 transition-all flex flex-col justify-between ${state.plan === plan.id ? 'border-primary shadow-xl scale-[1.02]' : 'border-zinc-100 hover:border-zinc-200'}`}
              >
                <div className="space-y-6">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-1">{plan.name}</h4>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black text-navy">${hasDiscount ? discountedTotal.toFixed(0) : baseTotal}</span>
                      {hasDiscount && (
                        <span className="text-lg text-zinc-300 line-through">${baseTotal}</span>
                      )}
                      <span className="text-xs text-zinc-400">{plan.period}</span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-start gap-2 text-xs text-zinc-500">
                      <Check className="w-4 h-4 text-primary shrink-0" />
                      <span>Full guide unlimited stories</span>
                    </div>
                    <div className="flex items-start gap-2 text-xs text-zinc-500">
                      <Check className="w-4 h-4 text-primary shrink-0" />
                      <span>Legacy vault for documents</span>
                    </div>
                  </div>

                  {state.spouseEnabled && (
                    <div className="pt-4 border-t border-zinc-50 space-y-2">
                       <div className="flex justify-between text-[10px] text-zinc-400">
                         <span>Base Plan</span>
                         <span>${plan.price}</span>
                       </div>
                       <div className="flex justify-between text-[10px] text-primary font-medium">
                         <span>Spouse Add-on</span>
                         <span>+${plan.spouseAddon}</span>
                       </div>
                    </div>
                  )}

                  {hasDiscount && (
                    <div className="pt-2 border-t border-zinc-50">
                      <div className="flex justify-between text-[10px] text-primary font-bold">
                        <span>Discount ({discountLabel(appliedDiscount!)})</span>
                        <span>-${(baseTotal - discountedTotal).toFixed(0)}</span>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleSelectPlan(plan.id)}
                  disabled={processing !== null}
                  className={`mt-8 w-full py-4 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 ${state.plan === plan.id ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-zinc-50 text-navy hover:bg-zinc-100'}`}
                >
                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Select'}
                  {isProcessing && 'Processing...'}
                </button>
              </div>
            );
          })}
        </div>

        {/* Discount Code */}
        <div className="space-y-3">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
            <Tag className="w-3.5 h-3.5" /> Discount code
          </label>

          {appliedDiscount ? (
            <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl px-5 py-4">
              <Check className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1">
                <span className="font-bold text-navy text-sm">{appliedDiscount.code}</span>
                <span className="text-xs text-primary ml-2">{discountLabel(appliedDiscount)} applied</span>
              </div>
              <button onClick={handleRemoveCode} className="text-zinc-400 hover:text-red-500 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {discountError && (
                <p className="text-xs font-bold text-red-500">{discountError}</p>
              )}
              <div className="flex gap-3">
                <input
                  type="text"
                  value={discountInput}
                  onChange={(e) => { setDiscountInput(e.target.value); setDiscountError(null); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleApplyCode()}
                  placeholder="Enter code"
                  className={`flex-1 bg-white border-2 rounded-xl px-5 py-3 text-sm font-bold text-navy outline-none transition-all ${
                    discountError ? 'border-red-300 focus:border-red-400' : 'border-zinc-200 focus:border-primary'
                  }`}
                />
                <button
                  onClick={handleApplyCode}
                  disabled={validating || !discountInput.trim()}
                  className="bg-navy text-white font-bold text-sm px-6 py-3 rounded-xl hover:bg-navy/90 transition-colors disabled:opacity-40 flex items-center gap-2 shrink-0"
                >
                  {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Free Tier / Alternative */}
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-zinc-400 text-sm italic">Not ready to commit?</p>
          <button
            onClick={handleFreeStart}
            className="text-navy font-bold hover:underline underline-offset-4"
          >
            Let Harold try it free first
          </button>
        </div>

        <div className="p-6 bg-zinc-50 rounded-3xl flex gap-4 items-start">
          <Info className="w-5 h-5 text-zinc-400 shrink-0 mt-0.5" />
          <p className="text-xs text-zinc-400 leading-relaxed italic">
            // NO real Stripe integration in this pass. Payments are simulated. All plan prices match the technical specification ($49/$179/$299 base + spouse add-ons).
          </p>
        </div>
      </div>
    </OnboardingLayout>
  );
}
