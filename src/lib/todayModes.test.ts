import { describe, expect, it } from 'vitest';
import { initialState, reducer, sanitize } from '../state/reducer';
import type { Action, TrackerState } from '../state/types';
import type { SyncedSettings as SyncedSettingsLike } from './storage/types';
import { fromKey } from './dates';
import {
  effectiveSlots,
  findRunning,
  formatMinutes,
  getDayItems,
  groupBySlot,
  planLayout,
  slotCapacity,
  trackedMs,
  validateSlot,
} from './dayItems';
import { effectiveHours } from './hours';
import { persistDiff } from './storage/diff';
import { fromRow, toRow } from './storage/supabaseStore';
import { dayStats } from './streak';

// Fixed dates and epoch times only — never the real clock.
const MON = '2026-10-05';
const TUE = '2026-10-06';
const SUN = '2026-10-11';
const T0 = Date.UTC(2026, 9, 5, 4, 0); // any fixed instant
const MIN = 60_000;
const run = (s: TrackerState, ...as: Action[]) => as.reduce(reducer, s);
const ids = (s: TrackerState, d = MON) => getDayItems(s, d).items.map((i) => i.id);
const reload = (s: TrackerState, today = MON) => sanitize(JSON.parse(JSON.stringify(s)), today);

describe('order (shared by Flow and Slots)', () => {
  it('a reorder is saved for the day and survives export/import', () => {
    const s0 = initialState(MON);
    expect(ids(s0).slice(0, 3)).toEqual(['plan', 'apt', 'apps']); // plan order by default
    const s = run(s0, { type: 'moveTask', date: MON, id: 'dsa1', beforeId: 'plan' });
    expect(ids(s).slice(0, 2)).toEqual(['dsa1', 'plan']);
    expect(s.days[MON].order?.[0]).toBe('dsa1');
    expect(ids(reload(s)).slice(0, 2)).toEqual(['dsa1', 'plan']);
    expect(ids(run(s, { type: 'moveTask', date: MON, id: 'dsa1', beforeId: null })).slice(-1)[0]).toBe('dsa1'); // to the end
  });

  it('switching modes never touches ticks, timers or order', () => {
    const s = run(
      initialState(MON),
      { type: 'toggleBlock', date: MON, id: 'java' },
      { type: 'moveTask', date: MON, id: 'ai', beforeId: 'plan' },
      { type: 'timerStart', date: MON, id: 'cs', at: T0 },
    );
    const day = s.days[MON];
    const switched = run(s, { type: 'setTodayMode', mode: 'slots' }, { type: 'setTodayMode', mode: 'flow' });
    expect(switched.days[MON]).toBe(day); // same object: nothing about the day changed
    expect(switched.settings.todayMode).toBe('flow');
    expect(run(s, { type: 'setTodayMode', mode: 'slots' }).settings.todayMode).toBe('slots');
  });

  it('new tasks appear after the saved order', () => {
    const s = run(
      initialState(MON),
      { type: 'moveTask', date: MON, id: 'recall', beforeId: 'plan' },
      { type: 'addCustom', date: MON, task: { id: 'c-1', text: 'Mock', subject: 'apt', done: false, durationMin: 45 } },
    );
    expect(ids(s)[0]).toBe('recall');
    expect(ids(s).slice(-1)[0]).toBe('c-1');
  });
});

describe('timers', () => {
  it('start / pause / resume accumulates sessions', () => {
    let s = run(initialState(MON), { type: 'timerStart', date: MON, id: 'java', at: T0 }, { type: 'timerPause', date: MON, id: 'java', at: T0 + 10 * MIN });
    expect(trackedMs(s.days[MON].timers.java)).toBe(10 * MIN);
    s = run(s, { type: 'timerStart', date: MON, id: 'java', at: T0 + 20 * MIN });
    expect(trackedMs(s.days[MON].timers.java, T0 + 23 * MIN)).toBe(13 * MIN); // running part counts with `now`
    s = run(s, { type: 'timerPause', date: MON, id: 'java', at: T0 + 25 * MIN });
    expect(s.days[MON].timers.java.sessions).toHaveLength(2);
    expect(trackedMs(s.days[MON].timers.java)).toBe(15 * MIN);
  });

  it('only one timer runs at a time, across days too', () => {
    let s = run(initialState(MON), { type: 'timerStart', date: MON, id: 'apt', at: T0 }, { type: 'timerStart', date: MON, id: 'cs', at: T0 + 5 * MIN });
    expect(s.days[MON].timers.apt.runningSince).toBeUndefined();
    expect(trackedMs(s.days[MON].timers.apt)).toBe(5 * MIN);
    expect(findRunning(s.days)).toMatchObject({ date: MON, id: 'cs' });
    s = run(s, { type: 'timerStart', date: TUE, id: 'plan', at: T0 + 24 * 60 * MIN });
    expect(findRunning(s.days)).toMatchObject({ date: TUE, id: 'plan' });
    expect(s.days[MON].timers.cs.runningSince).toBeUndefined();
  });

  it('survives a reload (runningSince is a stored timestamp)', () => {
    const s = run(initialState(MON), { type: 'timerStart', date: MON, id: 'dsa1', at: T0 });
    const after = reload(s);
    expect(after.days[MON].timers.dsa1.runningSince).toBe(T0);
    expect(trackedMs(after.days[MON].timers.dsa1, T0 + 42 * MIN)).toBe(42 * MIN);
  });

  it('ticking a task stops its timer', () => {
    const s = run(initialState(MON), { type: 'timerStart', date: MON, id: 'dsa1', at: T0 }, { type: 'toggleBlock', date: MON, id: 'dsa1', at: T0 + 30 * MIN });
    expect(s.days[MON].timers.dsa1.runningSince).toBeUndefined();
    expect(trackedMs(s.days[MON].timers.dsa1)).toBe(30 * MIN);
  });
});

describe('slots', () => {
  const morning = { id: 's1', start: '09:00', end: '11:00', label: 'Morning' };

  it('rejects overlapping or inverted slots; touching slots are fine', () => {
    expect(validateSlot([morning], { id: 's2', start: '10:30', end: '12:00' })).toMatch(/Overlaps Morning/);
    expect(validateSlot([morning], { id: 's2', start: '12:00', end: '11:00' })).toMatch(/after the start/);
    expect(validateSlot([morning], { id: 's2', start: '11:00', end: '12:00' })).toBeNull();
    const s = run(initialState(MON), { type: 'upsertSlot', date: MON, slot: morning });
    expect(run(s, { type: 'upsertSlot', date: MON, slot: { id: 's2', start: '08:00', end: '09:30' } })).toBe(s); // rejected
  });

  it('capacity: used vs length, over when the tasks exceed it', () => {
    expect(slotCapacity(morning, [{ durationMin: 90 }, { durationMin: 60 }])).toEqual({ used: 150, total: 120, over: 30 });
    expect(slotCapacity(morning, [{ durationMin: 90 }])).toEqual({ used: 90, total: 120, over: 0 });
    expect(formatMinutes(90)).toBe('1 h 30 m');
    expect(formatMinutes(120)).toBe('2 h');
    expect(formatMinutes(45)).toBe('45 m');
  });

  it('moving between slots and back to Unplaced', () => {
    let s = run(initialState(MON), { type: 'upsertSlot', date: MON, slot: morning }, { type: 'moveTask', date: MON, id: 'java', slotId: 's1', beforeId: null });
    let g = groupBySlot(getDayItems(s, MON).items, effectiveSlots(s, MON), s.days[MON].placement);
    expect(g.bySlot.s1.map((i) => i.id)).toEqual(['java']);
    s = run(s, { type: 'moveTask', date: MON, id: 'cs', slotId: 's1', beforeId: 'java' });
    g = groupBySlot(getDayItems(s, MON).items, effectiveSlots(s, MON), s.days[MON].placement);
    expect(g.bySlot.s1.map((i) => i.id)).toEqual(['cs', 'java']);
    s = run(s, { type: 'moveTask', date: MON, id: 'java', slotId: null, beforeId: null });
    g = groupBySlot(getDayItems(s, MON).items, effectiveSlots(s, MON), s.days[MON].placement);
    expect(g.bySlot.s1.map((i) => i.id)).toEqual(['cs']);
    expect(g.unplaced.map((i) => i.id)).toContain('java');
  });

  it('"Use plan times" creates the timetable slots and places each task where the plan had it', () => {
    const s = run(initialState(MON), {
      type: 'addCustom',
      date: MON,
      task: { id: 'c-1', text: 'Extra SQL', start: '10:15', end: '10:45', subject: 'cs', done: false },
    });
    const layout = planLayout(s, MON)!;
    expect(layout.slots).toHaveLength(9);
    expect(layout.placement.java).toBe('plan-java');
    expect(layout.placement['c-1']).toBe('plan-cs'); // 10:15 falls in CS fundamentals 10:00–11:30
    expect(planLayout(s, SUN)).toBeNull(); // Sundays have no plan times
  });

  it('default slots apply to a new day, empty', () => {
    const s = run(initialState(MON), { type: 'saveDefaultSlots', slots: [morning, { id: 's2', start: '14:00', end: '17:00' }] });
    expect(effectiveSlots(s, TUE).map((x) => x.id)).toEqual(['s1', 's2']);
    const g = groupBySlot(getDayItems(s, TUE).items, effectiveSlots(s, TUE), s.days[TUE]?.placement ?? {});
    expect(g.bySlot.s1).toHaveLength(0);
    // Editing a day's slots writes that day's own copy; the defaults stay as they were.
    const edited = run(s, { type: 'deleteSlot', date: TUE, slotId: 's2' });
    expect(effectiveSlots(edited, TUE).map((x) => x.id)).toEqual(['s1']);
    expect(edited.settings.defaultSlots).toHaveLength(2);
  });
});

describe('streak and hours', () => {
  it('the streak percentage is identical in both modes for the same ticks', () => {
    const ticked = run(initialState(MON), ...['plan', 'apt', 'apps', 'cs', 'java', 'dsa1', 'dsa2'].map((id) => ({ type: 'toggleBlock', date: MON, id }) as Action));
    const before = dayStats(ticked.days[MON], fromKey(MON));
    const rearranged = run(
      ticked,
      { type: 'setTodayMode', mode: 'slots' },
      { type: 'upsertSlot', date: MON, slot: { id: 's1', start: '09:00', end: '12:00' } },
      { type: 'moveTask', date: MON, id: 'java', slotId: 's1', beforeId: null },
      { type: 'moveTask', date: MON, id: 'recall', beforeId: 'plan' },
      { type: 'timerStart', date: MON, id: 'ai', at: T0 },
    );
    expect(dayStats(rearranged.days[MON], fromKey(MON))).toEqual(before);
    expect(before).toMatchObject({ done: 7, total: 9, counts: true });
  });

  it('hours priority: manual > tracked time > duration of ticked tasks', () => {
    let s = run(initialState(MON), { type: 'toggleBlock', date: MON, id: 'java' }); // 150 min, ticked
    expect(effectiveHours(s, MON, T0)).toEqual({ hours: 2.5, source: 'auto' });
    s = run(s, { type: 'timerStart', date: MON, id: 'java', at: T0 }, { type: 'timerPause', date: MON, id: 'java', at: T0 + 30 * MIN });
    expect(effectiveHours(s, MON, T0).hours).toBe(0.5); // tracked time wins for that task
    s = run(s, { type: 'timerStart', date: MON, id: 'apt', at: T0 + 60 * MIN }); // unticked but tracked, still running
    expect(effectiveHours(s, MON, T0 + 75 * MIN).hours).toBe(0.75);
    s = run(s, { type: 'setCounter', date: MON, field: 'hours', value: 4 });
    expect(effectiveHours(s, MON, T0 + 75 * MIN)).toEqual({ hours: 4, source: 'manual' });
  });
});

describe('migration and sync', () => {
  it('old data without the new fields loads with defaults', () => {
    const legacy = {
      days: {
        [MON]: {
          blocks: { java: true },
          sundayTasks: {},
          dsa: 2,
          apps: 0,
          hours: 0,
          topicsCovered: [],
          morning: 'm',
          night: '',
          frozen: false,
          overrides: { java: { text: 'Auth', start: '12:00', end: '14:00', subject: 'java' } },
          skipped: { ai: 'tired' },
          customTasks: [{ id: 'c-old', text: 'Old task', subject: 'cs', done: true }],
          movedOut: [],
        },
      },
      settings: { version: 2 },
      carried: [],
      rolledThrough: '2026-10-04',
    };
    const s = sanitize(legacy, MON);
    expect(s.settings).toEqual({ version: 2, todayMode: 'flow', defaultSlots: [] });
    expect(s.days[MON]).toMatchObject({ placement: {}, timers: {}, blocks: { java: true }, skipped: { ai: 'tired' } });
    expect(s.days[MON].order).toBeUndefined();
    const items = getDayItems(s, MON).items;
    expect(items.find((i) => i.id === 'java')!.durationMin).toBe(120); // from the old start/end edit
    expect(items.find((i) => i.id === 'c-old')!.durationMin).toBe(30); // default
    expect(items.some((i) => i.id === 'ai')).toBe(false); // still skipped
  });

  it('new fields round-trip through export/import and the Supabase row mapping', () => {
    const s = run(
      initialState(MON),
      { type: 'setTodayMode', mode: 'slots' },
      { type: 'saveDefaultSlots', slots: [{ id: 's1', start: '09:00', end: '11:00' }] },
      { type: 'moveTask', date: MON, id: 'dsa2', slotId: 's1', beforeId: null },
      { type: 'timerStart', date: MON, id: 'dsa2', at: T0 },
      { type: 'setOverride', dates: [MON], id: 'cs', override: { text: 'DBMS', subject: 'cs', durationMin: 75 } },
    );
    expect(reload(s).days[MON]).toEqual(s.days[MON]);
    expect(reload(s).settings).toEqual(s.settings);
    const dayRow = { ...toRow({ table: 'days', key: MON, day: s.days[MON] }, 'u1'), updated_at: '2026-10-05T10:00:00Z' };
    expect(fromRow('days', dayRow)).toMatchObject({ day: s.days[MON] });
    // A settings row from an older app version (no todayMode) must not reset the local choice.
    const oldRow = { user_id: 'u1', data: { version: 2, rolledThrough: '2026-10-04' }, updated_at: '2026-10-05T10:00:00Z' };
    const rec = fromRow('settings', oldRow) as { settings: SyncedSettingsLike };
    expect(rec.settings.todayMode).toBeUndefined();
  });

  it('changes go through the storage layer (synced): settings and day records', () => {
    const saved: string[] = [];
    const sink = {
      saveDay: (d: string) => saved.push(`day:${d}`),
      saveCarried: () => saved.push('carried'),
      saveTopicDone: () => saved.push('topic'),
      saveReview: () => saved.push('review'),
      saveSettings: (x: SyncedSettingsLike) => saved.push(`settings:${x.todayMode}:${x.defaultSlots?.length ?? 0}`),
      savePlanWeek: () => saved.push('week'),
      savePlanPhase: () => saved.push('phase'),
    };
    const a = initialState(MON);
    const b = run(a, { type: 'setTodayMode', mode: 'slots' }, { type: 'timerStart', date: MON, id: 'apt', at: T0 });
    persistDiff(a, b, sink);
    expect(saved.sort()).toEqual([`day:${MON}`, 'settings:slots:0']);
  });
});
