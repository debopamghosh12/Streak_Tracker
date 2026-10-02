import { addDays, differenceInCalendarDays } from 'date-fns';
import { PLAN_START, STREAK_THRESHOLD, SUNDAY_MIN_TASKS, SUNDAY_TASKS } from '../data/plan';
import type { DayRecord, TrackerState } from '../state/types';
import { daysElapsed, isSunday, planDaysThrough, toKey, weekDays, weekNumberFor } from './dates';
import { getDayTasks } from './tasks';

export interface DayStats {
  done: number;
  total: number;
  pct: number; // 0..100
  dsaDone: boolean;
  counts: boolean;
  /** Tasks still needed for the day to count (0 when it counts). */
  needed: number;
}

/**
 * Verdict for one day. Only that day's own tasks count (planned minus skipped, plus custom);
 * carried items never enter the denominator, so finishing them later can't change any verdict.
 * Mon–Sat: >= 70% done AND at least one DSA task done. Sunday: 3 of 5 (60%, scaled if tasks are skipped/added).
 */
export function dayStats(day: DayRecord | undefined, date: Date, carriedAway?: ReadonlySet<string>): DayStats {
  const { active } = getDayTasks(day, date);
  // A task carried away from this day counts as not done here, even if a tick for it arrives later.
  const isDone = (t: { id: string; done: boolean }) => t.done && !carriedAway?.has(t.id);
  const total = active.length;
  const done = active.filter(isDone).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  if (isSunday(date)) {
    const need = Math.ceil((total * SUNDAY_MIN_TASKS) / SUNDAY_TASKS.length - 1e-9);
    const counts = total > 0 && done >= need;
    return { done, total, pct, dsaDone: true, counts, needed: Math.max(0, need - done) };
  }
  const dsaDone = active.some((t) => isDone(t) && t.subject === 'dsa');
  const need = Math.ceil(total * STREAK_THRESHOLD - 1e-9);
  const counts = total > 0 && done >= need && dsaDone;
  const needed = counts ? 0 : Math.max(need - done, dsaDone ? 0 : 1);
  return { done, total, pct, dsaDone, counts, needed };
}

/** Task ids carried away from a day (carried items made from it, including dropped ones). */
export function carriedAwayFrom(state: Pick<TrackerState, 'carried' | 'carryDropped'>, key: string): Set<string> {
  const ids = new Set<string>();
  for (const c of state.carried) if (c.sourceDate === key) ids.add(c.sourceBlockId);
  for (const id of state.carryDropped) if (id.startsWith(`${key}:`)) ids.add(id.slice(key.length + 1));
  return ids;
}

export const statsFor = (state: TrackerState, date: Date) => {
  const key = toKey(date);
  return dayStats(state.days[key], date, carriedAwayFrom(state, key));
};

const isFrozen = (state: TrackerState, date: Date) => !!state.days[toKey(date)]?.frozen;

/**
 * Current streak: counts back from today if today counts, otherwise from yesterday.
 * Frozen days keep the chain alive but don't add to it.
 */
export function currentStreak(state: TrackerState, today: Date): number {
  let d = statsFor(state, today).counts ? today : addDays(today, -1);
  let streak = 0;
  // Bounded walk: nothing before the plan (with a little slack for pre-start practice) can count.
  const floor = addDays(PLAN_START, -60);
  while (differenceInCalendarDays(d, floor) >= 0) {
    if (statsFor(state, d).counts) streak++;
    else if (!isFrozen(state, d)) break;
    d = addDays(d, -1);
  }
  return streak;
}

export function longestStreak(state: TrackerState, today: Date): number {
  let best = 0;
  let run = 0;
  for (const d of planDaysThrough(today)) {
    if (statsFor(state, d).counts) {
      run++;
      best = Math.max(best, run);
    } else if (isFrozen(state, d)) {
      continue;
    } else if (differenceInCalendarDays(d, today) < 0) {
      run = 0; // today never breaks the run
    }
  }
  return Math.max(best, currentStreak(state, today));
}

/** Days that counted, from the plan start through today (any length of plan). */
export function daysCounted(state: TrackerState, today: Date): number {
  return planDaysThrough(today).filter((d) => statsFor(state, d).counts).length;
}

/** Denominator for "Days counted: n / m" — days elapsed so far. */
export const daysSoFar = (today: Date) => daysElapsed(today);

/** Freeze for a given plan week is used if any day in that week is frozen. */
export function freezeUsedInWeek(state: TrackerState, week: number): boolean {
  return weekDays(week).some((d) => isFrozen(state, d));
}

export function canFreezeYesterday(state: TrackerState, today: Date): { ok: boolean; reason: string } {
  const y = addDays(today, -1);
  if (differenceInCalendarDays(y, PLAN_START) < 0) return { ok: false, reason: 'Freezes unlock once the plan starts.' };
  if (isFrozen(state, y)) return { ok: false, reason: 'Yesterday is already frozen.' };
  if (statsFor(state, y).counts) return { ok: false, reason: 'Yesterday counted. Nothing to freeze.' };
  if (freezeUsedInWeek(state, weekNumberFor(y))) return { ok: false, reason: "This week's freeze is already used." };
  return { ok: true, reason: 'Yesterday was missed. A freeze keeps the chain alive.' };
}
