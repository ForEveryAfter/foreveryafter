'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Search, MessageCircle } from 'lucide-react';
import { VIDEO_CLUSTERS } from '@/lib/videoData';
import { VideoCard, VideoModal } from '@/components/dashboard/VideoCard';
import type { VideoItem } from '@/lib/videoData';

const PARENT_CATEGORIES = ['All', 'Getting started', 'Your guide', 'Access & privacy', 'For your family', 'Billing'];
const CHILD_CATEGORIES = ['All', 'Getting started', 'Your guide', 'Access & privacy', 'For your family', 'Billing', 'When the time comes'];

export default function LearnPage() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeModal, setActiveModal] = useState<VideoItem | null>(null);
  const [role, setRole] = useState<'parent' | 'child'>('child');

  useEffect(() => {
    const mode = localStorage.getItem('le_active_mode');
    setRole(mode === 'parent' ? 'parent' : 'child');
  }, []);

  const categories = role === 'parent' ? PARENT_CATEGORIES : CHILD_CATEGORIES;

  const clusters = useMemo(() => {
    return VIDEO_CLUSTERS.filter(c => c.role === role).map(cluster => {
      let filtered = cluster.videos;

      if (activeCategory !== 'All') {
        filtered = filtered.filter(v => v.category === activeCategory);
      }

      if (search.trim()) {
        const q = search.toLowerCase();
        filtered = filtered.filter(v =>
          v.title.toLowerCase().includes(q) ||
          v.category.toLowerCase().includes(q)
        );
      }

      return { ...cluster, videos: filtered };
    }).filter(c => c.videos.length > 0);
  }, [role, activeCategory, search]);

  const totalResults = clusters.reduce((sum, c) => sum + c.videos.length, 0);

  const handleOpenChat = (topic: string) => {
    setActiveModal(null);
    // Dispatch custom event for FloatingChat to pick up
    window.dispatchEvent(new CustomEvent('lb-open-chat', { detail: { topic } }));
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 font-inter text-navy">
      <div className="mb-8">
        <h1 className="font-playfair text-3xl font-black mb-2">Learn</h1>
        <p className="text-zinc-500">Understand how your guide works — at your own pace.</p>
      </div>

      {/* Search + Ask */}
      <div className="flex items-center gap-3 mb-8">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-300" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or category..."
            className="w-full bg-white border border-zinc-100 rounded-xl pl-11 pr-4 py-3 text-sm focus:ring-1 focus:ring-[#4A5E52] focus:outline-none transition-all"
          />
        </div>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('lb-open-chat', { detail: {} }))}
          className="bg-[#4A5E52] text-white font-bold text-sm px-5 py-3 rounded-xl hover:bg-[#607A6A] transition-colors flex items-center gap-2 whitespace-nowrap"
        >
          <MessageCircle className="w-4 h-4" /> Ask a question
        </button>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-10 scrollbar-hide">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              activeCategory === cat
                ? 'bg-[#4A5E52] text-white'
                : 'bg-white text-zinc-500 border border-zinc-100 hover:bg-zinc-50'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Clusters */}
      {clusters.length > 0 ? (
        <div className="space-y-12">
          {clusters.map((cluster) => (
            <div key={cluster.title + cluster.role}>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">{cluster.title}</h2>
                <button
                  className="text-xs font-bold text-[#4A5E52] hover:underline"
                  onClick={() => {
                    // "See all" tooltip — not functional
                    alert('Coming soon');
                  }}
                >
                  See all {cluster.videos.length} →
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {cluster.videos.map((video) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    onClick={() => setActiveModal(video)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm p-12 text-center space-y-4">
          <p className="text-zinc-400 font-medium">No results found for &ldquo;{search || activeCategory}&rdquo;</p>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('lb-open-chat', { detail: { topic: search } }))}
            className="text-sm font-bold text-[#4A5E52] hover:underline"
          >
            Try asking in chat →
          </button>
        </div>
      )}

      {/* Video Modal */}
      {activeModal && (
        <VideoModal
          video={activeModal}
          onClose={() => setActiveModal(null)}
          onOpenChat={handleOpenChat}
        />
      )}
    </div>
  );
}
