import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { differenceInCalendarDays, format } from 'date-fns';
import { PageTitle } from '../../components/PageTitle';
import { Card, RoundCheck, SectionLabel, SubjectDot, listItem } from '../../components/ui';
import {
  ALL_TOPICS,
  DSA_GOALS,
  PHASES,
  SUBJECTS,
  TOTAL_WEEKS,
  WEEKS,
  phaseForWeek,
  type SubjectId,
} from '../../data/plan';
import { fromKey, planStatus, toKey, weekNumberFor } from '../../lib/dates';
import { useNow } from '../../lib/hooks';
import { useStore } from '../../state/store';

const TEXT = { color: '#E1E0CC' };

type Filter = 'all' | SubjectId;

export default function Syllabus() {
  const { state, dispatch } = useStore();
  const now = useNow();
  const status = planStatus(now);
  const currentWeek = weekNumberFor(now);
  const [filter, setFilter] = useState<Filter>('all');
  const [pendingOnly, setPendingOnly] = useState(false);
  const [openPhases, setOpenPhases] = useState<Record<number, boolean>>(() => ({ [phaseForWeek(currentWeek).id]: true }));

  const done = (id: string) => !!state.topicsDone[id];
  // Expected window: weeks before the current one should be done; the current week may still be in progress.
  const expectedMin = status === 'after' ? TOTAL_WEEKS : status === 'before' ? 0 : currentWeek - 1;
  const expectedMax = status === 'after' ? TOTAL_WEEKS : currentWeek;

  const overallDone = ALL_TOPICS.filter((t) => done(t.id)).length;
  const overallPct = Math.round((overallDone / ALL_TOPICS.length) * 100);
  const totalDsa = Object.values(state.days).reduce((s, d) => s + d.dsa, 0);
  const goal = DSA_GOALS.find((g) => differenceInCalendarDays(g.by, now) >= 0) ?? DSA_GOALS[DSA_GOALS.length - 1];

  const chips: { id: Filter; label: string }[] = [{ id: 'all', label: 'All' }, ...SUBJECTS.map((s) => ({ id: s.id as Filter, label: s.short }))];

  return (
    <div>
      <PageTitle first="Syllabus," second="thirteen weeks deep." />

      {/* Subject progress */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2 mb-4">
        {SUBJECTS.map((s, i) => {
          const topics = ALL_TOPICS.filter((t) => t.subject === s.id);
          const n = topics.filter((t) => done(t.id)).length;
          const pct = Math.round((n / topics.length) * 100);
          let badge = 'On track';
          let tone = 'text-primary bg-primary/10';
          if (n < expectedMin) {
            badge = `Behind by ${expectedMin - n}`;
            tone = 'text-red-400/80 bg-red-400/10';
          } else if (n > expectedMax) {
            badge = `Ahead by ${n - expectedMax}`;
            tone = 'text-amber-300/80 bg-amber-300/10';
          }
          return (
            <motion.div key={s.id} custom={i} variants={listItem} initial="hidden" animate="show" className="bg-[#212121] rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <SubjectDot color={s.color} />
                <span className="text-sm truncate" style={TEXT}>
                  {s.name}
                </span>
              </div>
              <p className="text-3xl tracking-tight" style={TEXT}>
                {pct}%
              </p>
              <p className="text-xs text-gray-500 mb-3">
                {n} / {topics.length} topics
              </p>
              <div className="h-1 rounded-full bg-black/60 overflow-hidden mb-3">
                <motion.div className="h-full rounded-full" style={{ background: s.color }} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} />
              </div>
              <span className={`text-[11px] px-2 py-1 rounded-full ${tone}`}>{badge}</span>
            </motion.div>
          );
        })}
      </div>

      {/* Overall */}
      <Card className="mb-4">
        <SectionLabel right={<span className="text-xs text-gray-400 tabular-nums">{overallDone} / {ALL_TOPICS.length} · {overallPct}%</span>}>
          Overall progress
        </SectionLabel>
        <div className="relative h-2 rounded-full bg-[#212121] overflow-hidden">
          <motion.div className="h-full bg-primary rounded-full" initial={{ width: 0 }} animate={{ width: `${overallPct}%` }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} />
          {[4, 9].map((w) => (
            <span key={w} className="absolute top-0 bottom-0 w-px bg-black" style={{ left: `${(w / TOTAL_WEEKS) * 100}%` }} />
          ))}
        </div>
        <div className="relative h-5 mt-1.5 text-[10px] sm:text-[11px] text-gray-500">
          {PHASES.map((p) => {
            const startPct = ((p.weeks[0] - 1) / TOTAL_WEEKS) * 100;
            return (
              <span key={p.id} className="absolute truncate" style={{ left: `${startPct}%`, maxWidth: `${(p.weeks.length / TOTAL_WEEKS) * 100}%` }}>
                {p.id}. {p.name}
              </span>
            );
          })}
        </div>

        <div className="mt-4 pt-4 border-t border-white/5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-2" style={TEXT}>
            <SubjectDot color={SUBJECTS[0].color} /> DSA problems: <span className="tabular-nums">{totalDsa}</span>
          </span>
          {DSA_GOALS.map((g) => (
            <span key={g.label} className={`text-xs ${g === goal ? 'text-primary' : totalDsa >= g.count ? 'text-gray-500 line-through' : 'text-gray-500'}`}>
              ~{g.count} by {g.label}
            </span>
          ))}
          <div className="w-full h-1 rounded-full bg-[#212121] overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, (totalDsa / goal.count) * 100)}%`, background: SUBJECTS[0].color }} />
          </div>
        </div>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setFilter(c.id)}
            className={`min-h-[40px] px-4 rounded-full text-xs sm:text-sm transition-colors ${
              filter === c.id ? 'bg-primary text-black' : 'bg-[#101010] text-gray-400 hover:text-primary'
            }`}
          >
            {c.label}
          </button>
        ))}
        <button
          type="button"
          role="switch"
          aria-checked={pendingOnly}
          onClick={() => setPendingOnly((p) => !p)}
          className="ml-auto min-h-[40px] inline-flex items-center gap-2 text-xs sm:text-sm text-gray-400"
        >
          Show only pending
          <span className={`w-9 h-5 rounded-full relative transition-colors ${pendingOnly ? 'bg-primary' : 'bg-[#212121]'}`}>
            <motion.span
              className={`absolute top-0.5 w-4 h-4 rounded-full ${pendingOnly ? 'bg-black' : 'bg-gray-500'}`}
              animate={{ left: pendingOnly ? 18 : 2 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          </span>
        </button>
      </div>

      {/* Phases */}
      <div className="space-y-3">
        {PHASES.map((p) => {
          const open = !!openPhases[p.id];
          const phaseTopics = ALL_TOPICS.filter((t) => p.weeks.includes(t.week));
          const phaseDone = phaseTopics.filter((t) => done(t.id)).length;
          return (
            <Card key={p.id} className="!p-0 overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenPhases((o) => ({ ...o, [p.id]: !o[p.id] }))}
                className="w-full flex items-center gap-3 px-4 sm:px-5 py-4 text-left min-h-[56px]"
                aria-expanded={open}
              >
                <ChevronRight className={`w-4 h-4 text-primary transition-transform ${open ? 'rotate-90' : ''}`} />
                <span className="flex-1">
                  <span className="text-base sm:text-lg" style={TEXT}>
                    Phase {p.id} — <span className="italic font-serif">{p.name}</span>
                  </span>
                  <span className="block text-xs text-gray-500">
                    Weeks {p.weeks[0]}–{p.weeks[p.weeks.length - 1]} · {p.range}
                  </span>
                </span>
                <span className="text-xs text-gray-400 tabular-nums">
                  {phaseDone}/{phaseTopics.length}
                </span>
              </button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 px-3 sm:px-4 pb-4">
                      {p.weeks.map((wn) => {
                        const w = WEEKS[wn - 1];
                        const isCurrent = status === 'during' && wn === currentWeek;
                        const isPast = differenceInCalendarDays(w.end, now) < 0;
                        const rows = SUBJECTS.filter((s) => filter === 'all' || s.id === filter)
                          .map((s) => w.topics[s.id])
                          .filter((t) => !pendingOnly || !done(t.id));
                        if (rows.length === 0 && pendingOnly) return null;
                        return (
                          <div key={wn} className={`bg-[#212121] rounded-xl p-3 sm:p-4 border ${isCurrent ? 'border-primary/50' : 'border-transparent'}`}>
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <span className="text-sm" style={TEXT}>
                                Week {wn}
                                <span className="text-gray-500 text-xs ml-2">
                                  {format(w.start, 'd MMM')} – {format(w.end, 'd MMM')}
                                </span>
                              </span>
                              {isCurrent && <span className="text-[10px] bg-primary text-black px-2 py-0.5 rounded-full">Current week</span>}
                            </div>
                            <ul className="divide-y divide-white/5">
                              {rows.map((t) => {
                                const s = SUBJECTS.find((x) => x.id === t.subject)!;
                                const doneOn = state.topicsDone[t.id];
                                return (
                                  <li key={t.id} className="flex items-center gap-3 py-2">
                                    <SubjectDot color={s.color} />
                                    <div className="flex-1 min-w-0">
                                      <p className={`text-sm transition-opacity ${doneOn ? 'line-through opacity-50' : ''}`} style={TEXT}>
                                        {t.title}
                                      </p>
                                      <p className="text-[11px] text-gray-500">
                                        {s.short}
                                        {doneOn && ` · done ${format(fromKey(doneOn), 'd MMM')}`}
                                        {!doneOn && isPast && <span className="text-red-400/70"> · Overdue</span>}
                                      </p>
                                    </div>
                                    <RoundCheck
                                      size="sm"
                                      checked={!!doneOn}
                                      onChange={() => dispatch({ type: 'toggleTopic', topicId: t.id, date: toKey(now) })}
                                      label={`Mark ${t.title} done`}
                                    />
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
