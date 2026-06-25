'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { 
  FileText, ShieldCheck, Lock, CheckCircle2, AlertCircle, Plus, Sparkles, Video, Eye, Trash2, X
} from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';
import IntroVideoOverlay from '@/components/dashboard/IntroVideoOverlay';
import { AccountsVerificationGate } from '@/components/dashboard/AccountsUIComponents';
import { MethodPickerModal, UploadModal, LocationModal, CustomDocumentModal, AudioInstructionModal } from '@/components/dashboard/documents/DocumentModals';
import { Mic } from 'lucide-react';

type LearnVideo = {
  title: string;
  description: string;
  video_path: string;
  duration_seconds: number;
};

type DocumentSlot = {
  id: string;
  document_type: string;
  label: string;
  upload_tier: 'upload_or_location' | 'location_only';
  is_required: boolean;
  sort_order: number;
  storage_method: 'upload' | 'location' | 'audio' | null;
  file_name: string | null;
  has_upload: boolean;
  has_location: boolean;
  learn_video: LearnVideo | null;
};

const DOCUMENT_GROUPS = [
  {
    id: 'legal',
    title: 'Legal Documents',
    types: ['will', 'trust', 'poa', 'healthcare_poa', 'advance_directive', 'guardianship']
  },
  {
    id: 'financial',
    title: 'Financial Documents',
    types: ['life_insurance', 'retirement']
  },
  {
    id: 'personal',
    title: 'Personal Records',
    types: ['birth_certificate', 'marriage_certificate', 'military']
  },
  {
    id: 'property',
    title: 'Property & Assets',
    types: ['real_estate', 'vehicle']
  },
  {
    id: 'business',
    title: 'Business Documents',
    types: ['business']
  },
  {
    id: 'custom',
    title: 'Custom Documents',
    types: ['custom']
  }
];

export default function WillsAndDocumentsPage() {
  const userId = '74656c6c-6d65-4123-8123-123456789012';
  
  const [showIntro, setShowIntro] = useState(false);
  const [documents, setDocuments] = useState<DocumentSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [activeSlot, setActiveSlot] = useState<DocumentSlot | null>(null);
  const [showMethodPicker, setShowMethodPicker] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [videoModalUrl, setVideoModalUrl] = useState<string | null>(null);

  useEffect(() => {
    async function checkIntroFlag() {
      if (!userId) return;
      try {
        const flags = await fetchWithAuth('/interview/flags', userId);
        const hasDismissed = flags.some((f: any) => f.flag === 'will_documents_intro_dismissed');
        if (!hasDismissed) {
          setShowIntro(true);
        }
      } catch (err) {
        console.error('Failed to check intro flag:', err);
      }
    }
    checkIntroFlag();
  }, [userId]);

  const handleDismissIntro = async () => {
    setShowIntro(false);
    if (!userId) return;
    try {
      await fetchWithAuth('/interview/flags', userId, {
        method: 'POST',
        body: JSON.stringify({ flag: 'will_documents_intro_dismissed' })
      });
    } catch (err) {
      console.error('Failed to save intro flag:', err);
    }
  };

  const loadDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchWithAuth('/documents', userId);
      setDocuments(data);
    } catch (err: any) {
      setError('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [userId]);

  // Upload/Location Handlers
  const handleUploadDocument = async (file: File) => {
    if (!activeSlot) return;
    const formData = new FormData();
    formData.append('document_slot_id', activeSlot.id);
    formData.append('file', file);

    await fetchWithAuth('/documents/upload', userId, {
      method: 'POST',
      body: formData // The fetchWithAuth wrapper will omit Content-Type for FormData
    });

    setShowUploadModal(false);
    setActiveSlot(null);
    loadDocuments();
  };

  const handleSaveLocation = async (locationText: string) => {
    if (!activeSlot) return;
    await fetchWithAuth('/documents/location', userId, {
      method: 'POST',
      body: JSON.stringify({
        document_slot_id: activeSlot.id,
        location_text: locationText
      })
    });

    setShowLocationModal(false);
    setActiveSlot(null);
    loadDocuments();
  };

  const handleSaveAudio = async (blob: Blob) => {
    if (!activeSlot) return;
    const formData = new FormData();
    formData.append('document_slot_id', activeSlot.id);
    formData.append('audio', blob, 'instructions.webm');

    await fetchWithAuth('/documents/audio', userId, {
      method: 'POST',
      body: formData
    });

    setShowAudioModal(false);
    setActiveSlot(null);
    loadDocuments();
  };

  const handleClearContent = async (slotId: string) => {
    if (!confirm('This will permanently remove this entry. Your family will not see it. This cannot be undone.')) return;
    try {
      await fetchWithAuth(`/documents/${slotId}/content`, userId, { method: 'DELETE' });
      loadDocuments();
    } catch (err) {
      alert('Failed to remove content.');
    }
  };

  const handleDeleteCustom = async (slotId: string, label: string) => {
    if (!confirm(`This will permanently remove ${label} and its contents.`)) return;
    try {
      await fetchWithAuth(`/documents/custom/${slotId}`, userId, { method: 'DELETE' });
      loadDocuments();
    } catch (err) {
      alert('Failed to delete custom document.');
    }
  };

  const handleAddCustom = async (label: string, uploadTier: string) => {
    await fetchWithAuth('/documents/custom', userId, {
      method: 'POST',
      body: JSON.stringify({ label, upload_tier: uploadTier })
    });
    setShowCustomModal(false);
    loadDocuments();
  };

  const getDocumentsByGroup = (types: string[]) => {
    if (types.includes('custom')) {
      return documents.filter(d => d.document_type === 'custom');
    }
    return documents.filter(d => types.includes(d.document_type));
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 font-inter">
      {/* Intro Video Overlay */}
      {showIntro && (
        <IntroVideoOverlay 
          onDismiss={handleDismissIntro} 
          videoUrl="/parent/willandtrust/Introduction to Will & Trust_720p.mp4" 
        />
      )}

      {/* Watch Video Modal */}
      {videoModalUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-navy/90 backdrop-blur-md">
          <div className="relative w-full max-w-4xl bg-black rounded-3xl overflow-hidden shadow-2xl">
            <button 
              onClick={() => setVideoModalUrl(null)} 
              className="absolute top-4 right-4 text-white/50 hover:text-white z-10 p-2"
            >
              <X size={28} />
            </button>
            <video src={videoModalUrl} controls autoPlay className="w-full" />
          </div>
        </div>
      )}

      {/* Modals */}
      {showMethodPicker && activeSlot && (
        <MethodPickerModal 
          label={activeSlot.label}
          onClose={() => { setShowMethodPicker(false); setActiveSlot(null); }}
          onPickUpload={() => { setShowMethodPicker(false); setShowUploadModal(true); }}
          onPickLocation={() => { setShowMethodPicker(false); setShowLocationModal(true); }}
          onPickAudio={() => { setShowMethodPicker(false); setShowAudioModal(true); }}
        />
      )}
      {showUploadModal && activeSlot && (
        <UploadModal 
          label={activeSlot.label}
          hasExisting={!!activeSlot.storage_method}
          onClose={() => { setShowUploadModal(false); setActiveSlot(null); }}
          onUpload={handleUploadDocument}
        />
      )}
      {showLocationModal && activeSlot && (
        <LocationModal 
          label={activeSlot.label}
          hasExisting={!!activeSlot.storage_method}
          onClose={() => { setShowLocationModal(false); setActiveSlot(null); }}
          onSave={handleSaveLocation}
        />
      )}
      {showAudioModal && activeSlot && (
        <AudioInstructionModal 
          label={activeSlot.label}
          hasExisting={!!activeSlot.storage_method}
          onClose={() => { setShowAudioModal(false); setActiveSlot(null); }}
          onSave={handleSaveAudio}
        />
      )}
      {showCustomModal && (
        <CustomDocumentModal 
          onClose={() => setShowCustomModal(false)}
          onSave={handleAddCustom}
        />
      )}

      <div className="flex items-center gap-3 mb-2">
        <div className="bg-gold/10 px-3 py-1 rounded-full flex items-center gap-2">
          <Lock size={12} className="text-gold" />
          <span className="text-[10px] font-bold text-gold uppercase tracking-widest">Encrypted Vault</span>
        </div>
      </div>
      <h1 className="font-playfair text-3xl font-black text-navy mb-2">Will & Trust & Important Documents</h1>
      <p className="text-zinc-500 mb-12">Organized for the people who need them.</p>

      {loading ? (
        <div className="py-20 text-center text-zinc-400">Loading documents...</div>
      ) : error ? (
        <div className="p-6 bg-red-50 text-red-600 rounded-3xl text-center">
          <AlertCircle className="w-8 h-8 mx-auto mb-2" />
          <p className="font-bold">{error}</p>
          <button onClick={loadDocuments} className="mt-4 underline text-sm">Try again</button>
        </div>
      ) : (
        <div className="space-y-12">
          {DOCUMENT_GROUPS.map(group => {
            const groupDocs = getDocumentsByGroup(group.types);
            if (groupDocs.length === 0 && group.id !== 'custom') return null;

            return (
              <div key={group.id} className="space-y-6">
                <div className="flex items-center gap-4">
                  <h2 className="font-bold text-navy text-xl">{group.title}</h2>
                  <div className="h-px bg-zinc-200 flex-1" />
                </div>

                <div className="grid gap-4">
                  {groupDocs.map(slot => (
                    <div key={slot.id} className="bg-white rounded-3xl border border-zinc-100 shadow-sm p-6 overflow-hidden relative">
                      
                      {/* Guidance Video Card */}
                      {slot.learn_video && (
                        <div className="mb-6 p-4 bg-navy/5 rounded-2xl flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-navy text-white rounded-xl flex items-center justify-center shrink-0">
                              <Video size={20} />
                            </div>
                            <div>
                              <h4 className="font-bold text-navy text-sm">{slot.learn_video.title}</h4>
                              <p className="text-xs text-zinc-500">{slot.learn_video.description}</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => setVideoModalUrl(slot.learn_video!.video_path)}
                            className="flex items-center gap-2 text-xs font-bold text-navy bg-white px-4 py-2 rounded-lg border border-zinc-200 hover:border-navy transition-colors shrink-0"
                          >
                            <Eye size={14} /> Watch <span className="text-zinc-400 font-normal">0:{slot.learn_video.duration_seconds}</span>
                          </button>
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-6">
                        <div className="flex-1">
                          <h3 className="font-bold text-navy text-lg">{slot.label}</h3>
                          
                          {/* Status and Subtitle */}
                          {!slot.storage_method ? (
                            <p className="text-sm text-zinc-500 mt-1">
                              {slot.upload_tier === 'upload_or_location' 
                                ? 'Upload document, record location, or leave audio instructions'
                                : 'Record where this document is stored'
                              }
                            </p>
                          ) : slot.storage_method === 'upload' ? (
                            <div className="mt-2 space-y-1">
                              <p className="text-sm font-medium text-navy bg-zinc-50 px-3 py-1.5 rounded-lg inline-block">{slot.file_name}</p>
                              <div className="flex items-center gap-2 text-xs font-bold text-zinc-400">
                                <CheckCircle2 size={14} className="text-primary" />
                                <span className="text-primary">Uploaded</span>
                                <span>●●●●●●●●</span>
                              </div>
                            </div>
                          ) : slot.storage_method === 'audio' ? (
                            <div className="mt-2 space-y-1">
                              <p className="text-sm font-medium text-navy bg-zinc-50 px-3 py-1.5 rounded-lg inline-block flex items-center gap-2"><Mic size={14} /> {slot.file_name}</p>
                              <div className="flex items-center gap-2 text-xs font-bold text-zinc-400">
                                <CheckCircle2 size={14} className="text-primary" />
                                <span className="text-primary">Audio Secured</span>
                                <span>●●●●●●●●</span>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2 space-y-1">
                              <div className="flex items-center gap-2 text-xs font-bold text-zinc-400">
                                <CheckCircle2 size={14} className="text-primary" />
                                <span className="text-primary">Location Recorded</span>
                                <span>●●●●●●●●</span>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {/* Primary Action Button */}
                          {!slot.storage_method ? (
                            <button 
                              onClick={() => {
                                setActiveSlot(slot);
                                if (slot.upload_tier === 'upload_or_location') {
                                  setShowMethodPicker(true);
                                } else {
                                  setShowLocationModal(true);
                                }
                              }}
                              className="bg-navy text-white text-sm font-bold px-6 py-3 rounded-xl hover:bg-navy/90 transition-colors"
                            >
                              Add
                            </button>
                          ) : (
                            <>
                              <button 
                                onClick={() => {
                                  setActiveSlot(slot);
                                  if (slot.upload_tier === 'upload_or_location') {
                                    setShowMethodPicker(true);
                                  } else {
                                    setShowLocationModal(true);
                                  }
                                }}
                                className="bg-zinc-100 text-navy text-sm font-bold px-6 py-3 rounded-xl hover:bg-zinc-200 transition-colors"
                              >
                                {slot.storage_method === 'upload' ? 'Replace' : slot.storage_method === 'audio' ? 'Re-record' : 'Update Location'}
                              </button>
                              
                              {/* Remove Button (Non-Required only) */}
                              {!slot.is_required && (
                                <button 
                                  onClick={() => handleClearContent(slot.id)}
                                  className="text-zinc-400 hover:text-red-500 transition-colors p-3"
                                  title="Remove content"
                                >
                                  <Trash2 size={18} />
                                </button>
                              )}
                            </>
                          )}
                        </div>

                      </div>
                      {/* Delete Custom Slot completely */}
                      {slot.document_type === 'custom' && !slot.has_location && !slot.has_upload && (
                        <div className="absolute top-4 right-4">
                           <button 
                              onClick={() => handleDeleteCustom(slot.id, slot.label)}
                              className="text-zinc-300 hover:text-red-500 transition-colors p-2"
                              title="Delete custom document"
                            >
                              <X size={18} />
                            </button>
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {/* Custom Add Button */}
                  {group.id === 'custom' && (
                    <button 
                      onClick={() => setShowCustomModal(true)}
                      className="w-full bg-zinc-50 border-2 border-dashed border-zinc-200 rounded-3xl p-6 flex flex-col items-center justify-center gap-2 hover:border-gold hover:bg-gold/5 transition-all group"
                    >
                      <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-zinc-400 group-hover:text-gold shadow-sm">
                        <Plus size={20} />
                      </div>
                      <span className="font-bold text-zinc-500 group-hover:text-navy">Add Custom Document</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
