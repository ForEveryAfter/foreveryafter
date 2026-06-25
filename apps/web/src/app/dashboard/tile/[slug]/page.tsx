'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Mic, BookOpen } from 'lucide-react';
import Link from 'next/link';

export default function TilePage() {
  const params = useParams();
  const slug = params.slug as string;

  const title = slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 font-inter text-navy">
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-navy font-medium mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to dashboard
      </Link>

      <div className="mb-12">
        <h1 className="font-playfair text-3xl font-black mb-3">{title}</h1>
        <p className="text-zinc-500">This section is under construction. Your stories will be captured here.</p>
      </div>

      <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm p-12 text-center space-y-6">
        <div className="w-16 h-16 bg-[#4A5E52]/5 rounded-2xl flex items-center justify-center mx-auto">
          <BookOpen className="w-8 h-8 text-[#4A5E52]" />
        </div>
        <h2 className="font-bold text-xl text-navy">Coming soon</h2>
        <p className="text-zinc-400 max-w-md mx-auto text-sm leading-relaxed">
          In the next pass, this section will feature guided prompts, voice recording, and rich text editing to capture your {title.toLowerCase()}.
        </p>
      </div>
    </div>
  );
}
