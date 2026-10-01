import { AnimatePresence, motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

/* ---------- Round checkbox with spring tick ---------- */

export function RoundCheck({
  checked,
  onChange,
  label,
  size = 'lg',
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  size?: 'lg' | 'sm';
}) {
  const dim = size === 'lg' ? 'w-10 h-10' : 'w-8 h-8';
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`${size === 'sm' ? 'p-1 -m-1' : ''} shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60`}
    >
      <span
        className={`${dim} relative flex items-center justify-center rounded-full border transition-colors duration-300 ${
          checked ? 'border-primary' : 'border-primary/30 hover:border-primary/60'
        }`}
      >
        <AnimatePresence>
          {checked && (
            <motion.span
              key="fill"
              className="absolute inset-0 rounded-full bg-primary flex items-center justify-center"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 28 }}
            >
              <Check className={size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'} strokeWidth={3} color="#000" />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </button>
  );
}

/* ---------- Progress ring ---------- */

export function ProgressRing({ pct, size = 64, stroke = 4, children }: { pct: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#2a2a2a" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="#DEDBC8"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c - (clamped / 100) * c }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-xs" style={{ color: '#E1E0CC' }}>
        {children ?? `${Math.round(clamped)}%`}
      </div>
    </div>
  );
}

export function SubjectDot({ color, className = '' }: { color: string; className?: string }) {
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${className}`} style={{ background: color }} />;
}

export function Card({ children, className = '', tone = 'dark' }: { children: ReactNode; className?: string; tone?: 'dark' | 'light' }) {
  return (
    <div className={`${tone === 'dark' ? 'bg-[#101010]' : 'bg-[#212121]'} rounded-2xl p-4 sm:p-5 ${className}`}>{children}</div>
  );
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h3 className="text-primary text-[10px] sm:text-xs uppercase tracking-[0.18em]">{children}</h3>
      {right}
    </div>
  );
}

/* ---------- Toast ---------- */

interface ToastOpts {
  action?: { label: string; onClick: () => void };
  duration?: number;
}
type ShowToast = (msg: string, opts?: ToastOpts) => void;

const ToastContext = createContext<ShowToast>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; opts?: ToastOpts; n: number } | null>(null);
  const timer = useRef<number>();
  const show = useCallback<ShowToast>((msg, opts) => {
    setToast((t) => ({ msg, opts, n: (t?.n ?? 0) + 1 }));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), opts?.duration ?? 1800);
  }, []);
  const dismiss = () => {
    window.clearTimeout(timer.current);
    setToast(null);
  };
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60]" aria-live="polite">
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.n}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="bg-primary text-black text-sm pl-4 pr-1.5 py-1.5 rounded-full shadow-lg flex items-center gap-2 whitespace-nowrap"
            >
              {!toast.opts?.action && <Check className="w-4 h-4" />}
              <span className={toast.opts?.action ? '' : 'pr-2.5'}>{toast.msg}</span>
              {toast.opts?.action && (
                <button
                  type="button"
                  onClick={() => {
                    toast.opts?.action?.onClick();
                    dismiss();
                  }}
                  className="min-h-[32px] px-3 rounded-full bg-black text-primary text-xs hover:opacity-90"
                >
                  {toast.opts.action.label}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/* ---------- Stagger list helpers ---------- */

export const listItem = {
  hidden: { opacity: 0, y: 10 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.4, ease: [0.16, 1, 0.3, 1] } }),
};
