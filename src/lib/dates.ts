import { addDays, differenceInCalendarDays, format, getDay, parseISO } from 'date-fns';
import { PLAN_END, PLAN_START, TOTAL_DAYS, TOTAL_WEEKS, WEEKS, type Week } from '../data/plan';

export const toKey = (d: Date) => format(d, 'yyyy-MM-dd');
export const fromKey = (k: string) => parseISO(k);

export const isSunday = (d: Date) => getDay(d) === 0;

export type PlanStatus = 'before' | 'during' | 'after';

export function planStatus(d: Date): PlanStatus {
  if (differenceInCalendarDays(d, PLAN_START) < 0) return 'before';
  if (differenceInCalendarDays(d, PLAN_END) > 0) return 'after';
  return 'during';
}

/** Week n starts on 2 Oct + 7·(n−1). Clamped to 1..13 outside the plan. */
export function weekNumberFor(d: Date): number {
  const diff = differenceInCalendarDays(d, PLAN_START);
  if (diff < 0) return 1;
  return Math.min(TOTAL_WEEKS, Math.floor(diff / 7) + 1);
}

export function weekFor(d: Date): Week {
  return WEEKS[weekNumberFor(d) - 1];
}

export function inPlan(d: Date) {
  return planStatus(d) === 'during';
}

/** All 91 plan dates. */
export const PLAN_DAYS: Date[] = Array.from({ length: TOTAL_DAYS }, (_, i) => addDays(PLAN_START, i));

export function weekDays(week: number): Date[] {
  const start = WEEKS[week - 1].start;
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
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
