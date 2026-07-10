'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Play } from 'lucide-react';

interface IntroVideoOverlayProps {
  onDismiss: () => void;
  videoUrl?: string;
}

// IMPORTANT: this overlay is rendered into document.body via a portal — NOT inline
// where the parent page calls it. The dashboard layout wraps `children` in a
// `<fieldset disabled>` whenever the guide is read-only (free / trial / lapsed
// subscription), and a disabled fieldset disables EVERY <button> inside it — which
// includes the Skip button when the overlay is rendered inline. Portalling to
// document.body lifts the overlay out of the fieldset so Skip stays clickable
// regardless of subscription state.
export default function IntroVideoOverlay({ onDismiss, videoUrl = '/parent/Legacy Bridge_ Parent Intro_1080p_caption.mp4' }: IntroVideoOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Portal mount guard: `document` doesn't exist during SSR, and createPortal will
  // throw if called with no target. Render nothing on the server pass; flip true
  // on first client effect.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Lock scroll while the overlay is open.
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);

  const [isPlaying, setIsPlaying] = useState(false);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(e => console.error("Playback failed", e));
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleEnded = () => {
    onDismiss();
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
      {/* Skip Button — type="button" so it's never treated as a submit if some
          ancestor introduces a <form> later. */}
      <button
        type="button"
        onClick={onDismiss}
        className="absolute top-8 right-8 z-[110] bg-white/20 hover:bg-white/40 backdrop-blur-md text-white px-6 py-3 rounded-full font-bold flex items-center gap-2 transition-all border border-white/30"
      >
        <span className="text-lg">Skip</span>
        <X size={20} />
      </button>

      {!isPlaying && (
        <button
          type="button"
          onClick={togglePlay}
          className="absolute z-[110] w-24 h-24 bg-primary/80 text-white rounded-full flex items-center justify-center hover:scale-110 transition-all shadow-2xl"
        >
          <Play size={40} className="fill-white ml-2" />
        </button>
      )}

      <div className="relative w-full h-full max-w-6xl max-h-[80vh] flex items-center justify-center p-4">
        <video
          ref={videoRef}
          src={videoUrl}
          autoPlay
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={handleEnded}
          className="w-full h-full object-contain shadow-2xl cursor-pointer"
          onClick={togglePlay}
        />
      </div>
    </div>,
    document.body,
  );
}
