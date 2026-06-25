'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Gift } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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

// An invited user lands here. Signing in carries the invite token to the API, which
// accepts it and links their new guide to whoever invited them.
export default function InvitePage() {
  const params = useParams();
  const token = Array.isArray(params.token) ? params.token[0] : (params.token as string | undefined);
  const qs = token ? `?invite=${encodeURIComponent(token)}` : '';

  return (
    <div className="min-h-screen bg-[#FAFAF7] font-inter text-navy flex flex-col items-center justify-center p-6 text-center">
      <div className="bg-white p-10 md:p-12 rounded-[40px] shadow-xl border border-zinc-100 max-w-md w-full space-y-8">
        <div className="w-20 h-20 bg-gold/10 rounded-full flex items-center justify-center mx-auto text-gold">
          <Gift className="w-10 h-10" />
        </div>

        <div className="space-y-3">
          <h1 className="font-playfair text-3xl font-black">You've been invited</h1>
          <p className="text-zinc-500">
            Someone close to you wants to help you create your family guide. Sign in to begin — we'll connect your accounts automatically.
          </p>
        </div>

        <div className="space-y-4">
          <a
            href={`${API_URL}/auth/google${qs}`}
            className="flex items-center justify-center gap-3 w-full bg-white border border-zinc-200 rounded-xl px-5 py-4 font-bold text-navy hover:bg-zinc-50 hover:shadow-sm transition-all"
          >
            <GoogleIcon />
            Continue with Google
          </a>
          <a
            href={`${API_URL}/auth/microsoft${qs}`}
            className="flex items-center justify-center gap-3 w-full bg-white border border-zinc-200 rounded-xl px-5 py-4 font-bold text-navy hover:bg-zinc-50 hover:shadow-sm transition-all"
          >
            <MicrosoftIcon />
            Continue with Microsoft
          </a>
        </div>

        <p className="text-zinc-400 text-sm">
          Already have an account?{' '}
          <Link href="/login" className="font-bold text-gold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
