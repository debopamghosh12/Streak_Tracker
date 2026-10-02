/**
 * Hours studied per day. Pure: pass the state and the date.
 *
 * Auto hours = durations (end − start) of the day's ticked blocks (edited times win), plus
 * ticked custom tasks that have both times, plus carried items completed that day (using the
 * original task's duration on its source day). Sunday checkpoint tasks have no times → 0.
 * A manually entered value for the day overrides the auto value.
 */
import type { CarriedItem, DayRecord, TrackerState } from '../state/types';
import { fromKey, toKey, toMinutes } from './dates';
import { getDayTasks, type DayTask } from './tasks';

type HoursState = Pick<TrackerState, 'days' | 'carried' | 'plan'>;

export interface DayHours {
  hours: number;
  source: 'auto' | 'manual';
}

/** Duration of a timed task in hours (0 if it has no start/end or they're out of order). */
function taskHours(t: Pick<DayTask, 'start' | 'end'>): number {
  if (!t.start || !t.end) return 0;
  return Math.max(0, toMinutes(t.end) - toMinutes(t.start)) / 60;
}

/** The task a carried item came from, with that day's edits applied. */
function sourceTask(state: HoursState, item: CarriedItem): DayTask | undefined {
  const { active, skipped } = getDayTasks(state.days[item.sourceDate], fromKey(item.sourceDate), state.plan);
  return active.find((t) => t.id === item.sourceBlockId) ?? skipped.find((s) => s.task.id === item.sourceBlockId)?.task;
}

export function autoHours(state: HoursState, dateKey: string): number {
  const date = fromKey(dateKey);
  const day: DayRecord | undefined = state.days[dateKey];
  const { active } = getDayTasks(day, date, state.plan);

  let total = 0;
  for (const t of active) {
    if (!t.done || t.kind === 'sunday') continue; // Sunday tasks carry no times
    total += taskHours(t); // blocks use overrides; custom tasks count only with start and end
  }
  for (const item of state.carried) {
    if (!item.done || item.completedOn !== dateKey) continue;
    const src = sourceTask(state, item);
    if (src && src.kind !== 'sunday') total += taskHours(src);
  }
  return Math.round(total * 100) / 100;
}

/** The value shown everywhere: the manual entry if one was made for that day, else the auto value. */
export function effectiveHours(state: HoursState, date: Date | string): DayHours {
  const key = typeof date === 'string' ? date : toKey(date);
  const day = state.days[key];
  if (day?.hoursManual) return { hours: day.hours, source: 'manual' };
  return { hours: autoHours(state, key), source: 'auto' };
}

/** "10.5", "2.25", "0" — trims trailing zeros. */
export const formatHours = (h: number) => String(Math.round(h * 100) / 100);

