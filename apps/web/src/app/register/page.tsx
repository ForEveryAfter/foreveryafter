'use client';

import React from 'react';
import Link from 'next/link';
import { User, Heart, ArrowRight, Sparkles } from 'lucide-react';

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF7] font-inter text-navy">
      <header className="px-6 py-6 md:px-12 lg:px-24 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <img src="/logo.png" alt="LegacyBridge" className="w-10 h-10 object-contain" />
          <span className="font-bold text-xl tracking-tight">LegacyBridge</span>
        </Link>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12 md:py-20 flex flex-col items-center text-center">
        <h1 className="font-playfair text-4xl md:text-5xl font-black mb-6">How do you want to start?</h1>
        <p className="text-zinc-500 text-lg mb-12 max-w-lg">
          Whether you're organizing your own legacy or helping a parent, we'll guide you through every step.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
          {/* For a Parent */}
          <Link
            href="/register/auth"
            className="group bg-white p-10 rounded-[32px] border-2 border-primary/20 transition-all shadow-sm hover:shadow-xl text-left flex flex-col justify-between aspect-square"
          >
            <div className="space-y-6">
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors">
                <Heart className="w-8 h-8" />
              </div>
              <div>
                <h2 className="font-playfair text-3xl font-bold mb-3">For a Parent</h2>
                <p className="text-zinc-500 leading-relaxed">
                  I want to help my parent share their story, organize their affairs, and ensure nothing is lost.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 font-bold text-primary">
              Start this path <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          {/* For Myself */}
          <Link
            href="/register/auth"
            className="group bg-white p-10 rounded-[32px] border-2 border-zinc-100 transition-all shadow-sm hover:shadow-xl text-left flex flex-col justify-between aspect-square"
          >
            <div className="space-y-6">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-gold/10 text-gold group-hover:bg-gold group-hover:text-white transition-colors">
                <User className="w-8 h-8" />
              </div>
              <div>
                <h2 className="font-playfair text-3xl font-bold mb-3">For Myself</h2>
                <p className="text-zinc-500 leading-relaxed">
                  I want to document my own legacy and organize my information for my children.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 font-bold text-zinc-400 group-hover:text-gold">
              Start this path <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        </div>

        {/* Trial — sign in only, explore a read-only dashboard before committing */}
        <Link
          href="/register/auth?intent=trial"
          className="mt-10 inline-flex items-center gap-2 text-sm font-bold text-zinc-500 hover:text-gold transition-colors"
        >
          <Sparkles className="w-4 h-4 text-gold" />
          Or start a free trial — just sign in and look around
          <ArrowRight className="w-4 h-4" />
        </Link>

        <p className="mt-8 text-zinc-400 text-sm">
          Already have an account?{' '}
          <Link href="/login" className="font-bold text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </main>
    </div>
  );
}
