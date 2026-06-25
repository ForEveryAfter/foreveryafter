'use client';

import React from 'react';
import { CreditCard, CheckCircle2, History, ArrowRight, ShieldCheck, Zap } from 'lucide-react';

const PLANS = [
  { 
    id: 'annual', 
    name: 'Annual Care', 
    price: '$99', 
    period: '/year', 
    features: ['Standard security', 'Yearly check-ins', 'Basic AI assistance'],
    active: true 
  },
  { 
    id: 'archive', 
    name: 'Lifetime Archive', 
    price: '$499', 
    period: 'one-time', 
    features: ['Ultra-secure cold storage', 'Quarterly check-ins', 'Priority AI access', 'Generational sharing'],
    active: false 
  },
];

export default function ChildBilling() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-12 space-y-12 font-inter text-navy">
      <div className="space-y-4">
        <h1 className="font-playfair text-4xl md:text-5xl font-black text-navy leading-tight">
          Membership & Billing
        </h1>
        <p className="text-zinc-500 max-w-2xl text-lg">
          Manage the security and preservation of your family&apos;s legacy items.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Active Plan Card */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white rounded-3xl border border-zinc-100 p-10 shadow-sm space-y-8">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-primary bg-primary/5 px-2 py-0.5 rounded">Active Plan</span>
                </div>
                <h2 className="text-2xl font-bold">Annual Care Membership</h2>
              </div>
              <div className="text-right">
                <p className="text-3xl font-black text-navy">$99<span className="text-sm font-medium text-zinc-400">/year</span></p>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">Next bill: Oct 12, 2026</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-4 bg-zinc-50 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-primary">
                  <ShieldCheck size={16} />
                  <span className="text-xs font-bold uppercase tracking-widest">Security</span>
                </div>
                <p className="text-sm font-medium text-navy">Standard Encryption</p>
              </div>
              <div className="p-4 bg-zinc-50 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-primary">
                  <History size={16} />
                  <span className="text-xs font-bold uppercase tracking-widest">Check-ins</span>
                </div>
                <p className="text-sm font-medium text-navy">Every 6 Months</p>
              </div>
              <div className="p-4 bg-zinc-50 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-primary">
                  <Zap size={16} />
                  <span className="text-xs font-bold uppercase tracking-widest">Storage</span>
                </div>
                <p className="text-sm font-medium text-navy">10GB Included</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4">
              <button className="text-sm font-bold text-zinc-400 hover:text-navy transition-colors">
                Cancel Membership
              </button>
              <button className="bg-navy text-white px-8 py-4 rounded-xl font-bold hover:scale-105 transition-all shadow-lg shadow-navy/20">
                Upgrade Plan
              </button>
            </div>
          </div>

          {/* Payment Methods */}
          <div className="bg-white rounded-3xl border border-zinc-100 p-10 shadow-sm space-y-6">
            <h3 className="text-xl font-bold">Payment Methods</h3>
            <div className="flex items-center justify-between p-6 border border-zinc-100 rounded-2xl">
              <div className="flex items-center gap-4">
                <div className="w-12 h-8 bg-zinc-100 rounded flex items-center justify-center">
                  <CreditCard className="text-zinc-400" size={20} />
                </div>
                <div>
                  <p className="text-sm font-bold">•••• •••• •••• 4242</p>
                  <p className="text-xs text-zinc-400">Expires 12/28</p>
                </div>
              </div>
              <button className="text-xs font-bold text-primary hover:underline">Edit</button>
            </div>
            <button className="text-sm font-bold text-primary flex items-center gap-2 hover:translate-x-1 transition-transform">
              Add new payment method <ArrowRight size={16} />
            </button>
          </div>
        </div>

        {/* Available Upgrades */}
        <div className="space-y-6">
          <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 px-2">Recommended for you</h3>
          {PLANS.filter(p => !p.active).map(plan => (
            <div key={plan.id} className="bg-white rounded-3xl border border-zinc-100 p-8 shadow-sm space-y-6 hover:border-gold/30 hover:shadow-xl transition-all group">
              <div className="space-y-1">
                <h4 className="font-bold text-lg">{plan.name}</h4>
                <p className="text-2xl font-black text-navy">{plan.price}</p>
              </div>
              <ul className="space-y-3">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-3 text-sm text-zinc-500">
                    <CheckCircle2 size={16} className="text-gold shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button className="w-full py-4 border-2 border-gold text-gold font-bold rounded-xl group-hover:bg-gold group-hover:text-white transition-all">
                Select Plan
              </button>
            </div>
          ))}
          
          <div className="bg-primary/5 rounded-3xl p-8 space-y-4">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white">
              <ShieldCheck size={20} />
            </div>
            <h4 className="font-bold text-sm">Secure Preservation</h4>
            <p className="text-xs text-zinc-500 leading-relaxed">
              LegacyBridge uses military-grade encryption to ensure that your memories are safe until the moment they are needed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
