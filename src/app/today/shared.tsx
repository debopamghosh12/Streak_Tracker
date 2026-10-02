import { AnimatePresence, motion } from 'framer-motion';
import { Pencil } from 'lucide-react';
import { SUBJECT_BY_ID } from '../../data/plan';
import type { TaskSubject } from '../../state/types';

export const TEXT = { color: '#E1E0CC' };
export const MAX_SKIPS = 3;

export const subjectLabel = (s: TaskSubject) => (s ? SUBJECT_BY_ID[s].short : 'Other');
export const subjectColor = (s: TaskSubject) => (s ? SUBJECT_BY_ID[s].color : '#555');

export const fieldCls =
  'w-full min-h-[40px] bg-black/50 rounded-lg px-3 text-sm placeholder:text-gray-500 outline-none focus:ring-1 focus:ring-primary/40 [color-scheme:dark]';
export const smallBtn = 'min-h-[40px] px-4 rounded-full text-xs transition-colors';
export const iconBtn = 'w-10 h-10 shrink-0 rounded-full flex items-center justify-center transition-colors';

export function EditButton({ onClick, active, label }: { onClick: () => void; active: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={active}
      className={`${iconBtn} hover:text-primary ${active ? 'text-primary' : 'text-gray-500'}`}
    >
      <Pencil className="w-4 h-4" />
    </button>
  );
}

/** Height-expand panel used for inline edit forms. */
export function Expand({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
