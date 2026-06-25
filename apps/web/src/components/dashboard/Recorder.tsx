'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Mic, Video, Square, Play, Trash2, Save, RotateCcw, AlertTriangle, Loader2 } from 'lucide-react';

// Per-type caps — video is double the audio limit (longer-form video memories).
// These must match LIMITS in apps/api/src/shared/upload-limits.ts.
const MAX_AUDIO_DURATION_MS = 5 * 60 * 1000;  // 5 min
const MAX_VIDEO_DURATION_MS = 10 * 60 * 1000; // 10 min
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;     // 10 MB
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;    // 200 MB

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface RecorderProps {
  type: 'audio' | 'video';
  // May return a promise; rejection surfaces as the "save failed" banner so the user
  // sees the real reason (e.g. the server's "too big" / "too long" validation).
  onSave: (blob: Blob) => void | Promise<void>;
  onRecordingStart?: () => void;
  onRecordingStop?: () => void;
}

export default function Recorder({ type, onSave, onRecordingStart, onRecordingStop }: RecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const autoStopRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (timerRef.current) clearInterval(timerRef.current);
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
    };
  }, []);

  const maxBytes = type === 'video' ? MAX_VIDEO_BYTES : MAX_AUDIO_BYTES;
  const maxLabel = type === 'video' ? '200 MB' : '10 MB';
  const MAX_DURATION_MS = type === 'video' ? MAX_VIDEO_DURATION_MS : MAX_AUDIO_DURATION_MS;

  const startRecording = async () => {
    try {
      setSizeError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video'
      });
      streamRef.current = stream;
      if (videoPreviewRef.current && type === 'video') {
        videoPreviewRef.current.srcObject = stream;
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: type === 'video' ? 'video/webm' : 'audio/webm'
      });
      mediaRecorderRef.current = mediaRecorder;

      const chunks: BlobPart[] = [];
      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        // mediaRecorder.mimeType is normally what was requested in the
        // constructor, but on some browser/codec combos it returns empty —
        // and a Blob with empty `type` is sent as text/plain (or octet-stream)
        // over FormData, which the server rightly rejects. Fall back to the
        // bare container we asked for so the downstream upload always has a
        // sane Content-Type.
        const resolvedMime =
          mediaRecorder.mimeType || (type === 'video' ? 'video/webm' : 'audio/webm');
        const blob = new Blob(chunks, { type: resolvedMime });

        // Release the camera/mic AND hand the <video> element off from the live
        // MediaStream to the blob URL. Per the HTML spec srcObject takes
        // precedence over src; without nulling it here the element would keep
        // pointing at the now-dead stream and render black even though src is
        // set. Stopping the tracks also turns off the green camera light.
        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = null;
        }
        stream.getTracks().forEach((t) => t.stop());

        // Check file size before allowing save
        if (blob.size > maxBytes) {
          setSizeError(`Recording is ${formatSize(blob.size)}, which exceeds the ${maxLabel} limit. Please record a shorter ${type}.`);
          setRecordedBlob(null);
          setPreviewUrl(null);
          return;
        }

        setRecordedBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordedBlob(null);
      setPreviewUrl(null);
      startTimeRef.current = Date.now();
      onRecordingStart?.();

      // Elapsed timer (updates every second)
      timerRef.current = setInterval(() => {
        setElapsed(Date.now() - startTimeRef.current);
      }, 1000);

      // Auto-stop at 5 minutes
      autoStopRef.current = setTimeout(() => {
        stopRecording();
      }, MAX_DURATION_MS);

    } catch (err) {
      console.error('Error accessing media devices:', err);
      alert('Could not access camera or microphone.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setElapsed(0);
    onRecordingStop?.();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
  };

  const handleSave = async () => {
    if (!recordedBlob || isSaving) return;
    setSaveError(null);
    setIsSaving(true);
    try {
      await onSave(recordedBlob);
      // Parent state flips (audio_path set → recorder unmounts), no local cleanup needed.
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save the recording. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setRecordedBlob(null);
    setPreviewUrl(null);
    setSizeError(null);
    setSaveError(null);
  };

  const remaining = MAX_DURATION_MS - elapsed;

  return (
    <div className="bg-zinc-50 rounded-3xl p-8 border border-zinc-200">
      <div className="flex flex-col items-center gap-6">
        {/* Preview Area */}
        <div className={`w-full bg-black rounded-2xl overflow-hidden relative border-4 border-white shadow-lg ${type === 'video' ? 'aspect-video' : 'h-[200px]'}`}>
          {type === 'video' ? (
            <video
              ref={videoPreviewRef}
              src={previewUrl || undefined}
              autoPlay
              muted={isRecording}
              controls={!!previewUrl}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-white">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-zinc-800'}`}>
                <Mic size={24} />
              </div>
              {previewUrl && <audio src={previewUrl} controls className="w-64" />}
              {!previewUrl && !sizeError && <p className="text-sm font-medium opacity-60">{isRecording ? 'Recording audio...' : 'Ready to record'}</p>}
            </div>
          )}

          {isRecording && (
            <>
              <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-500 text-white px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-lg">
                <div className="w-2 h-2 bg-white rounded-full animate-ping" />
                Recording
              </div>
              <div className="absolute top-4 right-4 bg-black/60 text-white px-3 py-1.5 rounded-full text-xs font-mono font-bold">
                {formatTime(elapsed)} / {formatTime(MAX_DURATION_MS)}
              </div>
              {remaining <= 30000 && remaining > 0 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-amber-500 text-white px-4 py-1.5 rounded-full text-xs font-bold">
                  {Math.ceil(remaining / 1000)}s remaining
                </div>
              )}
            </>
          )}
        </div>

        {/* Size error (client-side cap) */}
        {sizeError && (
          <div className="w-full flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl p-4">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-red-700 font-medium">{sizeError}</p>
              <button onClick={handleReset} className="text-xs font-bold text-red-600 hover:underline mt-1">Try again</button>
            </div>
          </div>
        )}

        {/* Save error — server rejected the upload (e.g. "too big" or "too long" from
            the server's validation). The recording is still in memory so the user can
            re-record without losing what they have. */}
        {saveError && (
          <div className="w-full flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl p-4">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-red-700 font-medium">{saveError}</p>
              <button onClick={handleReset} className="text-xs font-bold text-red-600 hover:underline mt-1">Record again</button>
            </div>
          </div>
        )}

        {/* Size info when recorded */}
        {recordedBlob && (
          <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
            {formatSize(recordedBlob.size)} / {maxLabel} max
          </p>
        )}

        {/* Controls */}
        <div className="flex items-center gap-4">
          {!recordedBlob && !isRecording && !sizeError && (
            <button
              onClick={startRecording}
              className="bg-navy text-white px-8 py-4 rounded-xl font-bold flex items-center gap-2 hover:bg-navy/90 transition-all shadow-xl shadow-navy/20"
            >
              {type === 'video' ? <Video size={20} /> : <Mic size={20} />}
              Start {type === 'video' ? 'Video' : 'Audio'} Recording
            </button>
          )}

          {isRecording && (
            <button
              onClick={stopRecording}
              className="bg-red-500 text-white px-8 py-4 rounded-xl font-bold flex items-center gap-2 hover:bg-red-600 transition-all shadow-xl shadow-red-500/20 animate-pulse"
            >
              <Square size={20} /> Stop Recording
            </button>
          )}

          {recordedBlob && (
            <div className="flex items-center gap-4">
              <button
                onClick={handleReset}
                disabled={isSaving}
                className="bg-zinc-200 text-zinc-600 px-6 py-4 rounded-xl font-bold flex items-center gap-2 hover:bg-zinc-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCcw size={20} /> Try Again
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="bg-primary text-white px-8 py-4 rounded-xl font-bold flex items-center gap-2 hover:bg-primary/90 transition-all shadow-xl shadow-primary/20 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                {isSaving ? 'Saving…' : 'Save Response'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
