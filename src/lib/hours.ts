/**
 * Hours studied per day. Pure: pass the state, the date and (for running timers) `now`.
 *
 * Priority:
 *   1. the manual "Hours studied" value, if one was entered for that day;
 *   2. otherwise, per task: tracked timer time on that day if any,
 *      else the task's duration (durationMin) if it was ticked that day.
 * Tasks = the day's own tasks (planned minus skipped, plus custom) and carried items that are
 * due that day or were completed that day (carried items use their source task's duration).
 */
import type { TrackerState } from '../state/types';
import { toKey } from './dates';
import { carriedDuration, getDayItems, trackedMs, type DayItem } from './dayItems';

type HoursState = Pick<TrackerState, 'days' | 'carried' | 'plan'>;

export interface DayHours {
  hours: number;
  source: 'auto' | 'manual';
}

export interface TaskHours {
  item: DayItem;
  trackedMs: number;
  /** What counted toward the day's auto hours for this task (ms). */
  countedMs: number;
}

/** Per-task contribution to a day's auto hours. */
export function hoursByTask(state: HoursState, dateKey: string, now?: number): TaskHours[] {
  const day = state.days[dateKey];
  const { items } = getDayItems(state, dateKey);
  // Carried items finished on this day but no longer listed here (e.g. moved after completion).
  const extra: DayItem[] = state.carried
    .filter((c) => c.done && c.completedOn === dateKey && c.currentDate !== dateKey)
    .map((c) => ({ id: c.id, kind: 'carried', title: c.text, text: '', subject: c.subject, durationMin: carriedDuration(state, c), done: true, edited: false, moved: false, carried: c }));

  // Time tracked under ids not listed that day (a skipped task, or a run continued past midnight).
  const listed = new Set([...items, ...extra].map((i) => i.id));
  const orphans: DayItem[] = Object.keys(day?.timers ?? {})
    .filter((id) => !listed.has(id))
    .map((id) => {
      const c = state.carried.find((x) => x.id === id);
      return { id, kind: c ? 'carried' : 'custom', title: c?.text ?? id, text: '', subject: c?.subject ?? null, durationMin: 0, done: false, edited: false, moved: false, carried: c };
    });

  return [...items, ...extra, ...orphans].map((item) => {
    const tracked = trackedMs(day?.timers?.[item.id], now);
    const doneToday = item.kind === 'carried' ? !!item.carried?.done && item.carried.completedOn === dateKey : item.done && listed.has(item.id);
    const counted = tracked > 0 ? tracked : doneToday ? item.durationMin * 60_000 : 0;
    return { item, trackedMs: tracked, countedMs: counted };
  });
}

export function autoHours(state: HoursState, dateKey: string, now?: number): number {
  const ms = hoursByTask(state, dateKey, now).reduce((s, t) => s + t.countedMs, 0);
  return Math.round((ms / 3_600_000) * 100) / 100;
}

/** The value shown everywhere: the manual entry if one was made for that day, else the auto value. */
export function effectiveHours(state: HoursState, date: Date | string, now?: number): DayHours {
  const key = typeof date === 'string' ? date : toKey(date);
  const day = state.days[key];
  if (day?.hoursManual) return { hours: day.hours, source: 'manual' };
  return { hours: autoHours(state, key, now), source: 'auto' };
}

/** "10.5", "2.25", "0" — trims trailing zeros. */
export const formatHours = (h: number) => String(Math.round(h * 100) / 100);
