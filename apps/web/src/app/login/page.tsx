'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const ERROR_MESSAGES: Record<string, string> = {
  google_failed: 'Google sign-in didn’t complete. Please try again.',
  microsoft_failed: 'Microsoft sign-in didn’t complete. Please try again.',
};

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

function LoginContent() {
  const searchParams = useSearchParams();
  const errorCode = searchParams.get('error');
  const errorMessage = errorCode ? (ERROR_MESSAGES[errorCode] || 'Sign-in failed. Please try again.') : null;

  return (
    <div className="min-h-screen bg-[#FAFAF7] font-inter text-navy">
      <header className="px-6 py-6 md:px-12 lg:px-24 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          {/* Logo image contains the wordmark — no adjacent text span needed.
              `h-10 w-auto` preserves aspect ratio instead of squashing the
              lockup into a square. */}
          <img src="/logo.png" alt="ForEveryAfter" className="h-10 w-auto object-contain" />
        </Link>
      </header>

      <main className="max-w-md mx-auto px-6 py-12 md:py-20 flex flex-col items-center text-center">
        <h1 className="font-playfair text-4xl font-black mb-3">Welcome back</h1>
        <p className="text-zinc-500 text-lg mb-10">Sign in to your ForEveryAfter account.</p>

        <div className="bg-white w-full p-8 md:p-10 rounded-[32px] border border-zinc-100 shadow-sm space-y-4">
          {errorMessage && (
            <div className="bg-red-50 text-red-700 text-sm font-medium rounded-xl px-4 py-3 text-left">
              {errorMessage}
            </div>
          )}

          <a
            href={`${API_URL}/auth/google`}
            className="flex items-center justify-center gap-3 w-full bg-white border border-zinc-200 rounded-xl px-5 py-4 font-bold text-navy hover:bg-zinc-50 hover:shadow-sm transition-all"
          >
            <GoogleIcon />
            Continue with Google
          </a>

          <a
            href={`${API_URL}/auth/microsoft`}
            className="flex items-center justify-center gap-3 w-full bg-white border border-zinc-200 rounded-xl px-5 py-4 font-bold text-navy hover:bg-zinc-50 hover:shadow-sm transition-all"
          >
            <MicrosoftIcon />
            Continue with Microsoft
          </a>
        </div>

        <p className="mt-8 text-zinc-400 text-sm">
          New here?{' '}
          <Link href="/register" className="font-bold text-primary hover:underline">
            Create an account
          </Link>
        </p>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#FAFAF7]" />}>
      <LoginContent />
    </Suspense>
  );
}
