import React, { useState } from 'react';
import { X, UploadCloud, MapPin, FileText, AlertCircle, Mic } from 'lucide-react';

export function MethodPickerModal({
  label,
  onClose,
  onPickUpload,
  onPickLocation,
  onPickAudio
}: {
  label: string;
  onClose: () => void;
  onPickUpload: () => void;
  onPickLocation: () => void;
  onPickAudio: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-navy/20 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl border border-zinc-100 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        <div className="p-8 text-center relative">
          <button onClick={onClose} className="absolute top-6 right-6 text-zinc-300 hover:text-navy">
            <X size={20} />
          </button>
          <div className="w-16 h-16 bg-zinc-50 rounded-2xl flex items-center justify-center mx-auto mb-6 text-gold">
            <FileText size={32} />
          </div>
          <h3 className="font-playfair text-2xl font-black text-navy mb-2">{label}</h3>
          <p className="text-sm text-zinc-500 mb-8">How would you like to record this document?</p>
          
          <div className="space-y-4">
            <button 
              onClick={onPickUpload}
              className="w-full flex items-center p-5 rounded-2xl border-2 border-zinc-100 hover:border-gold hover:bg-gold/5 transition-all group"
            >
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-zinc-400 group-hover:text-gold shadow-sm mr-4">
                <UploadCloud size={20} />
              </div>
              <div className="text-left">
                <div className="font-bold text-navy group-hover:text-gold transition-colors">Upload Document</div>
                <div className="text-xs text-zinc-400">Securely store a PDF copy</div>
              </div>
            </button>
            <button 
              onClick={onPickLocation}
              className="w-full flex items-center p-5 rounded-2xl border-2 border-zinc-100 hover:border-gold hover:bg-gold/5 transition-all group"
            >
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-zinc-400 group-hover:text-gold shadow-sm mr-4">
                <MapPin size={20} />
              </div>
              <div className="text-left">
                <div className="font-bold text-navy group-hover:text-gold transition-colors">Record Location</div>
                <div className="text-xs text-zinc-400">Tell your family where to find it</div>
              </div>
            </button>
            <button 
              onClick={onPickAudio}
              className="w-full flex items-center p-5 rounded-2xl border-2 border-zinc-100 hover:border-gold hover:bg-gold/5 transition-all group"
            >
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-zinc-400 group-hover:text-gold shadow-sm mr-4">
                <Mic size={20} />
              </div>
              <div className="text-left">
                <div className="font-bold text-navy group-hover:text-gold transition-colors">Audio Instructions</div>
                <div className="text-xs text-zinc-400">Record special instructions securely</div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import Recorder from '../Recorder';

export function AudioInstructionModal({
  label,
  hasExisting,
  onClose,
  onSave
}: {
  label: string;
  hasExisting: boolean;
  onClose: () => void;
  onSave: (blob: Blob) => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSave = async (blob: Blob) => {
    setLoading(true);
    setError(null);
    try {
      await onSave(blob);
    } catch (err: any) {
      setError(err.message || 'Save failed');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-navy/20 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl border border-zinc-100 overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-500">
        <div className="px-10 py-8 bg-zinc-50 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-zinc-200 text-gold">
              <Mic size={20} />
            </div>
            <div>
              <h3 className="font-bold text-navy">Record Instructions</h3>
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">{label}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-300 hover:text-navy transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-10 space-y-6">
          {hasExisting && (
            <div className="p-4 bg-orange-50 text-orange-800 rounded-2xl text-xs font-bold flex items-start gap-3">
              <AlertCircle size={16} className="mt-0.5 shrink-0" /> 
              This will replace your current document or instructions. Continue?
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-bold flex items-center gap-2">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <Recorder type="audio" onSave={handleSave} />

          {loading && (
            <div className="text-center pt-4 text-sm font-bold text-gold animate-pulse">
              Encrypting & Saving Audio...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function UploadModal({
  label,
  hasExisting,
  onClose,
  onUpload
}: {
  label: string;
  hasExisting: boolean;
  onClose: () => void;
  onUpload: (file: File) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    
    if (selected.type !== 'application/pdf') {
      setError('Please select a PDF file.');
      return;
    }
    
    if (selected.size > 25 * 1024 * 1024) {
      setError('File size must be under 25MB.');
      return;
    }

    setError(null);
    setFile(selected);
  };

  const handleSave = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      await onUpload(file);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-navy/20 backdrop-blur-sm">
      <div className="bg-white w-full max-w-lg rounded-[40px] shadow-2xl border border-zinc-100 overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-500">
        <div className="px-10 py-8 bg-zinc-50 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-zinc-200 text-gold">
              <UploadCloud size={20} />
            </div>
            <div>
              <h3 className="font-bold text-navy">Upload Document</h3>
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">{label}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-300 hover:text-navy transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-10 space-y-6">
          {hasExisting && (
            <div className="p-4 bg-orange-50 text-orange-800 rounded-2xl text-xs font-bold flex items-start gap-3">
              <AlertCircle size={16} className="mt-0.5 shrink-0" /> 
              This will replace your current uploaded document or recorded location. Continue?
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-bold flex items-center gap-2">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Select PDF (Max 25MB)</label>
            <input 
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-6 py-4 font-bold text-navy outline-none focus:border-gold transition-all file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-gold file:text-white hover:file:bg-gold/90"
            />
          </div>

          <div className="flex gap-4 pt-4">
            <button 
              onClick={onClose}
              className="flex-1 py-4 font-bold text-zinc-400 hover:text-navy transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={handleSave}
              disabled={loading || !file}
              className="flex-[2] bg-gold text-white font-black py-4 rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-gold/20 disabled:opacity-50"
            >
              {loading ? 'Uploading & Encrypting...' : 'Upload & Encrypt'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LocationModal({
  label,
  hasExisting,
  onClose,
  onSave
}: {
  label: string;
  hasExisting: boolean;
  onClose: () => void;
  onSave: (locationText: string) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await onSave(text.trim());
    } catch (err: any) {
      setError(err.message || 'Save failed');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-navy/20 backdrop-blur-sm">
      <div className="bg-white w-full max-w-lg rounded-[40px] shadow-2xl border border-zinc-100 overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-500">
        <div className="px-10 py-8 bg-zinc-50 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-zinc-200 text-gold">
              <MapPin size={20} />
            </div>
            <div>
              <h3 className="font-bold text-navy">Record Location</h3>
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">{label}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-300 hover:text-navy transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-10 space-y-6">
          {hasExisting && (
            <div className="p-4 bg-orange-50 text-orange-800 rounded-2xl text-xs font-bold flex items-start gap-3">
              <AlertCircle size={16} className="mt-0.5 shrink-0" /> 
              This will replace your current uploaded document or recorded location. Continue?
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-bold flex items-center gap-2">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Where is this document stored?</label>
            <textarea 
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. In the top drawer of my desk, or with my attorney John Smith at 555-1234"
              rows={4}
              className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-6 py-4 text-navy outline-none focus:border-gold transition-all resize-none"
            />
          </div>

          <div className="flex gap-4 pt-4">
            <button 
              onClick={onClose}
              className="flex-1 py-4 font-bold text-zinc-400 hover:text-navy transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={handleSave}
              disabled={loading || !text.trim()}
              className="flex-[2] bg-gold text-white font-black py-4 rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-gold/20 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Location'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CustomDocumentModal({
  onClose,
  onSave
}: {
  onClose: () => void;
  onSave: (label: string, uploadTier: string) => Promise<void>;
}) {
  const [label, setLabel] = useState('');
  const [tier, setTier] = useState('upload_or_location');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!label.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await onSave(label.trim(), tier);
    } catch (err: any) {
      setError(err.message || 'Save failed');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-navy/20 backdrop-blur-sm">
      <div className="bg-white w-full max-w-lg rounded-[40px] shadow-2xl border border-zinc-100 overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-500">
        <div className="px-10 py-8 bg-zinc-50 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-zinc-200 text-gold">
              <FileText size={20} />
            </div>
            <div>
              <h3 className="font-bold text-navy">Add Custom Document</h3>
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Create New Slot</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-300 hover:text-navy transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-10 space-y-6">
          {error && (
            <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-bold flex items-center gap-2">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Document Name</label>
            <input 
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Pre-nup Agreement"
              className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-6 py-4 font-bold text-navy outline-none focus:border-gold transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Storage Method</label>
            <select 
              value={tier}
              onChange={(e) => setTier(e.target.value)}
              className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-6 py-4 text-navy outline-none focus:border-gold transition-all appearance-none"
            >
              <option value="upload_or_location">Upload or record location (Default)</option>
              <option value="location_only">Record location only</option>
            </select>
          </div>

          <div className="flex gap-4 pt-4">
            <button 
              onClick={onClose}
              className="flex-1 py-4 font-bold text-zinc-400 hover:text-navy transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={handleSave}
              disabled={loading || !label.trim()}
              className="flex-[2] bg-gold text-white font-black py-4 rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-gold/20 disabled:opacity-50"
            >
              {loading ? 'Adding...' : 'Add Document'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
