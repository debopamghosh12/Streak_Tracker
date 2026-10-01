import { motion } from 'framer-motion';
import { Flame, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { AppNavLinks, PillShell } from '../components/PillNav';
import { useNow } from '../lib/hooks';
import { longDate, planStatus, weekNumberFor } from '../lib/dates';
import { currentStreak, statsFor } from '../lib/streak';
import { phaseForWeek } from '../data/plan';
import { useStore } from '../state/store';
import { SettingsModal } from './SettingsModal';
import { SyncPill } from './SyncPill';

function StatusStrip({ onSettings }: { onSettings: () => void }) {
  const { state } = useStore();
  const now = useNow();
  const status = planStatus(now);
  const week = weekNumberFor(now);
  const phase = phaseForWeek(week);
  const streak = currentStreak(state, now);
  const today = statsFor(state, now);

  return (
    <div className="bg-[#101010] rounded-2xl px-4 py-3 sm:px-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs sm:text-sm">
      <span style={{ color: '#E1E0CC' }}>{longDate(now)}</span>
      <span className="text-gray-400">
        {status === 'after' ? (
          'Plan complete'
        ) : (
          <>
            Week {week} of 13 · Phase {phase.name}
            {status === 'before' && <span className="text-amber-300/70"> · Starts Fri 2 Oct</span>}
          </>
        )}
      </span>
      <span className="inline-flex items-center gap-1.5 text-primary">
        <Flame className="w-4 h-4 text-amber-300" /> {streak} day{streak === 1 ? '' : 's'}
      </span>
      <div className="flex items-center gap-2 flex-1 min-w-[140px]">
        <div className="h-px flex-1 bg-[#2a2a2a] relative overflow-hidden rounded-full" style={{ height: 2 }}>
          <motion.div
            className="absolute inset-y-0 left-0 bg-primary"
            initial={false}
            animate={{ width: `${today.pct}%` }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
        <span className="text-gray-400 tabular-nums w-9 text-right">{today.pct}%</span>
      </div>
      <SyncPill onOpenSettings={onSettings} />
      <button
        type="button"
        onClick={onSettings}
        aria-label="Settings"
        className="w-10 h-10 -my-2 -mr-2 flex items-center justify-center rounded-full hover:bg-[#212121] transition-colors"
      >
        <Settings className="w-4 h-4 text-primary/80" />
      </button>
    </div>
  );
}

export function AppShell() {
  const location = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="relative min-h-screen bg-black" style={{ color: '#E1E0CC' }}>
      <div className="bg-noise fixed inset-0 opacity-[0.15] pointer-events-none" />

      <header className="relative z-10">
        <Link
          to="/"
          className="absolute left-4 md:left-6 top-2 md:top-3 text-base md:text-xl tracking-[-0.04em] min-h-[40px] items-center hidden sm:inline-flex"
          style={{ color: '#E1E0CC' }}
        >
          Persist<sup className="text-[0.6em] -top-[0.4em]">*</sup>
        </Link>
        <div className="flex justify-center">
          <PillShell>
            <li className="sm:hidden">
              <Link to="/" className="text-[10px] py-2 inline-flex" style={{ color: '#E1E0CC' }}>
                P*
              </Link>
            </li>
            <AppNavLinks />
          </PillShell>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-4 md:px-6 pt-5 pb-24">
        <StatusStrip onSettings={() => setSettingsOpen(true)} />
        <motion.div key={location.pathname} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
          <Outlet />
        </motion.div>
      </main>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
