import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown, ArrowUp, ArrowUpDown, Inbox, Clock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { iconBtn } from './shared';

export interface MoveOption {
  key: string;
  label: string;
  icon?: 'up' | 'down' | 'slot' | 'tray';
  disabled?: boolean;
  onSelect: () => void;
}

const ICONS = { up: ArrowUp, down: ArrowDown, slot: Clock, tray: Inbox };

/**
 * "Move to…" menu: every drag action without dragging (the main path on phones).
 * Phones: a bottom sheet pinned to the screen edges; wider screens: a dropdown under the button.
 * Closes on outside click and Escape; arrow keys move between options.
 */
export function MoveMenu({ label, options }: { label: string; options: MoveOption[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`Move ${label}…`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`${iconBtn} hover:text-primary ${open ? 'text-primary' : 'text-gray-500'}`}
      >
        <ArrowUpDown className="w-4 h-4" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label={`Move ${label}`}
            onKeyDown={onMenuKey}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="fixed inset-x-3 bottom-3 max-h-[60vh] sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-1 sm:w-56 sm:max-h-72 z-40 overflow-y-auto scrollbar-thin rounded-xl bg-[#181818] border border-white/10 p-1 shadow-2xl"
          >
            <p className="px-3 pt-1.5 pb-1 text-[10px] uppercase tracking-[0.18em] text-gray-500">Move to…</p>
            {options.map((o) => {
              const Icon = o.icon ? ICONS[o.icon] : null;
              return (
                <button
                  key={o.key}
                  type="button"
                  role="menuitem"
                  disabled={o.disabled}
                  onClick={() => {
                    o.onSelect();
                    setOpen(false);
                  }}
                  className="w-full min-h-[40px] px-3 rounded-lg text-left text-sm flex items-center gap-2 hover:bg-[#212121] focus:bg-[#212121] outline-none disabled:opacity-35 disabled:hover:bg-transparent"
                  style={{ color: '#E1E0CC' }}
                >
                  {Icon && <Icon className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                  <span className="truncate">{o.label}</span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
