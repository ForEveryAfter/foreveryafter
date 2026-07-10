'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { MessageCircle } from 'lucide-react';
import { VIDEO_CLUSTERS } from '@/lib/videoData';
import { VideoCard, VideoModal } from '@/components/dashboard/VideoCard';
import type { VideoItem } from '@/lib/videoData';

const PARENT_CATEGORIES = ['All', 'Getting started', 'Your guide', 'Access & privacy', 'For your family', 'Billing'];
const CHILD_CATEGORIES = ['All', 'Getting started', 'Your guide', 'Access & privacy', 'For your family', 'Billing', 'When the time comes'];

export default function LearnPage() {
  // Search was removed — there are few enough videos that browsing the
  // category tabs is faster than typing. The "Ask a question" affordance
  // moved up next to the page title to keep it discoverable.
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeModal, setActiveModal] = useState<VideoItem | null>(null);
  const [role, setRole] = useState<'parent' | 'child'>('child');

  useEffect(() => {
    const mode = localStorage.getItem('le_active_mode');
    setRole(mode === 'parent' ? 'parent' : 'child');
  }, []);

  const categories = role === 'parent' ? PARENT_CATEGORIES : CHILD_CATEGORIES;

  const clusters = useMemo(() => {
    return VIDEO_CLUSTERS
      .filter(c => c.role === role)
      .map(cluster => {
        const filtered = activeCategory === 'All'
          ? cluster.videos
          : cluster.videos.filter(v => v.category === activeCategory);
        return { ...cluster, videos: filtered };
      })
      .filter(c => c.videos.length > 0);
  }, [role, activeCategory]);

  const handleOpenChat = (topic: string) => {
    setActiveModal(null);
    // Dispatch custom event for FloatingChat to pick up
    window.dispatchEvent(new CustomEvent('lb-open-chat', { detail: { topic } }));
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 font-inter text-navy">
      {/* Header — title block on the left, "Ask a question" button at the
          top-right. Replaces the old search-bar row, which was overkill for
          the current video catalog size. */}
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-playfair text-3xl font-black mb-2">Learn</h1>
          <p className="text-zinc-500">Understand how your guide works — at your own pace.</p>
        </div>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('lb-open-chat', { detail: {} }))}
          className="shrink-0 bg-[#4A5E52] text-white font-bold text-sm px-5 py-3 rounded-xl hover:bg-[#607A6A] transition-colors flex items-center gap-2 whitespace-nowrap"
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

      {/* Clusters — every cluster shows ALL its videos. The grid wraps onto
          additional rows automatically (grid-cols-2 / md:grid-cols-4), so
          there's no "See all N" affordance: more videos just mean more rows. */}
      {clusters.length > 0 ? (
        <div className="space-y-12">
          {clusters.map((cluster) => (
            <div key={cluster.title + cluster.role}>
              <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-5">
                {cluster.title}
              </h2>
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
          <p className="text-zinc-400 font-medium">No videos in &ldquo;{activeCategory}&rdquo; yet.</p>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('lb-open-chat', { detail: {} }))}
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
