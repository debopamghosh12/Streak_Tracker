import { addDays, differenceInCalendarDays } from 'date-fns';
import { BLOCKS, PLAN_START, SUNDAY_TASKS, TOTAL_DAYS } from '../data/plan';
import type { CarriedItem, DayRecord, Override, TaskSubject } from '../state/types';
import { fromKey, isSunday, toKey, weekFor } from './dates';

export type TaskKind = 'block' | 'sunday' | 'custom';

/** A task on a given day after applying overrides — what the Today page renders. */
export interface DayTask {
  id: string;
  kind: TaskKind;
  /** Row title: block name, Sunday task text, or custom text. */
  title: string;
  /** Row subtitle (blocks only): today's task text. */
  text: string;
  start?: string;
  end?: string;
  subject: TaskSubject;
  done: boolean;
  edited: boolean;
  /** The planned values, before any override (planned tasks only). */
  base?: Override;
  /** Planned blocks that are not carried when missed (Plan / Recall). */
  carry: boolean;
}

export interface DayTasks {
  /** In the list and in the streak denominator (includes moved-out tasks). */
  active: DayTask[];
  skipped: { task: DayTask; reason: string }[];
  movedOut: Set<string>;
}

export function getDayTasks(day: DayRecord | undefined, date: Date): DayTasks {
  const overrides = day?.overrides ?? {};
  const skipped = day?.skipped ?? {};
  const planned: DayTask[] = [];

  if (isSunday(date)) {
    for (const t of SUNDAY_TASKS) {
      const o = overrides[t.id];
      const base: Override = { text: t.name, subject: null };
      planned.push({
        id: t.id,
        kind: 'sunday',
        title: o?.text ?? t.name,
        text: '',
        start: o?.start,
        end: o?.end,
        subject: o ? o.subject : null,
        done: !!day?.sundayTasks[t.id],
        edited: !!o,
        base,
        carry: true,
      });
    }
  } else {
    const week = weekFor(date);
    for (const b of BLOCKS) {
      const o = overrides[b.id];
      const base: Override = { text: b.task(week), start: b.start, end: b.end, subject: b.subject };
      planned.push({
        id: b.id,
        kind: 'block',
        title: b.name,
        text: o?.text ?? base.text,
        start: o?.start ?? b.start,
        end: o?.end ?? b.end,
        subject: o ? o.subject : b.subject,
        done: !!day?.blocks[b.id],
        edited: !!o,
        base,
        carry: b.carry,
      });
    }
  }

  const custom: DayTask[] = (day?.customTasks ?? []).map((c) => ({
    id: c.id,
    kind: 'custom',
    title: c.text,
    text: '',
    start: c.start,
    end: c.end,
    subject: c.subject,
    done: c.done,
    edited: false,
    carry: true,
  }));

  const all = [...planned, ...custom];
  return {
    active: all.filter((t) => !(t.id in skipped)),
    skipped: all.filter((t) => t.id in skipped).map((task) => ({ task, reason: skipped[task.id] })),
    movedOut: new Set(day?.movedOut ?? []),
  };
}

/** Text stored on a carried item. */
export const carryText = (t: DayTask) => (t.kind === 'block' ? `${t.title} — ${t.text}` : t.title);

export const carryId = (date: string, taskId: string) => `${date}:${taskId}`;

export function makeCarried(date: string, t: DayTask, currentDate: string): CarriedItem {
  return {
    id: carryId(date, t.id),
    sourceDate: date,
    sourceBlockId: t.id,
    text: carryText(t),
    subject: t.subject,
    currentDate,
    moves: 1,
    done: false,
  };
}

/** Unfinished tasks of a day that should roll forward. */
export function unfinishedTasks(day: DayRecord | undefined, date: Date): DayTask[] {
  const { active } = getDayTasks(day, date);
  return active.filter((t) => !t.done && t.carry);
}

/**
 * Dates strictly after `after` and strictly before `today` that may hold unfinished work:
 * every plan day in range, plus any other day with a saved record.
 */
export function datesToRoll(dayKeys: string[], after: string, today: string): string[] {
  const set = new Set<string>();
  for (let i = 0; i < TOTAL_DAYS; i++) {
    const k = toKey(addDays(PLAN_START, i));
    if (k > after && k < today) set.add(k);
  }
  for (const k of dayKeys) if (k > after && k < today) set.add(k);
  return [...set].sort();
}

export const yesterdayKey = (today: string) => toKey(addDays(fromKey(today), -1));
export const tomorrowKey = (date: string) => toKey(addDays(fromKey(date), 1));

export const isPastKey = (k: string, today: string) => differenceInCalendarDays(fromKey(k), fromKey(today)) < 0;
