import { AnimatePresence, motion } from 'framer-motion';
import { Cloud, Download, LogOut, Upload, Trash2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { format } from 'date-fns';
import { todayKey, useStore, useSync } from '../state/store';
import { useToast } from '../components/ui';

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { dispatch, exportAll } = useStore();
  const { status, enabled, signOut } = useSync();
  const signedIn = enabled && status.mode !== 'signedOut' && status.mode !== 'disabled';
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportJson = () => {
    try {
      const blob = new Blob([JSON.stringify(exportAll(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prisma-backup-${format(new Date(), 'yyyy-MM-dd')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Backup exported');
    } catch {
      setError('Could not export the backup.');
    }
  };

  const importJson = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      if (typeof parsed !== 'object' || parsed === null || !('days' in parsed)) throw new Error('bad');
      dispatch({ type: 'import', state: parsed, today: todayKey() });
      setError(null);
      toast('Backup imported');
      onClose();
    } catch {
      setError("That file doesn't look like a Prisma backup.");
    }
  };

  const close = () => {
    setConfirmReset(false);
    setError(null);
    onClose();
  };

  const btn =
    'w-full min-h-[44px] flex items-center gap-3 px-4 rounded-xl bg-[#212121] hover:bg-[#2a2a2a] transition-colors text-sm text-left';

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
            aria-label="Settings"
            className="w-full max-w-sm bg-[#101010] rounded-2xl p-5 border border-white/5"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg" style={{ color: '#E1E0CC' }}>
                Settings
              </h2>
              <button type="button" onClick={close} aria-label="Close" className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#212121]">
                <X className="w-4 h-4 text-primary" />
              </button>
            </div>

            <div className="space-y-2" style={{ color: '#E1E0CC' }}>
              <button type="button" className={btn} onClick={exportJson}>
                <Download className="w-4 h-4 text-primary" /> Export JSON backup
              </button>
              <button type="button" className={btn} onClick={() => fileRef.current?.click()}>
                <Upload className="w-4 h-4 text-primary" /> Import JSON backup
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importJson(f);
                  e.target.value = '';
                }}
              />
              {!confirmReset ? (
                <button type="button" className={btn} onClick={() => setConfirmReset(true)}>
                  <Trash2 className="w-4 h-4 text-red-400/70" /> Reset all data
                </button>
              ) : (
                <div className="rounded-xl bg-[#212121] p-4">
                  <p className="text-sm text-gray-400 mb-3">
                    Erase every day, topic and review on this device? This can't be undone.{signedIn ? ' Rows already synced stay in your account.' : ''}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="flex-1 min-h-[40px] rounded-full bg-red-400/20 text-red-300 text-sm hover:bg-red-400/30"
                      onClick={() => {
                        dispatch({ type: 'reset', today: todayKey() });
                        toast('All data reset');
                        close();
                      }}
                    >
                      Yes, reset
                    </button>
                    <button type="button" className="flex-1 min-h-[40px] rounded-full bg-black text-sm" onClick={() => setConfirmReset(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {error && <p className="text-xs text-red-400/70 pt-1">{error}</p>}
            </div>
            {signedIn && (
              <div className="mt-4 pt-4 border-t border-white/5 space-y-2" style={{ color: '#E1E0CC' }}>
                <p className="text-xs text-gray-400 flex items-center gap-2">
                  <Cloud className="w-3.5 h-3.5 text-primary" /> Syncing as <span className="text-primary truncate">{status.email}</span>
                </p>
                <button
                  type="button"
                  className={btn}
                  onClick={async () => {
                    try {
                      await signOut();
                      toast('Signed out — data stays on this device');
                      close();
                    } catch {
                      setError('Could not sign out. Try again.');
                    }
                  }}
                >
                  <LogOut className="w-4 h-4 text-primary" /> Sign out
                </button>
              </div>
            )}
            <p className="text-[11px] text-gray-500 mt-5">
              {signedIn ? 'Saved on this device and synced to your account.' : 'Data lives only in this browser. Export a backup now and then.'}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
