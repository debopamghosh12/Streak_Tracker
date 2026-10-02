import { differenceInCalendarDays } from 'date-fns';
import { WEEKLY_APPS_MIN, WEEKLY_DSA_MIN, WEEKLY_TARGETS, type SubjectId } from '../data/plan';
import { emptyReview } from '../state/reducer';
import type { ReviewRecord, TrackerState } from '../state/types';
import { fromKey, toKey, weekDays } from './dates';
import { effectiveHours } from './hours';
import { getWeek } from './planModel';
import { statsFor } from './streak';

export interface Row {
  subject: SubjectId;
  target: string;
  actual: string;
  met: boolean;
  toggle?: keyof Pick<ReviewRecord, 'javaShipped' | 'aiBuilt'>;
}

/** Weekly targets vs actuals for week n. Pure: pass `now` to include running stopwatches in hours. */
export function weekScore(state: TrackerState, n: number, now?: number) {
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
  const hours = Math.round(keys.reduce((s, k) => s + effectiveHours(state, k, now).hours, 0) * 100) / 100;
  return { rows, score, review, dsa, apps, daysCounted, hours, phase: w.phase };
}
