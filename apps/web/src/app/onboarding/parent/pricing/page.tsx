'use client';

import React, { useState } from 'react';
import OnboardingLayout from '@/components/onboarding/OnboardingLayout';
import { useParentOnboarding } from '@/components/onboarding/ParentOnboardingContext';
import { useAuth } from '@/lib/auth-context';
import { saveOnboarding } from '@/lib/api';
import { Check, Loader2, Info, ChevronDown, CreditCard, Users, Tag, X } from 'lucide-react';
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

export default function ParentPricingPage() {
  const { state, updateState } = useParentOnboarding();
  const { user } = useAuth();
  const router = useRouter();
  const ownerFirst = user?.name?.trim().split(/\s+/)[0] || 'You';
  const spouseFirst = state.spouse.name.trim().split(/\s+/)[0] || 'Spouse';

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

  const handleSelectPlan = (planId: string) => {
    updateState({ plan: planId as any });
  };

  return (
    <OnboardingLayout
      step={6}
      variant="parent"
      title="Choose your plan."
      subtitle="Select the duration that best fits your needs. You can choose to pay now or have a child handle the billing later."
      prevHref="/onboarding/parent/summary"
      onNext={() => {
        if (state.plan) {
          if (user?.guid) {
            saveOnboarding(user.guid, {
              plan: {
                planType: state.plan.replace(/-/g, '_'),
                coverage: state.spouseEnabled ? 'both' : 'single',
                billingOwner: state.billingOwner,
              },
            }).catch(() => {});
          }
          router.push('/onboarding/parent/notify-preview');
        } else {
          handleSelectPlan('annual');
        }
      }}
    >
      <div className="space-y-12">
        {/* Spouse Toggle */}
        <div className="bg-white p-8 rounded-[32px] border border-zinc-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-4">
              <div className="w-12 h-12 bg-gold/5 rounded-2xl flex items-center justify-center text-gold">
                <Check className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-navy text-lg">Add a guide for {state.spouse.name || 'your spouse'}</h3>
                <p className="text-sm text-zinc-400">Capturing both of your stories and wishes together.</p>
              </div>
            </div>
            <div
              onClick={() => updateState({ spouseEnabled: !state.spouseEnabled })}
              className={`w-14 h-8 rounded-full flex items-center px-1 cursor-pointer transition-colors ${state.spouseEnabled ? 'bg-gold' : 'bg-zinc-200'}`}
            >
              <div className={`w-6 h-6 bg-white rounded-full transition-transform ${state.spouseEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
            </div>
          </div>
          <details className="group">
            <summary className="text-xs text-gold font-bold cursor-pointer list-none flex items-center gap-1">
              Why add a spouse guide? <ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform" />
            </summary>
            <p className="mt-2 text-xs text-zinc-400 leading-relaxed italic">
              When you add a spouse, they get their own private guide space, but your family records are unified. It&apos;s the most responsible way to organize a dual household.
            </p>
          </details>
        </div>

        {/* Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => {
            const baseTotal = state.spouseEnabled ? plan.price + plan.spouseAddon : plan.price;
            const discountedTotal = calcDiscount(baseTotal, appliedDiscount);
            const hasDiscount = appliedDiscount && discountedTotal < baseTotal;

            return (
              <div
                key={plan.id}
                className={`relative bg-white p-8 rounded-[32px] border-2 transition-all flex flex-col justify-between ${state.plan === plan.id ? 'border-gold shadow-xl scale-[1.02]' : 'border-zinc-100 hover:border-zinc-200'}`}
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
                      <Check className="w-4 h-4 text-gold shrink-0" />
                      <span>Infinite stories & archives</span>
                    </div>
                    <div className="flex items-start gap-2 text-xs text-zinc-500">
                      <Check className="w-4 h-4 text-gold shrink-0" />
                      <span>Unlimited co-guides</span>
                    </div>
                  </div>

                  {state.spouseEnabled && (
                    <div className="pt-4 border-t border-zinc-50 space-y-1">
                       <div className="flex justify-between text-[10px] text-zinc-400">
                         <span>{ownerFirst}&apos;s Guide</span>
                         <span>${plan.price}</span>
                       </div>
                       <div className="flex justify-between text-[10px] text-gold font-bold">
                         <span>{spouseFirst}&apos;s Add-on</span>
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
                  className={`mt-10 w-full py-4 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 ${state.plan === plan.id ? 'bg-gold text-white shadow-lg shadow-gold/20' : 'bg-zinc-50 text-navy hover:bg-zinc-100'}`}
                >
                  {state.plan === plan.id ? (
                    <>
                      <Check className="w-4 h-4" />
                      Selected
                    </>
                  ) : 'Select'}
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
                    discountError ? 'border-red-300 focus:border-red-400' : 'border-zinc-200 focus:border-gold'
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

        {/* Billing Owner */}
        <div className="space-y-6">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
            Who is responsible for billing?
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              onClick={() => updateState({ billingOwner: 'self' })}
              className={`p-6 rounded-3xl border-2 cursor-pointer transition-all flex items-center gap-4 ${state.billingOwner === 'self' ? 'bg-gold/5 border-gold shadow-lg shadow-gold/5' : 'bg-white border-zinc-100 hover:border-zinc-200'}`}
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${state.billingOwner === 'self' ? 'border-gold' : 'border-zinc-200'}`}>
                {state.billingOwner === 'self' && <div className="w-2.5 h-2.5 bg-gold rounded-full" />}
              </div>
              <div className="flex items-center gap-3">
                <CreditCard className="w-5 h-5 text-zinc-400" />
                <span className="font-bold text-navy">I&apos;ll pay for this myself</span>
              </div>
            </div>

            <div
              onClick={() => updateState({ billingOwner: 'child' })}
              className={`p-6 rounded-3xl border-2 cursor-pointer transition-all flex items-center gap-4 ${state.billingOwner === 'child' ? 'bg-gold/5 border-gold shadow-lg shadow-gold/5' : 'bg-white border-zinc-100 hover:border-zinc-200'}`}
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${state.billingOwner === 'child' ? 'border-gold' : 'border-zinc-200'}`}>
                {state.billingOwner === 'child' && <div className="w-2.5 h-2.5 bg-gold rounded-full" />}
              </div>
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-zinc-400" />
                <span className="font-bold text-navy">Have one of my children pay</span>
              </div>
            </div>
          </div>

          {state.billingOwner === 'child' && (
            <div className="p-6 bg-zinc-50 rounded-3xl flex gap-4 animate-in fade-in slide-in-from-top-2">
              <Info className="w-5 h-5 text-zinc-400 shrink-0" />
              <p className="text-xs text-zinc-500 leading-relaxed italic">
                We&apos;ll include a secure billing link in the notification email we send to your children. Your guide setup will remain active, and we&apos;ll track the payment for you.
              </p>
            </div>
          )}
        </div>
      </div>
    </OnboardingLayout>
  );
}
