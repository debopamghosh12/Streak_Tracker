import { AnimatePresence, motion } from 'framer-motion';
import { Cloud, CloudOff, Mail, RefreshCw, X } from 'lucide-react';
import { useState } from 'react';
import type { SyncMode } from '../lib/storage';
import { useSync } from '../state/store';

const LABELS: Record<Exclude<SyncMode, 'disabled' | 'signedOut'>, string> = {
  synced: 'Synced',
  syncing: 'Syncing…',
  offline: 'Offline — saved locally',
  error: 'Sync error, retrying',
};

const pill =
  'min-h-[40px] -my-2 px-3 rounded-full bg-[#212121] hover:bg-[#2a2a2a] transition-colors inline-flex items-center gap-2 text-xs max-w-full';

/** Status-strip pill: "Sign in to sync" when signed out, otherwise email + sync status. Hidden without Supabase config. */
export function SyncPill({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { status, enabled } = useSync();
  const [signInOpen, setSignInOpen] = useState(false);
  if (!enabled || status.mode === 'disabled') return null;

  if (status.mode === 'signedOut') {
    return (
      <>
        <button type="button" onClick={() => setSignInOpen(true)} className={`${pill} text-primary`}>
          <Cloud className="w-3.5 h-3.5" /> Sign in to sync
        </button>
        <SignInModal open={signInOpen} onClose={() => setSignInOpen(false)} />
      </>
    );
  }

  const mode = status.mode;
  const Icon = mode === 'syncing' ? RefreshCw : mode === 'synced' ? Cloud : CloudOff;
  const tone = mode === 'error' ? 'text-amber-300/80' : mode === 'offline' ? 'text-gray-400' : 'text-primary';
  return (
    <button type="button" onClick={onOpenSettings} className={pill} title={status.email ?? undefined} aria-label={`${LABELS[mode]} — ${status.email ?? ''}`}>
      <Icon className={`w-3.5 h-3.5 shrink-0 ${tone} ${mode === 'syncing' ? 'animate-spin' : ''}`} />
      <span className={tone}>{LABELS[mode]}</span>
      <span className="hidden md:inline text-gray-500 truncate max-w-[180px]">{status.email}</span>
    </button>
  );
}

export function SignInModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { signIn } = useSync();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setState('idle');
    setError(null);
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.');
    setError(null);
    setState('sending');
    try {
      await signIn(email.trim());
      setState('sent');
    } catch (err) {
      setState('idle');
      setError(err instanceof Error ? err.message : 'Could not send the link. Try again.');
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Sign in to sync"
            className="w-full max-w-sm bg-[#101010] rounded-2xl p-5 border border-white/5"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            style={{ color: '#E1E0CC' }}
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg">
                Sign in to <span className="italic font-serif">sync</span>
              </h2>
              <button type="button" onClick={close} aria-label="Close" className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#212121]">
                <X className="w-4 h-4 text-primary" />
              </button>
            </div>
            {state === 'sent' ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-400">
                  Check <span className="text-primary">{email.trim()}</span> for a sign-in link. Open it on the device you want to sync —
                  your local data stays put and merges in.
                </p>
                <button type="button" onClick={close} className="min-h-[40px] px-5 rounded-full bg-primary text-black text-sm">
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <p className="text-sm text-gray-400">Get a magic link by email. No password. Your data keeps working offline.</p>
                <input
                  type="email"
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full min-h-[44px] bg-[#212121] rounded-xl px-4 text-sm placeholder:text-gray-500 outline-none focus:ring-1 focus:ring-primary/40"
                />
                {error && <p className="text-xs text-red-400/70">{error}</p>}
                <button
                  type="submit"
                  disabled={state === 'sending'}
                  className="w-full min-h-[44px] rounded-full bg-primary text-black text-sm inline-flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {state === 'sending' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  Send magic link
                </button>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
