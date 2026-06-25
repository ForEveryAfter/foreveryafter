'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Heart, Send, MessageCircle } from 'lucide-react';
import { getParentById, relativeTime, type AskedQuestion } from '@/data/child-dashboard-mock';

export default function ParentGuidePage() {
  const { parentId } = useParams<{ parentId: string }>();
  const rel = getParentById(parentId);

  const [questions, setQuestions] = useState<AskedQuestion[]>(rel?.parentGuide.askedQuestions || []);
  const [input, setInput] = useState('');

  if (!rel) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10 font-inter text-navy">
        <p className="text-zinc-500">Parent not found.</p>
        <Link href="/dashboard/child/overview" className="text-primary font-bold text-sm mt-4 inline-block">Back to dashboard</Link>
      </div>
    );
  }

  const name = rel.parentFirstName;
  const lastSaved = relativeTime(rel.parentGuide.lastSavedAt);

  const handleSubmit = () => {
    const text = input.trim();
    if (!text) return;
    // TODO: POST to /api/questions when real API exists
    console.log('QUESTION_ASKED', { question: text, parentId });
    setQuestions(prev => [{ id: `q-${Date.now()}`, question: text, askedAt: new Date().toISOString() }, ...prev]);
    setInput('');
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-8 font-inter text-navy">
      <div className="space-y-4">
        <Link href="/dashboard/child/overview" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-navy font-medium transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to dashboard
        </Link>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gold/10 rounded-xl flex items-center justify-center">
              <Heart className="w-5 h-5 text-gold" />
            </div>
            <h1 className="font-playfair text-3xl font-black">{name}&apos;s Guide</h1>
          </div>
          <p className="text-sm text-zinc-400">{name} last saved {lastSaved}</p>
        </div>
      </div>

      <section className="bg-white rounded-3xl border border-zinc-100 shadow-sm p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/5 rounded-xl flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-primary" />
          </div>
          <h2 className="font-bold text-navy text-lg">Ask a Question</h2>
        </div>

        <p className="text-sm text-zinc-500 leading-relaxed">
          Ask {name} anything you&apos;d like them to share with you. They&apos;ll see your questions and answer them when they&apos;re ready. You won&apos;t see their answers until they&apos;re shared with you.
        </p>

        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder={`Ask ${name} something...`}
            className="flex-1 bg-zinc-50 border-2 border-zinc-100 rounded-xl px-5 py-3 text-sm text-navy outline-none focus:border-primary transition-all"
            aria-label={`Ask ${name} a question`}
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim()}
            className="bg-primary text-white font-bold px-6 py-3 rounded-xl hover:bg-primary-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shrink-0"
            aria-label="Send question"
          >
            <Send className="w-4 h-4" /> Ask {name}
          </button>
        </div>

        {questions.length > 0 && (
          <div className="space-y-3 pt-4 border-t border-zinc-50">
            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Your questions</h3>
            <div className="space-y-2">
              {questions.map(q => (
                <div key={q.id} className="bg-zinc-50 rounded-2xl p-5 space-y-2">
                  <p className="text-sm text-navy leading-relaxed">{q.question}</p>
                  <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Asked {relativeTime(q.askedAt)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
