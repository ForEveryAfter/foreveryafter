'use client';

import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  Trash2, 
  Plus, 
  ChevronRight, 
  AlertCircle, 
  Info,
  CheckCircle2,
  Mail,
  Smartphone,
  Landmark,
  TrendingUp,
  Home,
  Car,
  Shield,
  ClipboardList,
  Package,
  Settings,
  MoreVertical,
  Play,
  Pause,
  X
} from 'lucide-react';

// --- ICONS MAP ---
export const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  email: <Mail className="w-5 h-5" />,
  phone: <Smartphone className="w-5 h-5" />,
  bank: <Landmark className="w-5 h-5" />,
  investment: <TrendingUp className="w-5 h-5" />,
  property: <Home className="w-5 h-5" />,
  vehicle: <Car className="w-5 h-5" />,
  safe_deposit: <Lock className="w-5 h-5" />,
  insurance: <Shield className="w-5 h-5" />,
  storage: <Package className="w-5 h-5" />,
  custom: <Settings className="w-5 h-5" />
};

export const CATEGORY_LABELS: Record<string, string> = {
  email: 'Email Accounts',
  phone: 'Phone Unlock',
  bank: 'Bank Accounts',
  investment: 'Investments',
  property: 'Property',
  vehicle: 'Vehicles',
  safe_deposit: 'Safe / Safety Deposit Box',
  insurance: 'Insurance Policies',
  storage: 'Storage Units',
  custom: 'Custom Categories'
};

// --- AUDIO PROMPT PLAYER ---
export function AccountsAudioPrompt({ src }: { src: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState(false);
  const audioRef = React.useRef<HTMLAudioElement>(null);

  if (error) return null;

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(() => setError(true));
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-zinc-100 p-6 flex items-center gap-6 shadow-sm">
      <button 
        onClick={togglePlay}
        className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center shrink-0 hover:bg-primary/20 transition-all text-primary"
      >
        {isPlaying ? <Pause size={24} className="fill-primary" /> : <Play size={24} className="fill-primary ml-1" />}
      </button>
      <div className="flex-1">
        <p className="text-[10px] font-bold text-navy uppercase tracking-widest opacity-40 mb-1">Accounts Intro</p>
        <h4 className="font-bold text-navy">Listen before you begin</h4>
      </div>
      <audio 
        ref={audioRef}
        src={src}
        onEnded={() => setIsPlaying(false)}
        onError={() => setError(true)}
        className="hidden"
      />
    </div>
  );
}

// --- 2FA VERIFICATION SCREEN ---
export function AccountsVerificationGate({ 
  onVerified, 
  onTriggerOTP, 
  onConfirmOTP 
}: { 
  onVerified: () => void,
  onTriggerOTP: () => Promise<boolean>,
  onConfirmOTP: (code: string) => Promise<boolean>
}) {
  const [step, setStep] = useState<'trigger' | 'verify'>('trigger');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTrigger = async () => {
    setLoading(true);
    setError(null);
    const success = await onTriggerOTP();
    setLoading(false);
    if (success) {
      setStep('verify');
    } else {
      setError('Failed to send code. Please try again.');
    }
  };

  const handleConfirm = async () => {
    if (code.length !== 6) return;
    setLoading(true);
    setError(null);
    const success = await onConfirmOTP(code);
    setLoading(false);
    if (success) {
      onVerified();
    } else {
      setError('Invalid code. Please check and try again.');
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-white rounded-[40px] shadow-2xl border border-zinc-100 p-12 max-w-md w-full text-center space-y-8 animate-in fade-in zoom-in-95 duration-500">
        <div className="w-20 h-20 bg-primary/10 rounded-[28px] flex items-center justify-center text-primary mx-auto">
          <ShieldCheck size={40} />
        </div>
        
        <div className="space-y-3">
          <h2 className="font-playfair text-3xl font-black text-navy">Verify your identity</h2>
          <p className="text-zinc-500 leading-relaxed text-sm">
            Accounts & Locations contains highly sensitive information. We&apos;ll send a secure code to your registered phone number.
          </p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in slide-in-from-top-2">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {step === 'trigger' ? (
          <button
            onClick={handleTrigger}
            disabled={loading}
            className="w-full bg-navy text-white font-black py-5 rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-navy/20 disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Send Secure Code'}
          </button>
        ) : (
          <div className="space-y-6">
            <div className="space-y-2 text-left">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Enter 6-digit code</label>
              <input 
                type="text"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="w-full text-3xl font-black tracking-[0.5em] text-center bg-zinc-50 border-2 border-zinc-100 rounded-2xl py-5 focus:border-gold outline-none transition-all"
              />
            </div>
            <button
              onClick={handleConfirm}
              disabled={loading || code.length !== 6}
              className="w-full bg-gold text-white font-black py-5 rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-gold/20 disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Unlock Secure Vault'}
            </button>
            <button 
              onClick={() => setStep('trigger')}
              className="text-xs text-zinc-400 font-bold hover:text-navy transition-colors"
            >
              Didn&apos;t get a code? Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// --- ENTRY FORM MODAL ---
export function EntryForm({
  category,
  label: initialLabel,
  id,
  hasData: initialHasData,
  onClose,
  onSave
}: {
  category: string,
  label?: string,
  id?: string,
  // True when the entry being edited already has encrypted_data on the server.
  // Drives the masked-stub view (•••• Encrypted data on file + trash icon) — we
  // can't show the plaintext (server doesn't decrypt; only the TI release path
  // does), so we just confirm it's there and let the user replace it.
  hasData?: boolean,
  onClose: () => void,
  // Returns null on success, an error message on failure. Used so this modal
  // can render the error inline instead of silently sitting open if the server
  // rejects the save (e.g. encryption setup failed, RLS violation, etc.).
  onSave: (data: { label: string, data: string }) => Promise<string | null>
}) {
  const [label, setLabel] = useState(initialLabel || '');
  const [data, setData] = useState('');
  const [loading, setLoading] = useState(false);
  // Edit-existing flow: when an entry already has encrypted_data on file, hide
  // the textarea behind a masked stub. Click the trash to wipe + re-enter; the
  // existing data is only actually overwritten when the user types new text
  // and clicks Save (PATCH /accounts/entry only updates encrypted_data when
  // plaintext is provided). Without clicking trash, the user can still update
  // the label without touching the encrypted body.
  const [replacing, setReplacing] = useState(false);
  const showMaskedStub = !!id && !!initialHasData && !replacing;

  const getPlaceholders = () => {
    const maps: Record<string, { label: string, data: string }> = {
      email: { label: "e.g. Gmail, Work Email", data: "Username and password" },
      phone: { label: "e.g. iPhone, iPad", data: "Unlock PIN or passcode" },
      bank: { label: "e.g. Chase Checking", data: "Bank name, account number, login details" },
      investment: { label: "e.g. Fidelity, 401k", data: "Institution, account number, login details" },
      property: { label: "e.g. Main Home, Cabin", data: "Address, deed location, mortgage details" },
      vehicle: { label: "e.g. Toyota Camry", data: "Make, model, title location, loan details" },
      safe_deposit: { label: "e.g. Chase Bank Safe", data: "Location, combination or key location" },
      insurance: { label: "e.g. Life Insurance", data: "Provider, policy number, agent contact" },
      storage: { label: "e.g. Public Storage Unit", data: "Facility, unit number, access code" },
      custom: { label: "Give this a name", data: "Whatever your family needs to know" }
    };
    return maps[category] || maps.custom;
  };

  const placeholders = getPlaceholders();

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSave = async () => {
    if (!label) return;
    setLoading(true);
    setErrorMsg(null);
    const err = await onSave({ label, data });
    setLoading(false);
    if (err) setErrorMsg(err);
    // onSave clears showEntryForm on success — modal unmounts on its own. We
    // only have to handle the failure path here.
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-navy/20 backdrop-blur-sm">
      <div className="bg-white w-full max-w-lg rounded-[40px] shadow-2xl border border-zinc-100 overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-500">
        <div className="px-10 py-8 bg-zinc-50 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-zinc-200 text-gold">
              {CATEGORY_ICONS[category] || <Plus />}
            </div>
            <div>
              <h3 className="font-bold text-navy">{id ? 'Update' : 'Add'} {CATEGORY_LABELS[category] || 'Entry'}</h3>
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Encrypted Data</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-300 hover:text-navy transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-10 space-y-8">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Label</label>
            <input 
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={placeholders.label}
              className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-6 py-4 font-bold text-navy outline-none focus:border-gold transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Secure Details</label>
            {showMaskedStub ? (
              <div className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-6 py-4 flex items-center gap-4">
                <Lock size={16} className="text-gold shrink-0" />
                <div className="flex-1 min-w-0">
                  {/* Tabular-nums so the dots align cleanly even at different
                      browser font scales. The dots are purely decorative — the
                      real ciphertext lives server-side and is never sent to the
                      client; we can only confirm "data is on file". */}
                  <p className="text-navy font-bold tracking-[0.3em] tabular-nums truncate">
                    •••••••••••••••
                  </p>
                  <p className="text-[10px] text-zinc-400 uppercase tracking-widest mt-0.5">
                    Encrypted data on file
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setReplacing(true); setData(''); }}
                  aria-label="Replace encrypted data"
                  title="Delete and re-enter"
                  className="w-10 h-10 rounded-xl text-zinc-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors shrink-0"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ) : (
              <textarea
                value={data}
                onChange={(e) => setData(e.target.value)}
                placeholder={placeholders.data}
                rows={4}
                className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-6 py-4 text-navy outline-none focus:border-gold transition-all resize-none"
              />
            )}
            <div className="flex items-center gap-2 text-[10px] text-zinc-400 italic px-2">
              <Lock size={12} />
              {showMaskedStub
                ? 'Your saved entry is RSA-encrypted. Even LegacyBridge cannot read it. Tap the trash to delete and re-enter.'
                : 'This will be RSA-encrypted. Even LegacyBridge cannot read it.'}
            </div>
          </div>

          {errorMsg && (
            <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-2xl px-5 py-3">
              {errorMsg}
            </div>
          )}

          <div className="flex gap-4 pt-4">
            <button 
              onClick={onClose}
              className="flex-1 py-4 font-bold text-zinc-400 hover:text-navy transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              // When the user enters replace mode, they MUST type new data —
              // otherwise the PATCH is a no-op on encrypted_data (server only
              // touches it when plaintext is provided), which would be a
              // confusing "trash-then-save-changed-nothing" outcome.
              disabled={loading || !label || (!id && !data) || (replacing && !data)}
              className="flex-[2] bg-gold text-white font-black py-4 rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-gold/20 disabled:opacity-50"
            >
              {loading
                ? 'Saving...'
                : replacing
                ? 'Save New Encrypted Entry'
                : 'Save Encrypted Entry'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
