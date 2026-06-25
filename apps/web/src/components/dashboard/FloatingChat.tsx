'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, Sparkles } from 'lucide-react';

type Message = {
  id: string;
  role: 'system' | 'user';
  text: string;
};

const SUGGESTIONS = [
  'How does the check-in work?',
  'Who can see my guide?',
  'What happens when it activates?',
];

function getThread(): Message[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem('lb_chat_thread') || '[]'); } catch { return []; }
}

function saveThread(msgs: Message[]) {
  localStorage.setItem('lb_chat_thread', JSON.stringify(msgs));
}

export default function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [responding, setResponding] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get user name and mode from localStorage
  const [userName, setUserName] = useState('there');
  const [mode, setMode] = useState('parent');
  useEffect(() => {
    const activeMode = localStorage.getItem('le_active_mode') || 'parent';
    setMode(activeMode);
    setUserName(activeMode === 'parent' ? 'Harold' : 'Myron');
  }, []);

  // Load thread
  useEffect(() => {
    const stored = getThread();
    if (stored.length > 0) {
      setMessages(stored);
      setShowSuggestions(false);
    }
  }, []);

  // Listen for external open events (from video follow-up)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      setOpen(true);
      if (detail.topic) {
        setInput(`I have a question about: ${detail.topic}`);
        setTimeout(() => inputRef.current?.focus(), 300);
      }
    };
    window.addEventListener('lb-open-chat', handler);
    return () => window.removeEventListener('lb-open-chat', handler);
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Add opening message when opened for first time
  useEffect(() => {
    if (open && messages.length === 0) {
      const greeting: Message = {
        id: 'sys-0',
        role: 'system',
        text: `Hi ${userName} — what would you like to know?`,
      };
      setMessages([greeting]);
      saveThread([greeting]);
    }
  }, [open, userName]);

  const handleSend = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg) return;

    // /clear command
    if (msg === '/clear') {
      setMessages([]);
      saveThread([]);
      setInput('');
      setShowSuggestions(true);
      return;
    }

    const userMsg: Message = { id: `user-${Date.now()}`, role: 'user', text: msg };
    const updated = [...messages, userMsg];
    setMessages(updated);
    saveThread(updated);
    setInput('');
    setShowSuggestions(false);
    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    
    // Call backend AI
    try {
      const res = await fetch(`${API_BASE_URL}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: updated,
          context: { mode, userName }
        })
      });
      
      if (!res.ok) throw new Error('Failed to fetch AI response');
      
      const { reply } = await res.json();
      
      const sysMsg: Message = {
        id: `sys-${Date.now()}`,
        role: 'system',
        text: reply,
      };
      const final = [...updated, sysMsg];
      setMessages(final);
      saveThread(final);
    } catch (error) {
      console.error('Chat Error:', error);
      const errorMsg: Message = {
        id: `sys-${Date.now()}`,
        role: 'system',
        text: "I'm sorry, I'm having trouble connecting to my brain right now. Please try again in a moment.",
      };
      setMessages([...updated, errorMsg]);
    } finally {
      setResponding(false);
    }
  };

  return (
    <>
      {/* FAB Button */}
      <button
        onClick={() => setOpen(!open)}
        className={`fixed bottom-6 right-6 z-50 w-[52px] h-[52px] rounded-full flex items-center justify-center shadow-lg transition-all duration-200 ${
          open
            ? 'bg-zinc-600 hover:bg-zinc-700 rotate-0'
            : 'bg-[#4A5E52] hover:scale-105 hover:shadow-xl'
        }`}
      >
        {open ? (
          <X className="w-5 h-5 text-white" />
        ) : (
          <MessageCircle className="w-5 h-5 text-white" />
        )}
      </button>

      {/* Side Drawer */}
      <div
        className={`fixed top-[52px] right-0 bottom-0 w-[360px] bg-white border-l border-zinc-100 shadow-2xl z-40 flex flex-col transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="bg-[#4A5E52] text-white px-5 py-4 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-sm">Ask anything</h3>
            <p className="text-white/50 text-[10px]">About your guide, your family, your plan</p>
          </div>
          <button onClick={() => setOpen(false)} className="w-7 h-7 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors">
            <X className="w-3.5 h-3.5 text-white" />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'system'
                  ? 'bg-[#4A5E52]/5 text-navy self-start'
                  : 'bg-[#4A5E52]/10 text-navy ml-auto'
              }`}
            >
              {msg.text.split('\n').map((line, i) => (
                <React.Fragment key={i}>
                  {line}
                  {i < msg.text.split('\n').length - 1 && <br />}
                </React.Fragment>
              ))}
            </div>
          ))}
          {responding && (
            <div className="bg-[#4A5E52]/5 text-navy rounded-2xl px-4 py-3 text-sm max-w-[85%] flex items-center gap-2">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-[#4A5E52]/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-[#4A5E52]/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-[#4A5E52]/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
        </div>

        {/* Suggestion Pills */}
        {showSuggestions && messages.length <= 1 && (
          <div className="px-5 pb-2 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => handleSend(s)}
                className="bg-[#4A5E52]/5 text-[#4A5E52] text-xs font-medium px-3 py-1.5 rounded-full hover:bg-[#4A5E52]/10 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="border-t border-zinc-100 p-4 bg-white shrink-0">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Type a question..."
              className="flex-1 bg-zinc-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-[#4A5E52] focus:outline-none"
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || responding}
              className="w-10 h-10 bg-[#4A5E52] rounded-xl flex items-center justify-center text-white hover:bg-[#607A6A] transition-colors disabled:opacity-30"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
