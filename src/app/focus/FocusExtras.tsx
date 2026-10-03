import { AnimatePresence, motion } from 'framer-motion';
import { Eye, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { loadFocusRuntime } from './FocusHost';
import { updateFocusSettings, useFocusSettings } from './focusSettings';
import { setFocusStatus, useFocusStatus } from './focusStatus';

/** Lazily loaded: the first-run explainer and the optional self-view. */
export default function FocusExtras() {
  const settings = useFocusSettings();
  return (
    <>
      <FocusExplainer />
      {settings.preview && <SelfView />}
    </>
  );
}

/** First-run explainer, then the camera permission prompt. */
function FocusExplainer() {
  const status = useFocusStatus();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setError(null);
    setFocusStatus({ explainOpen: false });
  };

  const turnOn = async () => {
    setBusy(true);
    setError(null);
    try {
      const rt = await loadFocusRuntime();
      rt.primeAudio();
      // Ask for the camera now (the user just clicked), then release it until a stopwatch runs.
      const stream = await rt.openCamera();
      stream.getTracks().forEach((t) => t.stop());
      await rt.requestNotifications();
      updateFocusSettings({ enabled: true, explained: true });
      close();
    } catch (err) {
      const name = (err as { name?: string })?.name;
      setError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Camera permission was denied. You can allow it from the camera icon in the address bar, then try again.'
          : 'No camera was found. Connect one and try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {status.explainOpen && (
        <motion.div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="focus-explainer-title"
            className="w-full max-w-md bg-[#101010] rounded-2xl p-5 border border-white/5 space-y-3"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            style={{ color: '#E1E0CC' }}
          >
            <div className="flex items-center justify-between">
              <h2 id="focus-explainer-title" className="text-lg inline-flex items-center gap-2">
                <Eye className="w-5 h-5 text-primary" /> Focus <span className="italic font-serif">watch</span>
              </h2>
              <button type="button" onClick={close} aria-label="Close" className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-[#212121]">
                <X className="w-4 h-4 text-primary" />
              </button>
            </div>
            <p className="text-sm text-gray-400">While a stopwatch runs, your camera checks every 2 seconds whether you're:</p>
            <ul className="text-sm text-gray-300 space-y-1 list-disc pl-5">
              <li>at the screen (writing in a notebook counts),</li>
              <li>looking away or away from your desk,</li>
              <li>holding your phone.</li>
            </ul>
            <p className="text-sm text-gray-400">
              If you drift for a while you get a gentle warning. It never pauses your stopwatch unless you turn that on.
            </p>
            <p className="text-sm text-primary/90">
              Video never leaves this device and nothing is recorded. Only numbers (focused, distracted and away seconds, phone pickups) are saved.
            </p>
            <p className="text-[11px] text-gray-500">The on-device models (~8 MB) and runtime are downloaded once from Google's official MediaPipe servers.</p>
            {error && <p className="text-xs text-red-400/80">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button type="button" disabled={busy} onClick={turnOn} className="min-h-[44px] px-5 rounded-full bg-primary text-black text-sm flex-1 disabled:opacity-60">
                {busy ? 'Asking for camera…' : 'Turn on and allow camera'}
              </button>
              <button type="button" onClick={close} className="min-h-[44px] px-5 rounded-full bg-[#212121] text-gray-300 text-sm">
                Not now
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Optional tiny self-view (off by default). The stream is only shown, never captured. */
function SelfView() {
  const status = useFocusStatus();
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = status.stream;
  }, [status.stream]);
  if (!status.stream) return null;
  return (
    <video
      ref={ref}
      autoPlay
      muted
      playsInline
      aria-label="Your camera (self-view, not recorded)"
      className="fixed bottom-4 left-4 z-40 w-36 h-[108px] object-cover rounded-xl border border-white/10 shadow-xl -scale-x-100"
    />
  );
}
