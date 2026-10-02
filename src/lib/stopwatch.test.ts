import { describe, expect, it } from 'vitest';
import { initialState, reducer, sanitize } from '../state/reducer';
import type { Action, TrackerState } from '../state/types';
import { displayMs, findRunning, formatStopwatch, overtimeMs, trackedMs } from './dayItems';
import { effectiveHours } from './hours';

// Mocked clock: fixed local times only (tests run with TZ=Asia/Kolkata), never the real clock.
const MON = '2026-10-05';
const TUE = '2026-10-06';
const WED = '2026-10-07';
const SAT = '2026-10-10';
const SUN = '2026-10-11';
const at = (y: number, mo: number, d: number, h: number, mi = 0, s = 0) => new Date(y, mo - 1, d, h, mi, s).getTime();
const T0 = at(2026, 10, 5, 18, 0); // Mon 6:00 PM
const MIN = 60_000;
const run = (s: TrackerState, ...as: Action[]) => as.reduce(reducer, s);
const reload = (s: TrackerState, today = MON) => sanitize(JSON.parse(JSON.stringify(s)), today);
const timer = (s: TrackerState, d: string, id: string) => s.days[d]?.timers?.[id];

describe('live stopwatch', () => {
  it('formats H:MM:SS', () => {
    expect(formatStopwatch(7_000)).toBe('0:00:07');
    expect(formatStopwatch(90 * MIN)).toBe('1:30:00');
    expect(formatStopwatch(42 * MIN + 10_000)).toBe('0:42:10');
  });

  it('elapsed comes from timestamps: right after a reload and after a long gap with no ticks', () => {
    const s = run(initialState(MON), { type: 'timerStart', date: MON, id: 'dsa1', at: T0 });
    const after = reload(s);
    expect(timer(after, MON, 'dsa1')).toMatchObject({ runningSince: T0, runStartedAt: T0 });
    expect(displayMs(timer(after, MON, 'dsa1'), T0 + 7_000)).toBe(7_000);
    // e.g. laptop asleep 5 h: no ticks happened, the value is still exact
    expect(displayMs(timer(after, MON, 'dsa1'), T0 + 5 * 60 * MIN)).toBe(5 * 60 * MIN);
  });

  it('keeps counting past the target; overtime is the excess', () => {
    const s = run(initialState(MON), { type: 'timerStart', date: MON, id: 'dsa1', at: T0 }); // target 120 min
    const elapsed = displayMs(timer(s, MON, 'dsa1'), T0 + 150 * MIN);
    expect(elapsed).toBe(150 * MIN);
    expect(overtimeMs(elapsed, 120 * MIN)).toBe(30 * MIN);
    expect(overtimeMs(100 * MIN, 120 * MIN)).toBe(0);
    expect(timer(s, MON, 'dsa1')!.runningSince).toBe(T0); // still running; nothing auto-stops
    // and all of it, overtime included, counts in the day's hours
    expect(effectiveHours(s, MON, T0 + 150 * MIN).hours).toBe(2.5);
  });

  it('nothing stops it except Pause, ticking it done, or starting another timer', () => {
    let s = run(initialState(MON), { type: 'timerStart', date: MON, id: 'java', at: T0 });
    s = run(
      s,
      { type: 'rollover', today: MON },
      { type: 'setTodayMode', mode: 'slots' },
      { type: 'moveTask', date: MON, id: 'java', beforeId: 'plan' },
      { type: 'upsertSlot', date: MON, slot: { id: 's1', start: '09:00', end: '12:00' } },
      { type: 'setText', date: MON, field: 'night', value: 'long day' },
      { type: 'toggleBlock', date: MON, id: 'apt', at: T0 + 5 * MIN },
      { type: 'setCounter', date: MON, field: 'dsa', value: 3 },
      { type: 'setOverride', dates: [MON], id: 'java', override: { text: 'Auth', subject: 'java', durationMin: 60 } },
    );
    s = reload(s);
    expect(timer(s, MON, 'java')!.runningSince).toBe(T0);

    const paused = run(s, { type: 'timerPause', date: MON, id: 'java', at: T0 + 10 * MIN });
    expect(timer(paused, MON, 'java')!.runningSince).toBeUndefined();
    const ticked = run(s, { type: 'toggleBlock', date: MON, id: 'java', at: T0 + 10 * MIN });
    expect(timer(ticked, MON, 'java')!.runningSince).toBeUndefined();
    const other = run(s, { type: 'timerStart', date: MON, id: 'ai', at: T0 + 10 * MIN });
    expect(timer(other, MON, 'java')!.runningSince).toBeUndefined();
    expect(findRunning(other.days)).toMatchObject({ id: 'ai' });
  });
});

describe('midnight', () => {
  it('splits a session at 00:00: before counts for that day, after for the new day (on the carried item)', () => {
    const start = at(2026, 10, 5, 23, 30); // Mon 11:30 PM
    let s = run(initialState(MON), { type: 'timerStart', date: MON, id: 'dsa2', at: start });
    s = run(s, { type: 'rollover', today: TUE }); // what the app dispatches after midnight

    expect(timer(s, MON, 'dsa2')).toMatchObject({ sessions: [{ start, end: at(2026, 10, 6, 0, 0) }] });
    expect(timer(s, MON, 'dsa2')!.runningSince).toBeUndefined();
    const carriedId = `${MON}:dsa2`;
    expect(s.carried.some((c) => c.id === carriedId && c.currentDate === TUE)).toBe(true);
    const cont = timer(s, TUE, carriedId)!;
    expect(cont).toMatchObject({ runningSince: at(2026, 10, 6, 0, 0), runStartedAt: start, priorMs: 30 * MIN });

    const now = at(2026, 10, 6, 0, 45);
    expect(effectiveHours(s, MON, now).hours).toBe(0.5);
    expect(effectiveHours(s, TUE, now).hours).toBe(0.75);
    expect(displayMs(cont, now)).toBe(75 * MIN); // the stopwatch still shows the task's total
    expect(run(s, { type: 'rollover', today: TUE })).toBe(s); // idempotent
  });

  it('a task that is not carried continues on the same task in the new day', () => {
    const start = at(2026, 10, 5, 23, 0);
    const s = run(initialState(MON), { type: 'timerStart', date: MON, id: 'plan', at: start }, { type: 'rollover', today: TUE });
    expect(timer(s, TUE, 'plan')).toMatchObject({ runningSince: at(2026, 10, 6, 0, 0), priorMs: 60 * MIN });
    expect(effectiveHours(s, MON, at(2026, 10, 6, 0, 30)).hours).toBe(1);
    expect(effectiveHours(s, TUE, at(2026, 10, 6, 0, 30)).hours).toBe(0.5);
  });

  it('time after midnight counts even if the new day has no such task (Sat → Sun)', () => {
    const start = at(2026, 10, 10, 23, 0);
    const s = run(initialState(SAT), { type: 'timerStart', date: SAT, id: 'recall', at: start }, { type: 'rollover', today: SUN });
    expect(timer(s, SUN, 'recall')!.runningSince).toBe(at(2026, 10, 11, 0, 0));
    expect(effectiveHours(s, SUN, at(2026, 10, 11, 1, 0)).hours).toBe(1);
  });

  it('splits at every midnight when left running for days', () => {
    const start = at(2026, 10, 5, 23, 0);
    const s = run(initialState(MON), { type: 'timerStart', date: MON, id: 'dsa2', at: start }, { type: 'rollover', today: WED });
    const id = `${MON}:dsa2`;
    expect(trackedMs(timer(s, MON, 'dsa2'))).toBe(60 * MIN);
    expect(trackedMs(timer(s, TUE, id))).toBe(24 * 60 * MIN);
    expect(timer(s, WED, id)!.runningSince).toBe(at(2026, 10, 7, 0, 0));
    expect(displayMs(timer(s, WED, id), at(2026, 10, 7, 0, 10))).toBe((60 + 24 * 60 + 10) * MIN);
  });
});

describe('Edit time', () => {
  it('overrides tracked time (a running stopwatch keeps going from it); reset sets 0', () => {
    let s = run(initialState(MON), { type: 'timerStart', date: MON, id: 'dsa1', at: T0 });
    s = run(s, { type: 'timerSetTime', date: MON, id: 'dsa1', ms: 90 * MIN, at: T0 + 60 * MIN });
    expect(trackedMs(timer(s, MON, 'dsa1'), T0 + 60 * MIN)).toBe(90 * MIN);
    expect(trackedMs(timer(s, MON, 'dsa1'), T0 + 70 * MIN)).toBe(100 * MIN);
    expect(timer(s, MON, 'dsa1')!.runStartedAt).toBe(T0);

    s = run(s, { type: 'timerPause', date: MON, id: 'dsa1', at: T0 + 70 * MIN }, { type: 'timerSetTime', date: MON, id: 'dsa1', ms: 45 * MIN, at: T0 + 80 * MIN });
    expect(timer(s, MON, 'dsa1')).toEqual({ sessions: [], baseMs: 45 * MIN });
    expect(effectiveHours(s, MON, T0 + 90 * MIN).hours).toBe(0.75);
    expect(reload(s).days[MON].timers.dsa1).toEqual({ sessions: [], baseMs: 45 * MIN });

    s = run(s, { type: 'timerSetTime', date: MON, id: 'dsa1', ms: 0, at: T0 + 90 * MIN });
    expect(trackedMs(timer(s, MON, 'dsa1'))).toBe(0);
  });

  it('after a midnight split, setting the time replaces the shown total', () => {
    let s = run(initialState(MON), { type: 'timerStart', date: MON, id: 'dsa2', at: at(2026, 10, 5, 23, 30) }, { type: 'rollover', today: TUE });
    const id = `${MON}:dsa2`;
    s = run(s, { type: 'timerSetTime', date: TUE, id, ms: 20 * MIN, at: at(2026, 10, 6, 0, 45) });
    expect(displayMs(timer(s, TUE, id), at(2026, 10, 6, 0, 45))).toBe(20 * MIN);
    expect(effectiveHours(s, MON, at(2026, 10, 6, 1, 0)).hours).toBe(0.5); // the earlier day keeps its time
  });
});
