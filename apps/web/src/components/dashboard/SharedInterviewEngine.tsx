'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  CheckCircle2,
  Circle,
  BookOpen,
  RotateCcw,
  Mic,
  Loader2,
  Check,
  X,
  AlertCircle,
} from 'lucide-react';
import IntroVideoOverlay from '@/components/dashboard/IntroVideoOverlay';
import Recorder from '@/components/dashboard/Recorder';
import Link from 'next/link';
import { useGuideReadOnly } from '@/components/dashboard/ReadOnlyContext';
import { fetchWithAuth, saveRecording, deleteRecording } from '@/lib/api';

interface Chapter {
  id: string;
  name: string;
  order: number;
  section_order: number;
  intro_text?: string;
  intro_video_url?: string;
}

interface Question {
  id: string;
  chapter_id: string;
  title: string;
  slug: string;
  prompt_audio_slug: string;
  type: 'core' | 'go_deeper';
  order: number;
  response_type: string;
  hint_text?: string | null;
}

interface UserResponse {
  question_id: string;
  audio_path?: string;
  video_path?: string;
  text_content?: string; // legacy: text now lives in storage at transcript_path
  transcript_path?: string;
  // Lifecycle of background Whisper transcription on the audio:
  //   'transcribing' — Whisper running; the question shows a flashing "Transcribing" badge
  //   'ready'        — transcript.txt holds the transcript; text box reflects it
  //   'failed'       — Whisper failed; transcript.txt holds "Transcription failed." and
  //                    the user can edit it / retry via the manual Convert button
  transcript_status?: 'transcribing' | 'ready' | 'failed' | null;
  recorded_at: string;
}

type ViewMode = 'menu' | 'chapter' | 'question';

export interface SharedInterviewEngineProps {
  userId: string;
  section: 'mystory' | 'health_legacy';
  title: string;
  subtitle: string;
  icon?: string;
  audioPromptFolder: string;
  completionMessage: string;
}

export default function SharedInterviewEngine({
  userId,
  section,
  title,
  subtitle,
  icon,
  audioPromptFolder,
  completionMessage
}: SharedInterviewEngineProps) {
  // Trial / free / lapsed users can navigate (Walk Me Through, click into a
  // question, play prompt audio) but can't record, type, transcribe, or upload.
  // The layout shows a FreePlanBanner; here we gate the write controls.
  const { readOnly } = useGuideReadOnly();
  // --- STATE ---
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [responses, setResponses] = useState<UserResponse[]>([]);
  const [loading, setLoading] = useState(true);
  // Surface fetch failures as a banner; previously the page just rendered
  // empty (no chapter cards) which looked identical to "this section is
  // configured but has no chapters yet" — confusing during session blips.
  const [loadError, setLoadError] = useState<string | null>(null);

  const [view, setView] = useState<ViewMode>('menu');
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [isWalkThrough, setIsWalkThrough] = useState(false);
  
  const [showPromptPlayer, setShowPromptPlayer] = useState(true);
  const [recordingType, setRecordingType] = useState<'audio' | 'video'>('audio');
  
  useEffect(() => {
    setShowPromptPlayer(true);
  }, [activeQuestionId]);

  // Background-transcription polling: while ANY response is currently 'transcribing',
  // refetch /interview/responses every 3s and merge updates. Stops as soon as nothing is
  // pending. Picks up automatically too — if the user comes back to the page later and a
  // response is still 'transcribing', this effect keeps polling until it resolves.
  const anyTranscribing = responses.some((r) => r.transcript_status === 'transcribing');
  useEffect(() => {
    if (!anyTranscribing) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const fresh = await fetchWithAuth('/interview/responses', userId);
        if (!cancelled) setResponses(fresh);
      } catch { /* keep trying */ }
    };
    const id = setInterval(tick, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, [anyTranscribing, userId]);

  // --- DATA LOADING ---
  const loadData = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const [cData, qData, rData] = await Promise.all([
        fetchWithAuth(`/interview/chapters?section=${section}`, userId),
        fetchWithAuth(`/interview/questions?section=${section}`, userId),
        fetchWithAuth('/interview/responses', userId)
      ]);
      setChapters(cData);
      setQuestions(qData);
      setResponses(rData);
    } catch (err: any) {
      console.error(`Failed to load ${section} data:`, err);
      setLoadError(err?.message || 'Could not load this section right now.');
    } finally {
      setLoading(false);
    }
  }, [section, userId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // --- DERIVED STATE ---
  const activeChapter = useMemo(() => 
    chapters.find(c => c.id === activeChapterId), 
    [chapters, activeChapterId]
  );

  const chapterQuestions = useMemo(() => {
    if (!activeChapterId) return [];
    return questions
      .filter(q => q.chapter_id === activeChapterId)
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'core' ? -1 : 1;
        return a.order - b.order;
      });
  }, [questions, activeChapterId]);

  const activeQuestion = useMemo(() => 
    questions.find(q => q.id === activeQuestionId), 
    [questions, activeQuestionId]
  );

  const activeResponse = useMemo(() => 
    responses.find(r => r.question_id === activeQuestionId), 
    [responses, activeQuestionId]
  );

  // Stats helper
  const getChapterStats = (chapterId: string) => {
    const qs = questions.filter(q => q.chapter_id === chapterId);
    const coreQs = qs.filter(q => q.type === 'core');
    const deeperQs = qs.filter(q => q.type === 'go_deeper');
    
    const answeredIds = new Set(responses.map(r => r.question_id));
    const coreAnswered = coreQs.filter(q => answeredIds.has(q.id)).length;
    const deeperAnswered = deeperQs.filter(q => answeredIds.has(q.id)).length;

    return {
      core: { answered: coreAnswered, total: coreQs.length },
      deeper: { answered: deeperAnswered, total: deeperQs.length }
    };
  };

  // --- HANDLERS ---
  const handleSaveResponse = async (blob: Blob) => {
    if (!activeQuestion) return;
    try {
      const result: any = await saveRecording(userId, {
        questionId: activeQuestion.id,
        slug: activeQuestion.slug,
        type: recordingType,
        blob,
        mimeType: blob.type,
        section
      });
      
      // Persist the FULL server row — the previous code only captured 4 cols and
      // silently dropped transcript_status / transcript_path / text_content. The
      // dropped transcript_status='transcribing' is what triggers the
      // "Transcribing…" pill AND the 3s polling loop (see anyTranscribing
      // effect ~line 101). Without it the user saw a UI that looked unchanged
      // after Save — even though the row, the audio, and the transcript all
      // landed on the server. Spreading `result` keeps the local cache shape-
      // identical to what /interview/responses would return on a fresh fetch.
      setResponses(prev => {
        const other = prev.filter(r => r.question_id !== activeQuestion.id);
        return [...other, result];
      });

      if (isWalkThrough) {
        handleNextQuestion();
      }
    } catch (err) {
      // Re-throw so the Recorder's Save handler can show the specific message inline
      // (e.g. the server's "too big" or "too long" validation error).
      console.error('Failed to save response:', err);
      throw err;
    }
  };

  const startWalkThrough = (chapterId: string) => {
    setActiveChapterId(chapterId);
    setIsWalkThrough(true);
    
    const qs = questions
      .filter(q => q.chapter_id === chapterId)
      .sort((a, b) => (a.type === 'core' ? 0 : 1) - (b.type === 'core' ? 0 : 1) || a.order - b.order);
    
    const firstUnanswered = qs.find(q => !responses.some(r => r.question_id === q.id));
    
    if (firstUnanswered) {
      setActiveQuestionId(firstUnanswered.id);
    } else {
      setActiveQuestionId(qs[0].id);
    }
    
    setView('question');
  };

  const handleNextQuestion = () => {
    const currentIndex = chapterQuestions.findIndex(q => q.id === activeQuestionId);
    
    if (isWalkThrough) {
      // Find next UNANSWERED question in chapter
      const nextUnanswered = chapterQuestions.slice(currentIndex + 1).find(q => !responses.some(r => r.question_id === q.id));
      
      if (nextUnanswered) {
        setActiveQuestionId(nextUnanswered.id);
        setShowPromptPlayer(true);
      } else {
        // All exhausted, return to menu
        setIsWalkThrough(false);
        setView('menu');
        alert(completionMessage);
      }
    } else {
      // Normal navigation
      if (currentIndex < chapterQuestions.length - 1) {
        setActiveQuestionId(chapterQuestions[currentIndex + 1].id);
        setShowPromptPlayer(true);
      }
    }
  };

  const handlePrevQuestion = () => {
    const currentIndex = chapterQuestions.findIndex(q => q.id === activeQuestionId);
    if (currentIndex > 0) {
      setActiveQuestionId(chapterQuestions[currentIndex - 1].id);
      setShowPromptPlayer(true);
    }
  };

  // --- RENDER HELPERS ---

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
    </div>
  );

  // 1. CHAPTER MENU
  if (view === 'menu') {
    return (
      <div className="max-w-4xl mx-auto space-y-10 animate-in fade-in duration-500">
        
        <header className="space-y-2">
          <h1 className="font-playfair text-4xl font-black text-navy flex items-center gap-3">
            {icon && <span>{icon}</span>}
            {title}
          </h1>
          <p className="text-zinc-500">{subtitle}</p>
        </header>

        {loadError && (
          <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-2xl px-5 py-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1">Couldn&apos;t load this section: {loadError}</span>
            <button onClick={() => void loadData()} className="font-bold underline">Retry</button>
          </div>
        )}

        <div className="grid gap-4">
          {chapters.map((chapter) => {
            const stats = getChapterStats(chapter.id);
            const isComplete = stats.core.answered === stats.core.total && stats.core.total > 0;

            return (
              <div 
                key={chapter.id}
                className="group bg-white rounded-2xl border border-zinc-100 p-6 flex items-center justify-between hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 transition-all cursor-pointer"
                onClick={() => { setActiveChapterId(chapter.id); setView('chapter'); }}
              >
                <div className="flex items-center gap-5">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${isComplete ? 'bg-primary text-white' : 'bg-zinc-50 text-zinc-400 group-hover:bg-primary/10 group-hover:text-primary'}`}>
                    {isComplete ? <CheckCircle2 size={24} /> : <BookOpen size={24} />}
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-navy">{chapter.name}</h3>
                    {chapter.intro_text && chapters.length === 1 && (
                      <p className="text-xs text-zinc-500 mt-1 max-w-md">{chapter.intro_text}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-zinc-500">
                        <span className="font-bold text-navy">{stats.core.answered} of {stats.core.total}</span> core questions
                      </span>
                      {stats.deeper.total > 0 && (
                        <>
                          <span className="text-zinc-200 text-[10px]">•</span>
                          <span className="text-[10px] text-zinc-400">
                            {stats.deeper.answered} of {stats.deeper.total} go deeper
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                
                <button 
                  onClick={(e) => { e.stopPropagation(); startWalkThrough(chapter.id); }}
                  className="bg-navy text-white px-5 py-2.5 rounded-lg text-xs font-bold hover:scale-105 transition-all shadow-lg shadow-navy/10 whitespace-nowrap"
                >
                  Walk Me Through
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 2. CHAPTER QUESTION LIST
  if (view === 'chapter' && activeChapter) {
    const coreQs = chapterQuestions.filter(q => q.type === 'core');
    const deeperQs = chapterQuestions.filter(q => q.type === 'go_deeper');

    return (
      <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
        <button 
          onClick={() => setView('menu')}
          className="flex items-center gap-2 text-sm font-bold text-zinc-400 hover:text-navy transition-colors mb-4"
        >
          <ChevronLeft size={18} /> Back to {title}
        </button>

        <header className="space-y-6">
          <h1 className="font-playfair text-4xl font-black text-navy">{activeChapter.name}</h1>
          
          {activeChapter.intro_video_url && (
            <div className="w-full aspect-video bg-black rounded-3xl overflow-hidden shadow-2xl border-4 border-white">
              <video 
                src={activeChapter.intro_video_url} 
                controls 
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {activeChapter.intro_text && chapters.length > 1 && (
            <p className="text-zinc-500 text-lg leading-relaxed max-w-2xl">{activeChapter.intro_text}</p>
          )}
        </header>

        <div className="space-y-10 pt-6">
          {/* Core Questions */}
          <section className="space-y-4">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 px-2">Core Questions</h2>
            <div className="grid gap-2">
              {coreQs.map((q) => {
                const isComplete = responses.some(r => r.question_id === q.id);
                return (
                  <button 
                    key={q.id}
                    onClick={() => { setActiveQuestionId(q.id); setView('question'); }}
                    className="w-full text-left bg-white p-5 rounded-xl border border-zinc-50 flex items-center justify-between hover:border-primary/20 hover:bg-primary/5 transition-all group"
                  >
                    <span className={`font-medium transition-colors pr-4 ${isComplete ? 'text-zinc-400' : 'text-navy group-hover:text-primary'}`}>
                      {q.title}
                    </span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-[10px] font-bold uppercase tracking-widest whitespace-nowrap ${isComplete ? 'text-primary' : 'text-zinc-300'}`}>
                        {isComplete ? 'Complete' : 'Not Started'}
                      </span>
                      {isComplete ? <CheckCircle2 size={18} className="text-primary shrink-0" /> : <Circle size={18} className="text-zinc-200 shrink-0" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Go Deeper Questions */}
          {deeperQs.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-4 px-2">
                <div className="h-px bg-zinc-100 flex-1" />
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-gold whitespace-nowrap">Go Deeper</h2>
                <div className="h-px bg-zinc-100 flex-1" />
              </div>
              <div className="grid gap-2">
                {deeperQs.map((q) => {
                  const isComplete = responses.some(r => r.question_id === q.id);
                  return (
                    <button 
                      key={q.id}
                      onClick={() => { setActiveQuestionId(q.id); setView('question'); }}
                      className="w-full text-left bg-white p-5 rounded-xl border border-zinc-50 flex items-center justify-between hover:border-gold/20 hover:bg-gold/5 transition-all group"
                    >
                      <span className={`font-medium transition-colors pr-4 ${isComplete ? 'text-zinc-400' : 'text-navy group-hover:text-gold'}`}>
                        {q.title}
                      </span>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`text-[10px] font-bold uppercase tracking-widest whitespace-nowrap ${isComplete ? 'text-gold' : 'text-zinc-300'}`}>
                          {isComplete ? 'Complete' : 'Not Started'}
                        </span>
                        {isComplete ? <CheckCircle2 size={18} className="text-gold shrink-0" /> : <Circle size={18} className="text-zinc-200 shrink-0" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    );
  }

  // 3. QUESTION RECORDING SCREEN
  if (view === 'question' && activeQuestion) {
    return (
      <QuestionRecordingScreen
        question={activeQuestion}
        chapter={activeChapter!}
        chapterQuestions={chapterQuestions}
        activeResponse={activeResponse}
        isWalkThrough={isWalkThrough}
        readOnly={readOnly}
        userId={userId}
        section={section}
        audioPromptFolder={audioPromptFolder}
        completionMessage={completionMessage}
        showPromptPlayer={showPromptPlayer}
        setShowPromptPlayer={setShowPromptPlayer}
        onSaveResponse={handleSaveResponse}
        onNextQuestion={handleNextQuestion}
        onPrevQuestion={handlePrevQuestion}
        onBackToChapter={() => { setView('chapter'); setIsWalkThrough(false); }}
        onResponseUpdated={(updated) => {
          setResponses(prev => {
            const other = prev.filter(r => r.question_id !== updated.question_id);
            return [...other, updated];
          });
        }}
        onClearResponse={async () => {
          // Delete the audio file from S3 + clear audio_path/transcript_status on the
          // row. Keeps transcript_path + text. The returned row replaces the local one;
          // if it's effectively empty, drop it from the local list.
          try {
            const updated: any = await deleteRecording(userId, activeQuestion.id);
            setResponses(prev => {
              const other = prev.filter(r => r.question_id !== activeQuestion.id);
              return updated && updated.question_id ? [...other, updated] : other;
            });
          } catch (err) {
            console.error('Failed to delete recording:', err);
          }
        }}
      />
    );
  }

  return null;
}

// ─── Question Recording Screen ────────────────────────────────────────────────

function QuestionRecordingScreen({
  question,
  chapter,
  chapterQuestions,
  activeResponse,
  isWalkThrough,
  readOnly,
  userId,
  section,
  audioPromptFolder,
  completionMessage,
  showPromptPlayer,
  setShowPromptPlayer,
  onSaveResponse,
  onNextQuestion,
  onPrevQuestion,
  onBackToChapter,
  onResponseUpdated,
  onClearResponse,
}: {
  question: Question;
  chapter: Chapter;
  chapterQuestions: Question[];
  activeResponse: UserResponse | undefined;
  isWalkThrough: boolean;
  // True when the user can read the question + play prompt audio but can't record,
  // type, transcribe, delete, or save. Driven by useGuideReadOnly() one level up.
  readOnly: boolean;
  userId: string;
  section: string;
  audioPromptFolder: string;
  completionMessage: string;
  showPromptPlayer: boolean;
  setShowPromptPlayer: (v: boolean) => void;
  onSaveResponse: (blob: Blob) => void;
  onNextQuestion: () => void;
  onPrevQuestion: () => void;
  onBackToChapter: () => void;
  onResponseUpdated: (response: UserResponse) => void;
  onClearResponse: () => void;
}) {
  const currentIndex = chapterQuestions.findIndex(q => q.id === question.id);
  const isLastQuestion = currentIndex === chapterQuestions.length - 1 && !isWalkThrough;

  // Local state
  const [textContent, setTextContent] = useState(activeResponse?.text_content || '');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [suppressWarning, setSuppressWarning] = useState(false);
  const [savingText, setSavingText] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // What was last persisted to S3 (transcript.txt). Compared against the current trimmed
  // textContent to skip redundant saves (initial-load echo, repeat blurs, etc.).
  const lastSavedTextRef = useRef<string>((activeResponse?.text_content || '').trim());

  // Load suppress preference
  useEffect(() => {
    fetchWithAuth('/interview/profile-preferences', userId)
      .then(data => setSuppressWarning(data.suppress_transcribe_warning || false))
      .catch(() => {});
  }, [userId]);

  // Load the answer text when the question changes. Text now lives in storage
  // (transcript_path); fetch it from /storage. Fall back to the legacy text_content.
  // Re-fetches when transcript_status flips ('transcribing' → 'ready'/'failed') because
  // the file content changes even though transcript_path is stable — a cache-buster
  // query string ensures we don't see a stale response.
  useEffect(() => {
    const tp = activeResponse?.transcript_path;
    const st = activeResponse?.transcript_status;
    if (tp) {
      let cancelled = false;
      const bust = st ? `?s=${st}` : '';
      fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/storage/${tp}${bust}`, { credentials: 'include' })
        .then((r) => (r.ok ? r.text() : ''))
        .then((t) => {
          if (cancelled) return;
          setTextContent(t);
          // Reset the auto-save baseline to whatever just loaded so the next debounce
          // tick doesn't immediately POST the same content back.
          lastSavedTextRef.current = t.trim();
        })
        .catch(() => {});
      return () => { cancelled = true; };
    }
    const fallback = activeResponse?.text_content || '';
    setTextContent(fallback);
    lastSavedTextRef.current = fallback.trim();
  }, [question.id, activeResponse?.transcript_path, activeResponse?.transcript_status, activeResponse?.text_content]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [textContent]);

  // Persist the textarea to S3 (transcript.txt) via /interview/save-text. Idempotent:
  // skips when nothing changed since the last save. Wired to onBlur AND a debounced
  // typing watcher below — so text reliably lands in S3 regardless of whether the user
  // clicks Next, navigates away, or just sits on the last question.
  const saveTextNow = useCallback(async () => {
    const trimmed = textContent.trim();
    if (trimmed === lastSavedTextRef.current) return;
    setSavingText(true);
    try {
      const updated: any = await fetchWithAuth('/interview/save-text', userId, {
        method: 'POST',
        body: JSON.stringify({ questionId: question.id, textContent: trimmed, section }),
      });
      lastSavedTextRef.current = trimmed;
      if (updated && typeof updated === 'object' && updated.question_id) {
        onResponseUpdated(updated);
      }
    } catch (err) {
      console.error('Failed to save text:', err);
    } finally {
      setSavingText(false);
    }
  }, [textContent, userId, question.id, section, onResponseUpdated]);

  // Debounced auto-save while typing: writes ~1.5s after the last keystroke.
  useEffect(() => {
    if (textContent.trim() === lastSavedTextRef.current) return;
    const t = setTimeout(() => { void saveTextNow(); }, 1500);
    return () => clearTimeout(t);
  }, [textContent, saveTextNow]);

  const hasAudio = !!activeResponse?.audio_path;
  const hasText = textContent.trim().length > 0;
  const wordCount = textContent.trim() ? textContent.trim().split(/\s+/).length : 0;

  // Compute audio duration display (approximate from file path existence)
  const audioDurationDisplay = hasAudio ? 'recorded' : null;

  const handleTranscribe = async () => {
    if (hasText && !suppressWarning) {
      setShowOverwriteDialog(true);
      return;
    }
    await doTranscribe();
  };

  const doTranscribe = async () => {
    setIsTranscribing(true);
    setShowOverwriteDialog(false);
    try {
      const result = await fetchWithAuth('/interview/transcribe', userId, {
        method: 'POST',
        body: JSON.stringify({ questionId: question.id }),
      });
      setTextContent(result.text);
      if (result.response) {
        onResponseUpdated(result.response);
      }
    } catch (err) {
      console.error('Transcription failed:', err);
      alert('Could not convert recording to text. Please try again.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleOverwriteConfirm = async () => {
    if (dontAskAgain) {
      // Save preference first
      try {
        await fetchWithAuth('/interview/profile-preferences', userId, {
          method: 'PATCH',
          body: JSON.stringify({ suppress_transcribe_warning: true }),
        });
        setSuppressWarning(true);
      } catch (err) {
        console.error('Failed to save preference:', err);
      }
    }
    setDontAskAgain(false);
    await doTranscribe();
  };

  const handleOverwriteCancel = () => {
    setShowOverwriteDialog(false);
    setDontAskAgain(false); // Never save preference on cancel
  };

  // "Next Question" now just flushes any pending text save (via the shared saveTextNow)
  // and navigates — the actual text save is also covered by onBlur + debounce.
  const handleSaveTextAndNavigate = async () => {
    await saveTextNow();
    onNextQuestion();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-32">
      {/* Header — type tag + question counter on right */}
      <header className="flex items-center justify-end gap-2">
        <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded ${question.type === 'core' ? 'bg-primary/10 text-primary' : 'bg-gold/10 text-gold'}`}>
          {question.type === 'core' ? 'Core' : 'Go Deeper'}
        </span>
        <span className="text-zinc-300 text-[10px]">&middot;</span>
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
          Question {currentIndex + 1} of {chapterQuestions.length}
        </span>
      </header>

      {/* Question title */}
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <h1 className="font-playfair text-3xl md:text-4xl font-black text-navy leading-tight">
          {question.title}
        </h1>
        {question.hint_text && (
          <p className="text-sm text-zinc-400 max-w-2xl mx-auto italic">
            {question.hint_text}
          </p>
        )}
      </div>

      {/* Listen to prompt */}
      {showPromptPlayer && question.prompt_audio_slug && (
        <div className="max-w-sm mx-auto">
          <AudioPromptPlayer
            src={`/parent/${audioPromptFolder}/${question.prompt_audio_slug}.mp3`}
            onError={() => setShowPromptPlayer(false)}
          />
        </div>
      )}

      {/* Audio Recording Area — once a recording exists, the recorder is replaced by a
          compact "[icon] filename [X]" row. The X deletes the file (S3 + DB pointer) but
          keeps the transcript text; clearing it then re-shows the recorder. Re-recording
          will replace the transcript on completion (per spec). Read-only callers get a
          subscribe placeholder where the Recorder would be, and the delete X is hidden
          on existing recordings (they can't undo the parent's). */}
      <div className="space-y-4">
        {activeResponse?.audio_path ? (
          <div className="bg-white border border-zinc-200 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
              <Mic size={18} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-navy truncate">
                {activeResponse.audio_path.split('/').pop()}
              </p>
              <p className="text-[10px] text-zinc-400">
                {readOnly ? 'Recording saved' : 'Recording saved · delete to record again'}
              </p>
            </div>
            {!readOnly && (
              <button
                onClick={onClearResponse}
                aria-label="Delete recording"
                title="Delete recording"
                className="w-9 h-9 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors shrink-0"
              >
                <X size={18} />
              </button>
            )}
          </div>
        ) : readOnly ? (
          <div className="bg-zinc-50 border border-dashed border-zinc-200 rounded-2xl p-6 text-center space-y-3">
            <div className="w-12 h-12 mx-auto bg-white rounded-2xl border border-zinc-100 flex items-center justify-center text-zinc-300">
              <Mic size={20} />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-navy">Recording is part of the paid plan.</p>
              <p className="text-xs text-zinc-500">You can read each question and play its prompt — recording, typing, and uploading turn on when you subscribe.</p>
            </div>
            <Link
              href="/dashboard/payments"
              className="inline-flex items-center gap-1.5 bg-primary text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-primary-hover transition-colors"
            >
              Subscribe to start recording
            </Link>
          </div>
        ) : (
          <Recorder type="audio" onSave={onSaveResponse} />
        )}
      </div>

      {/* Convert to Text button — replaced by a flashing "Transcribing" badge while a
          background Whisper job is running, or a "Retry transcription" button when the
          last attempt failed (the server retries 3× internally before marking 'failed',
          so a click here kicks off another 3× attempt). */}
      <div className="flex justify-center">
        {activeResponse?.transcript_status === 'transcribing' ? (
          <span
            aria-live="polite"
            aria-busy
            className="inline-flex items-center gap-2 text-sm font-bold px-6 py-3 rounded-xl border bg-primary/5 border-primary/20 text-primary animate-pulse"
          >
            <Loader2 size={16} className="animate-spin" /> Transcribing…
          </span>
        ) : activeResponse?.transcript_status === 'failed' ? (
          <button
            onClick={doTranscribe}
            disabled={readOnly || !hasAudio || isTranscribing}
            className="inline-flex items-center gap-2 text-sm font-bold px-6 py-3 rounded-xl border transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
          >
            {isTranscribing ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Retrying…
              </>
            ) : (
              <>
                <RotateCcw size={16} /> Retry transcription
              </>
            )}
          </button>
        ) : (
          <button
            onClick={handleTranscribe}
            disabled={readOnly || !hasAudio || isTranscribing}
            className="inline-flex items-center gap-2 text-sm font-bold px-6 py-3 rounded-xl border transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-white border-zinc-200 text-navy hover:border-primary/30 hover:text-primary"
          >
            {isTranscribing ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Converting...
              </>
            ) : (
              <>
                <Mic size={16} /> Convert recording to text
              </>
            )}
          </button>
        )}
      </div>

      {/* Text Area — readOnly when on a free / trial plan; typing + autosave both
          locked. The native readOnly attribute keeps the text VISIBLE (so the
          recipient can still read what the parent saved) but blocks edits. */}
      <div className="space-y-2">
        <textarea
          ref={textareaRef}
          value={textContent}
          onChange={e => setTextContent(e.target.value)}
          onBlur={() => { if (!readOnly) void saveTextNow(); }}
          readOnly={readOnly}
          placeholder={readOnly ? 'Subscribe to type your answer here.' : 'Or type your answer here...'}
          maxLength={10000}
          className={`w-full min-h-[120px] border-2 rounded-2xl px-5 py-4 text-navy outline-none transition-all resize-none text-sm leading-relaxed font-inter ${
            readOnly
              ? 'bg-zinc-50 border-zinc-100 cursor-not-allowed'
              : 'bg-white border-zinc-100 focus:border-primary/30'
          }`}
          style={{ overflow: 'hidden' }}
        />
        {textContent.length > 9000 && (
          <p className="text-xs text-amber-600 text-right px-1">
            {10000 - textContent.length} characters remaining
          </p>
        )}
      </div>

      {/* Save Status Indicator */}
      <div className="flex items-center justify-center gap-6 text-xs text-zinc-400 py-2">
        {hasAudio ? (
          <span className="flex items-center gap-1.5">
            <Check size={14} className="text-primary" /> Audio {audioDurationDisplay}
          </span>
        ) : (
          <span>No audio recorded</span>
        )}
        <span className="text-zinc-200">|</span>
        {hasText ? (
          <span className="flex items-center gap-1.5">
            <Check size={14} className="text-primary" /> Text saved ({wordCount} word{wordCount !== 1 ? 's' : ''})
          </span>
        ) : (
          <span>No text yet</span>
        )}
      </div>

      {/* Overwrite Confirmation Dialog */}
      {showOverwriteDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/50" onClick={handleOverwriteCancel}>
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-8 space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-navy text-lg">Replace your typed text?</h3>
            <p className="text-sm text-zinc-500 leading-relaxed">
              You&apos;ve already typed something in the text box. Converting your recording will replace it with the words from your audio.
            </p>
            <label className="flex items-center gap-3 cursor-pointer py-2">
              <input
                type="checkbox"
                checked={dontAskAgain}
                onChange={e => setDontAskAgain(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-300 accent-navy"
              />
              <span className="text-sm text-zinc-600">Don&apos;t ask me this again</span>
            </label>
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleOverwriteCancel}
                className="flex-1 py-3 font-bold text-zinc-400 hover:text-navy transition-colors rounded-xl border border-zinc-200"
              >
                Cancel
              </button>
              <button
                onClick={handleOverwriteConfirm}
                className="flex-[1.5] py-3 font-bold text-white bg-navy rounded-xl hover:bg-navy/90 transition-colors"
              >
                Yes, Replace
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Bottom Navigation Bar */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-100 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-40">
        <div className="max-w-4xl mx-auto flex items-center justify-between p-4 md:p-6">
          <button
            onClick={onBackToChapter}
            className="flex items-center gap-2 text-sm font-bold text-zinc-500 hover:text-navy transition-colors py-3 px-5 rounded-xl hover:bg-zinc-50 min-h-[44px]"
          >
            <ChevronLeft size={18} /> Back to Chapter
          </button>

          <button
            onClick={handleSaveTextAndNavigate}
            disabled={isLastQuestion || savingText}
            className="flex items-center gap-2 bg-navy text-white px-8 py-3 rounded-xl font-bold hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-navy/20 disabled:opacity-30 disabled:hover:scale-100 min-h-[44px]"
          >
            {savingText ? (
              <Loader2 size={18} className="animate-spin" />
            ) : null}
            Next Question <ChevronRight size={18} />
          </button>
        </div>
      </footer>
    </div>
  );
}

function AudioPromptPlayer({ src, onError }: { src: string, onError: () => void }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(onError);
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-zinc-100 p-4 flex items-center gap-4 shadow-sm">
      <button 
        onClick={togglePlay}
        className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center shrink-0 hover:bg-primary/20 transition-colors"
      >
        {isPlaying ? <Pause size={18} className="text-primary fill-primary" /> : <Play size={18} className="text-primary fill-primary ml-0.5" />}
      </button>
      <div className="flex-1">
        <p className="text-[10px] font-bold text-navy uppercase tracking-widest opacity-40">Listen to prompt</p>
      </div>
      <audio 
        ref={audioRef}
        src={src} 
        onEnded={() => setIsPlaying(false)}
        onError={onError}
        className="hidden"
      />
    </div>
  );
}
