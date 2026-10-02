/** Helpers for Day details (filling in a past day later) and the Today reminder. Pure. */
import type { TrackerState } from '../state/types';
import { fromKey, planStatus } from './dates';
import { getDayTasks, yesterdayKey } from './tasks';

/** The running DSA problem counter (Syllabus page): every day's "DSA problems solved". */
export const totalDsa = (state: Pick<TrackerState, 'days'>) => Object.values(state.days).reduce((s, d) => s + (d.dsa ?? 0), 0);

/** A day can be edited from Day details if it's a plan day that isn't in the future. */
export const canEditDay = (dateKey: string, today: string) => dateKey <= today && planStatus(fromKey(dateKey)) === 'during';

/**
 * "Forgot yesterday's DSA count?" — shown when yesterday was a plan day with at least one ticked
 * DSA block but 0 DSA problems entered, unless it was dismissed for that day.
 */
export function shouldRemindDsa(state: Pick<TrackerState, 'days' | 'plan'>, today: string, dismissedFor?: string | null): boolean {
  const y = yesterdayKey(today);
  if (dismissedFor === y) return false;
  const date = fromKey(y);
  if (planStatus(date) !== 'during') return false;
  const day = state.days[y];
  if (!day || day.dsa > 0) return false;
  return getDayTasks(day, date, state.plan).active.some((t) => t.kind === 'block' && t.subject === 'dsa' && t.done);
}
