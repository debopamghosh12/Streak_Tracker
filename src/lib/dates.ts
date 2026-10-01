import { addDays, differenceInCalendarDays, format, getDay, parseISO } from 'date-fns';
import { PLAN_START } from '../data/plan';

export const toKey = (d: Date) => format(d, 'yyyy-MM-dd');
export const fromKey = (k: string) => parseISO(k);

export const isSunday = (d: Date) => getDay(d) === 0;

/** The plan never ends: it is either not started yet or running. */
export type PlanStatus = 'before' | 'during';

export function planStatus(d: Date): PlanStatus {
  return differenceInCalendarDays(d, PLAN_START) < 0 ? 'before' : 'during';
}

/** Week n starts on 2 Oct + 7·(n−1), with no upper limit. Dates before the start count as week 1. */
export function weekNumberFor(d: Date): number {
  const diff = differenceInCalendarDays(d, PLAN_START);
  if (diff < 0) return 1;
  return Math.floor(diff / 7) + 1;
}

export const weekStart = (n: number) => addDays(PLAN_START, 7 * (n - 1));
export const weekEnd = (n: number) => addDays(PLAN_START, 7 * (n - 1) + 6);

export function weekDays(week: number): Date[] {
  const start = weekStart(week);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Days from the plan start up to and including `today` (0 before the start). */
export function daysElapsed(today: Date): number {
  return Math.max(0, differenceInCalendarDays(today, PLAN_START) + 1);
}

/** Every plan date from the start through `today`. */
export function planDaysThrough(today: Date): Date[] {
  return Array.from({ length: daysElapsed(today) }, (_, i) => addDays(PLAN_START, i));
}

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** "17:30" -> "5:30" (12h without suffix, compact like a printed timetable) */
export function displayTime(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const hh = h > 12 ? h - 12 : h;
  return `${hh}:${String(m).padStart(2, '0')}`;
}

export const shortDate = (d: Date) => format(d, 'EEE d MMM');
export const longDate = (d: Date) => format(d, 'EEEE, d MMMM yyyy');

/** "2 Oct – 8 Oct", or "1 Jan – 7 Jan 2027" once the plan runs past its first year. */
export function weekRangeLabel(n: number): string {
  const start = weekStart(n);
  const end = weekEnd(n);
  const year = end.getFullYear() !== PLAN_START.getFullYear() ? ` ${format(end, 'yyyy')}` : '';
  return `${format(start, 'd MMM')} – ${format(end, 'd MMM')}${year}`;
}
