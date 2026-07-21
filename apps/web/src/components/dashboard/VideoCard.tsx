'use client';

import React, { useState, useEffect } from 'react';
import { Play, Check, X } from 'lucide-react';
import type { VideoItem } from '@/lib/videoData';

function getWatchedVideos(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem('lb_video_progress') || '{}'); } catch { return {}; }
}


// ── Video Card ──
export function VideoCard({ video, onClick }: { video: VideoItem; onClick: () => void }) {
  const [watched, setWatched] = useState(false);

  useEffect(() => {
    setWatched(!!getWatchedVideos()[video.id]);
  }, [video.id]);

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl border border-zinc-100 overflow-hidden cursor-pointer group transition-all hover:border-[#4A5E52]/30 hover:shadow-md hover:-translate-y-0.5 ${watched ? 'opacity-75' : ''}`}
    >
      {/* Gradient Thumbnail */}
      <div
        className="h-[68px] relative flex items-center justify-center"
        style={{ background: `linear-gradient(135deg, ${video.gradientFrom}, ${video.gradientTo})` }}
      >
        <div className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
          <Play className="w-3.5 h-3.5 text-white fill-white ml-0.5" />
        </div>
        {/* Duration Badge */}
        <span className="absolute bottom-2 right-2 bg-black/30 backdrop-blur-sm text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
          {video.duration}
        </span>
        {/* Watched Checkmark */}
        {watched && (
          <div className="absolute top-2 right-2 w-5 h-5 bg-[#4A5E52] rounded-full flex items-center justify-center">
            <Check className="w-3 h-3 text-white" />
          </div>
        )}
      </div>
      {/* Card Body */}
      <div className="p-3.5">
        <h4 className="text-[11px] font-bold text-navy leading-snug line-clamp-2">{video.title}</h4>
        <p className="text-[10px] text-zinc-400 mt-1 line-clamp-1">{video.subtitle}</p>
      </div>
    </div>
  );
}

// ── Video Modal ──
export function VideoModal({ video, onClose, onOpenChat }: { video: VideoItem; onClose: () => void; onOpenChat?: (topic: string) => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-[28px] shadow-2xl border border-zinc-100 w-full max-w-[480px] max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gradient Header or Video Player */}
        {video.videoUrl ? (
          <div className="h-[270px] bg-black relative shrink-0">
            <video 
              src={video.videoUrl} 
              controls 
              autoPlay
              className="w-full h-full object-contain"
            />
            <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-black/70 transition-colors z-10">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        ) : (
          <div
            className="h-[200px] relative flex items-center justify-center shrink-0"
            style={{ background: `linear-gradient(135deg, ${video.gradientFrom}, ${video.gradientTo})` }}
          >
            <div className="text-center text-white space-y-2 px-8">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto">
                <Play className="w-5 h-5 text-white fill-white ml-0.5" />
              </div>
              <p className="text-white/60 text-xs font-medium uppercase tracking-widest">{video.category}</p>
              <h2 className="font-bold text-lg leading-snug">{video.title}</h2>
              <p className="text-white/50 text-xs">{video.duration}</p>
            </div>
            <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/30 transition-colors">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        )}

        {/* Divider */}
        <div className="h-px bg-zinc-100" />

        {/* Script Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {video.videoUrl && (
            <h5 className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-4">Transcript</h5>
          )}
          <div className="prose prose-sm max-w-none">
            {video.script.split('\n\n').map((paragraph, i) => (
              <p key={i} className="text-[14px] text-navy leading-[1.8] mb-4 last:mb-0">{paragraph}</p>
            ))}
          </div>

          {/* Follow-up link */}
          {onOpenChat && (
            <button
              onClick={() => onOpenChat(video.title)}
              className="mt-6 text-sm font-bold text-[#4A5E52] hover:underline flex items-center gap-1"
            >
              Still have questions? Ask a follow-up →
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
