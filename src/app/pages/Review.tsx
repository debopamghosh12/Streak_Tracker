import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronLeft, ChevronRight, Copy, X } from 'lucide-react';
import { useState } from 'react';
import { differenceInCalendarDays } from 'date-fns';
import { PageTitle } from '../../components/PageTitle';
import { Card, ProgressRing, RoundCheck, SectionLabel, SubjectDot, listItem, useToast } from '../../components/ui';
import { SUBJECT_BY_ID, WEEKLY_APPS_MIN, WEEKLY_DSA_MIN, WEEKLY_TARGETS, type SubjectId } from '../../data/plan';
import { fromKey, toKey, weekDays, weekNumberFor, weekRangeLabel } from '../../lib/dates';
import { getWeek, lastShownWeek } from '../../lib/planModel';
import { copyText, useNow } from '../../lib/hooks';
import { statsFor } from '../../lib/streak';
import { effectiveHours } from '../../lib/hours';
import { emptyReview, useStore } from '../../state/store';
import type { ReviewRecord, TrackerState } from '../../state/types';

const TEXT = { color: '#E1E0CC' };

interface Row {
  subject: SubjectId;
  target: string;
  actual: string;
  met: boolean;
  toggle?: keyof Pick<ReviewRecord, 'javaShipped' | 'aiBuilt'>;
}

export function weekScore(state: TrackerState, n: number) {
  const days = weekDays(n);
  const keys = days.map(toKey);
  const sum = (f: 'dsa' | 'apps') => keys.reduce((s, k) => s + (state.days[k]?.[f] ?? 0), 0);
  const review = state.reviews[String(n)] ?? emptyReview();
  // Topics and target text come from the effective plan; weeks without custom targets use the standard five.
  const w = getWeek(state.plan, n);
  const inWeek = (iso: string) => {
    const d = fromKey(iso);
    return differenceInCalendarDays(d, w.start) >= 0 && differenceInCalendarDays(d, w.end) <= 0;
  };
  const csThisWeek = Object.entries(state.topicsDone).filter(([id, on]) => id.endsWith('-cs') && inWeek(on)).length;
  const csMet = csThisWeek > 0 || !!state.topicsDone[w.topics.cs.id];
  const aptTopic = !!state.topicsDone[w.topics.apt.id];
  const dsa = sum('dsa');
  const apps = sum('apps');

  const rows: Row[] = WEEKLY_TARGETS.map(({ subject }) => {
    const target = w.targets[subject];
    switch (subject) {
      case 'dsa':
        return { subject, target, actual: `${dsa} problems`, met: dsa >= WEEKLY_DSA_MIN };
      case 'java':
        return { subject, target, actual: review.javaShipped ? 'Shipped' : 'Not yet', met: review.javaShipped, toggle: 'javaShipped' };
      case 'cs':
        return { subject, target, actual: `${csThisWeek} topic${csThisWeek === 1 ? '' : 's'} checked`, met: csMet };
      case 'ai':
        return { subject, target, actual: review.aiBuilt ? 'Built' : 'Not yet', met: review.aiBuilt, toggle: 'aiBuilt' };
      case 'apt':
        return { subject, target, actual: `Topic ${aptTopic ? '✓' : '✗'} · ${apps} applications`, met: aptTopic && apps >= WEEKLY_APPS_MIN };
    }
  });
  const score = Math.round((rows.filter((r) => r.met).length / rows.length) * 100);
  const daysCounted = days.filter((d) => statsFor(state, d).counts).length;
  const hours = Math.round(keys.reduce((s, k) => s + effectiveHours(state, k, Date.now()).hours, 0) * 100) / 100;
  return { rows, score, review, dsa, apps, daysCounted, hours, phase: w.phase };
}

export default function Review() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const now = useNow();
  const [week, setWeek] = useState(() => weekNumberFor(now));
  const { rows, score, review, daysCounted, hours, phase } = weekScore(state, week);
  // No cap: up to the current week and any later planned week.
  const maxWeek = lastShownWeek(state.plan, now);

  const started = (n: number) => differenceInCalendarDays(getWeek(state.plan, n).start, now) <= 0;
  const prev = week > 1 ? weekScore(state, week - 1) : null;
  const rebalance = !!prev && started(week) && score < 70 && prev.score < 70;

  const patch = (p: Partial<ReviewRecord>) => dispatch({ type: 'updateReview', week, patch: p });

  const copy = async () => {
    const lines = [
      `Weekly review — Week ${week} (${weekRangeLabel(week)}, Phase ${phase.name})`,
      `Score: ${score}% of targets met · ${daysCounted}/7 days counted · ${hours} hrs studied`,
      '',
      ...rows.map((r) => `${r.met ? '✓' : '✗'} ${SUBJECT_BY_ID[r.subject].name}: ${r.actual} (target: ${r.target})`),
      '',
      `What went well: ${review.well.trim() || '—'}`,
      `What slipped: ${review.slipped.trim() || '—'}`,
      `Change for next week: ${review.change.trim() || '—'}`,
    ];
    if (rebalance) lines.push('', 'Note: two weeks under 70% — rebalance the plan.');
    toast((await copyText(lines.join('\n'))) ? 'Copied' : 'Copy failed');
  };

  const navBtn = 'w-10 h-10 rounded-full bg-[#212121] flex items-center justify-center hover:bg-[#2a2a2a] disabled:opacity-30 transition-colors';

  return (
    <div>
      <PageTitle
        first="Review,"
        second="every Sunday."
        aside={
          <div className="flex items-center gap-2">
            <button type="button" className={navBtn} disabled={week <= 1} onClick={() => setWeek((n) => n - 1)} aria-label="Previous week">
              <ChevronLeft className="w-4 h-4 text-primary" />
            </button>
            <div className="text-center min-w-[110px]">
              <p className="text-sm" style={TEXT}>
                Week {week}
              </p>
              <p className="text-[11px] text-gray-500">
                {weekRangeLabel(week)}
              </p>
            </div>
            <button type="button" className={navBtn} disabled={week >= maxWeek} onClick={() => setWeek((n) => n + 1)} aria-label="Next week">
              <ChevronRight className="w-4 h-4 text-primary" />
            </button>
          </div>
        }
      />

      <AnimatePresence>
        {rebalance && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-4 rounded-2xl border border-amber-300/30 bg-amber-300/5 px-4 py-3 text-sm text-amber-300/80"
          >
            Two weeks under 70% — rebalance the plan.
          </motion.div>
        )}
      </AnimatePresence>

      <Card className="mb-4">
        <div className="flex items-center gap-4 mb-5">
          <ProgressRing pct={score} size={72} />
          <div>
            <p className="text-xl sm:text-2xl" style={TEXT}>
              {score >= 70 ? 'On target' : 'Below target'}
              <span className="italic font-serif text-primary/70"> · {score}%</span>
            </p>
            <p className="text-xs text-gray-500">
              {daysCounted}/7 days counted · {hours} hrs studied · Phase {phase.name}
            </p>
          </div>
        </div>

        {/* Table: header only on sm+ */}
        <div className="hidden sm:grid grid-cols-[1.2fr_1.4fr_1.2fr_48px] gap-3 px-4 pb-2 text-[10px] uppercase tracking-[0.18em] text-gray-500">
          <span>Subject</span>
          <span>Weekly target</span>
          <span>Actual</span>
          <span className="text-right">Met</span>
        </div>
        <ul className="space-y-1.5">
          {rows.map((r, i) => {
            const s = SUBJECT_BY_ID[r.subject];
            return (
              <motion.li
                key={`${week}-${r.subject}`}
                custom={i}
                variants={listItem}
                initial="hidden"
                animate="show"
                className="bg-[#212121] rounded-xl px-4 py-3 grid grid-cols-[1fr_auto] sm:grid-cols-[1.2fr_1.4fr_1.2fr_48px] gap-x-3 gap-y-1 items-center"
              >
                <span className="flex items-center gap-2 text-sm" style={TEXT}>
                  <SubjectDot color={s.color} /> {s.name}
                </span>
                <span className="text-xs sm:text-sm text-gray-400 col-start-1 sm:col-start-auto">{r.target}</span>
                <span className="text-xs sm:text-sm col-start-1 sm:col-start-auto flex items-center gap-2" style={TEXT}>
                  {r.toggle ? (
                    <>
                      <RoundCheck size="sm" checked={r.met} onChange={() => patch({ [r.toggle!]: !review[r.toggle!] })} label={`${s.name} target met`} />
                      <span className="text-gray-400">{r.actual}</span>
                    </>
                  ) : (
                    r.actual
                  )}
                </span>
                <span className="row-start-1 col-start-2 sm:row-start-auto sm:col-start-auto justify-self-end">
                  {r.met ? <Check className="w-4 h-4 text-primary" /> : <X className="w-4 h-4 text-red-400/70" />}
                </span>
              </motion.li>
            );
          })}
        </ul>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {(
          [
            ['well', 'What went well'],
            ['slipped', 'What slipped'],
            ['change', 'Change for next week'],
          ] as const
        ).map(([field, label]) => (
          <Card key={field}>
            <SectionLabel>{label}</SectionLabel>
            <textarea
              value={review[field]}
              onChange={(e) => patch({ [field]: e.target.value })}
              rows={5}
              className="w-full bg-[#212121] rounded-xl p-4 text-sm placeholder:text-gray-500 outline-none focus:ring-1 focus:ring-primary/40 resize-y"
              placeholder="…"
            />
          </Card>
        ))}
      </div>

      <button
        type="button"
        onClick={copy}
        className="group inline-flex items-center gap-2 hover:gap-3 bg-primary text-black rounded-full font-medium text-sm sm:text-base pl-5 pr-1 py-1 transition-all duration-300"
      >
        Copy weekly review for Claude
        <span className="bg-black rounded-full w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
          <Copy className="w-4 h-4 text-primary" />
        </span>
      </button>
    </div>
  );
}
