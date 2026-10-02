/**
 * The Today page's single task model, shared by Flow and Slots mode.
 * Pure: no clock reads (pass `now` where time matters), no React.
 */
import { BLOCKS } from '../data/plan';
import type { CarriedItem, Slot, TaskSubject, TaskTimer, TrackerState } from '../state/types';
import { fromKey, toMinutes } from './dates';
import { getDayTasks, type DayTask } from './tasks';

export type ItemKind = 'block' | 'sunday' | 'custom' | 'carried';

export interface DayItem {
  id: string;
  kind: ItemKind;
  title: string;
  /** Subtitle (blocks: today's task text). */
  text: string;
  subject: TaskSubject;
  durationMin: number;
  done: boolean;
  edited: boolean;
  /** Planned task pushed to tomorrow (still listed, not checkable). */
  moved: boolean;
  task?: DayTask;
  carried?: CarriedItem;
}

type ItemsState = Pick<TrackerState, 'days' | 'carried' | 'plan'>;

/* ---------------- Items and order ---------------- */

/** Duration of the task a carried item came from (with that day's edits). */
export function carriedDuration(state: ItemsState, item: CarriedItem): number {
  const { active, skipped } = getDayTasks(state.days[item.sourceDate], fromKey(item.sourceDate), state.plan);
  const src = active.find((t) => t.id === item.sourceBlockId) ?? skipped.find((s) => s.task.id === item.sourceBlockId)?.task;
  return src?.durationMin ?? 30;
}

/** Saved order first; anything not in it (new custom task, newly carried item) keeps default order at the end. */
export function applyOrder<T extends { id: string }>(items: T[], order?: string[]): T[] {
  if (!order || order.length === 0) return items;
  const pos = new Map(order.map((id, i) => [id, i]));
  const known = items.filter((i) => pos.has(i.id)).sort((a, b) => pos.get(a.id)! - pos.get(b.id)!);
  return [...known, ...items.filter((i) => !pos.has(i.id))];
}

/**
 * Today's tasks in the user's order. Default order (no saved order): carried items first,
 * then plan blocks / Sunday tasks in plan order, then custom tasks.
 */
export function getDayItems(state: ItemsState, dateKey: string) {
  const day = state.days[dateKey];
  const tasks = getDayTasks(day, fromKey(dateKey), state.plan);
  const carried: DayItem[] = state.carried
    .filter((c) => c.currentDate === dateKey)
    .map((c) => ({
      id: c.id,
      kind: 'carried',
      title: c.text,
      text: '',
      subject: c.subject,
      durationMin: carriedDuration(state, c),
      done: c.done,
      edited: false,
      moved: false,
      carried: c,
    }));
  const own: DayItem[] = tasks.active.map((t) => ({
    id: t.id,
    kind: t.kind,
    title: t.title,
    text: t.text,
    subject: t.subject,
    durationMin: t.durationMin,
    done: t.done,
    edited: t.edited,
    moved: tasks.movedOut.has(t.id),
    task: t,
  }));
  return { items: applyOrder([...carried, ...own], day?.order), skipped: tasks.skipped, tasks };
}

/* ---------------- Slots ---------------- */

export const slotMinutes = (s: Pick<Slot, 'start' | 'end'>) => toMinutes(s.end) - toMinutes(s.start);
export const sortSlots = (slots: Slot[]) => [...slots].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

/** The day's own slots, else the user's default slots. */
export function effectiveSlots(state: Pick<TrackerState, 'days' | 'settings'>, dateKey: string): Slot[] {
  return sortSlots(state.days[dateKey]?.slots ?? state.settings.defaultSlots);
}

/** Half-open intervals: 9:00–10:00 and 10:00–11:00 don't overlap. */
export const slotsOverlap = (a: Pick<Slot, 'start' | 'end'>, b: Pick<Slot, 'start' | 'end'>) =>
  toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end);

/** Error message, or null if `slot` can be saved alongside `slots` (ignoring its own previous version). */
export function validateSlot(slots: Slot[], slot: Slot): string | null {
  if (!/^\d{2}:\d{2}$/.test(slot.start) || !/^\d{2}:\d{2}$/.test(slot.end)) return 'Set a start and end time.';
  if (slotMinutes(slot) <= 0) return 'End must be after the start.';
  const clash = slots.find((s) => s.id !== slot.id && slotsOverlap(s, slot));
  return clash ? `Overlaps ${clash.label || 'another slot'} (${clash.start}–${clash.end}).` : null;
}

/** Splits items into the Unplaced tray and each slot, keeping the day's order inside each. */
export function groupBySlot<T extends { id: string }>(items: T[], slots: Slot[], placement: Record<string, string>) {
  const valid = new Set(slots.map((s) => s.id));
  const bySlot: Record<string, T[]> = Object.fromEntries(slots.map((s) => [s.id, [] as T[]]));
  const unplaced: T[] = [];
  for (const it of items) {
    const sid = placement[it.id];
    if (sid && valid.has(sid)) bySlot[sid].push(it);
    else unplaced.push(it);
  }
  return { unplaced, bySlot };
}

/** Capacity for a slot header: used vs length; over > 0 when the tasks exceed it. */
export function slotCapacity(slot: Slot, items: Pick<DayItem, 'durationMin'>[]) {
  const total = slotMinutes(slot);
  const used = items.reduce((s, i) => s + i.durationMin, 0);
  return { used, total, over: Math.max(0, used - total) };
}

/** The slot containing a time of day (minutes since midnight), if any. */
export const slotAt = (slots: Slot[], minutes: number) =>
  slots.find((s) => minutes >= toMinutes(s.start) && minutes < toMinutes(s.end));

/**
 * "Use plan times": one slot per timetable block, each task placed where the plan had it.
 * Custom tasks with a start time go into the slot containing it. Null on Sundays (no plan times).
 */
export function planLayout(state: ItemsState, dateKey: string): { slots: Slot[]; placement: Record<string, string> } | null {
  if (fromKey(dateKey).getDay() === 0) return null;
  const slots: Slot[] = BLOCKS.map((b) => ({ id: `plan-${b.id}`, start: b.start, end: b.end, label: b.name }));
  const placement: Record<string, string> = {};
  for (const it of getDayItems(state, dateKey).items) {
    if (it.kind === 'block') placement[it.id] = `plan-${it.id}`;
    else if (it.kind === 'custom' && it.task?.start) {
      const s = slotAt(slots, toMinutes(it.task.start));
      if (s) placement[it.id] = s.id;
    }
  }
  return { slots, placement };
}

/* ---------------- Timers ---------------- */

/**
 * Time tracked on this day (counts toward the day's hours): the hand-set base, closed sessions,
 * and the running part up to `now` when given. Computed from timestamps only — never from ticks.
 */
export function trackedMs(t: TaskTimer | undefined, now?: number): number {
  if (!t) return 0;
  const closed = t.sessions.reduce((s, x) => s + Math.max(0, x.end - x.start), 0);
  const running = t.runningSince != null && now != null ? Math.max(0, now - t.runningSince) : 0;
  return (t.baseMs ?? 0) + closed + running;
}

/** What the stopwatch shows: the task's total, including time before a midnight split. */
export const displayMs = (t: TaskTimer | undefined, now?: number) => (t?.priorMs ?? 0) + trackedMs(t, now);

/** Time past the target (0 while under it). */
export const overtimeMs = (elapsed: number, targetMs: number) => Math.max(0, elapsed - targetMs);

/** The (single) running timer across all days, if any. */
export function findRunning(days: TrackerState['days']): { date: string; id: string; timer: TaskTimer } | null {
  for (const [date, day] of Object.entries(days)) {
    for (const [id, timer] of Object.entries(day.timers ?? {})) if (timer.runningSince != null) return { date, id, timer };
  }
  return null;
}

/* ---------------- Formatting ---------------- */

/** 120 → "2 h", 90 → "1 h 30 m", 45 → "45 m". */
export function formatMinutes(min: number): string {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h} h ${r} m`;
  if (h) return `${h} h`;
  return `${r} m`;
}

/** ms → "0:42:07" (H:MM:SS). */
export function formatStopwatch(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
