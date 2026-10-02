import { describe, expect, it } from 'vitest';
import { initialState, reducer, sanitize } from '../state/reducer';
import type { Action, TrackerState } from '../state/types';
import { autoHours, effectiveHours, formatHours } from './hours';

// Fixed dates only — never the real clock.
const MON = '2026-10-05';
const TUE = '2026-10-06';
const WED = '2026-10-07';
const SUN = '2026-10-11';
const run = (s: TrackerState, ...as: Action[]) => as.reduce(reducer, s);
const tick = (date: string, id: string): Action => ({ type: 'toggleBlock', date, id });

// Base timetable: plan 8:45–9:00 (0.25 h), cs 10:00–11:30 (1.5 h), java 11:45–14:15 (2.5 h), dsa2 20:15–21:45 (1.5 h)

describe('auto hours', () => {
  it('sums only ticked blocks (skipped ones excluded)', () => {
    let s = run(initialState(MON), tick(MON, 'plan'), tick(MON, 'java'));
    expect(autoHours(s, MON)).toBe(2.75);
    s = run(s, tick(MON, 'cs'), { type: 'skipTask', date: MON, id: 'cs', reason: '' });
    expect(effectiveHours(s, MON)).toEqual({ hours: 2.75, source: 'auto' });
    expect(autoHours(s, TUE)).toBe(0);
  });

  it('uses edited times from overrides', () => {
    const s = run(
      initialState(MON),
      { type: 'setOverride', dates: [MON], id: 'java', override: { text: 'Auth', start: '12:00', end: '14:00', subject: 'java' } },
      tick(MON, 'java'),
    );
    expect(autoHours(s, MON)).toBe(2);
  });

  it('counts ticked custom tasks by their duration (time span, else the 30-minute default)', () => {
    const s = run(
      initialState(MON),
      { type: 'addCustom', date: MON, task: { id: 'c-timed', text: 'Mock test', start: '18:00', end: '19:15', subject: 'apt', done: true } },
      { type: 'addCustom', date: MON, task: { id: 'c-untimed', text: 'Read notes', subject: 'cs', done: true } },
      { type: 'addCustom', date: MON, task: { id: 'c-open', text: 'Not done', start: '07:00', end: '08:00', subject: 'cs', done: false } },
    );
    expect(autoHours(s, MON)).toBe(1.75); // 1 h 15 m + 30 m default; the unticked one adds nothing
  });

  it('counts a carried item on the day it is completed, with its original block duration', () => {
    let s = run(
      initialState(MON),
      { type: 'setOverride', dates: [MON], id: 'dsa2', override: { text: 'Graphs', start: '20:00', end: '21:00', subject: 'dsa' } },
      { type: 'rollover', today: TUE },
    );
    expect(s.carried.some((c) => c.id === `${MON}:dsa2`)).toBe(true);
    s = run(s, { type: 'rollover', today: WED }, { type: 'toggleCarried', id: `${MON}:dsa2`, date: WED });
    expect(autoHours(s, WED)).toBe(1); // edited 20:00–21:00 on its source day
    expect(autoHours(s, TUE)).toBe(0);
    expect(autoHours(s, MON)).toBe(0); // the original day doesn't change
  });

  it('counts Sunday tasks by their default or edited durations, and carried items finished on Sunday', () => {
    // Start on Fri 9 Oct (rolled through Thu), so Sunday's rollover carries Fri and Sat forward.
    let s = run(
      initialState('2026-10-09'),
      { type: 'toggleSunday', date: SUN, id: 'contest' },
      { type: 'toggleSunday', date: SUN, id: 'redo' },
      { type: 'setOverride', dates: [SUN], id: 'mock', override: { text: 'Mock', start: '10:00', end: '12:00', subject: 'apt' } },
      { type: 'toggleSunday', date: SUN, id: 'mock' },
    );
    expect(autoHours(s, SUN)).toBe(5); // contest 90 + redo 90 + mock edited to 10:00–12:00 (120)

    s = run(s, { type: 'rollover', today: SUN }); // Fri 9 – Sat 10 Oct were left unfinished
    const java = s.carried.find((c) => c.sourceBlockId === 'java')!;
    s = run(s, { type: 'toggleCarried', id: java.id, date: SUN });
    expect(autoHours(s, SUN)).toBe(7.5); // + carried Java block (2.5 h)
  });
});

describe('manual override', () => {
  it('a manual entry wins over the auto value, and reset goes back to auto', () => {
    let s = run(initialState(MON), tick(MON, 'java'), { type: 'setCounter', date: MON, field: 'hours', value: 3 });
    expect(effectiveHours(s, MON)).toEqual({ hours: 3, source: 'manual' });
    s = run(s, { type: 'setCounter', date: MON, field: 'hours', value: 0 });
    expect(effectiveHours(s, MON)).toEqual({ hours: 0, source: 'manual' }); // 0 entered by hand is still manual
    s = run(s, { type: 'resetHours', date: MON });
    expect(effectiveHours(s, MON)).toEqual({ hours: 2.5, source: 'auto' });
  });

  it('older saves: hours > 0 without the flag are treated as manual, 0 as auto', () => {
    const legacy = {
      days: {
        [MON]: { blocks: { java: true }, sundayTasks: {}, dsa: 0, apps: 0, hours: 4, topicsCovered: [], morning: '', night: '', frozen: false },
        [TUE]: { blocks: { java: true }, sundayTasks: {}, dsa: 0, apps: 0, hours: 0, topicsCovered: [], morning: '', night: '', frozen: false },
      },
    };
    const s = sanitize(legacy, TUE);
    expect(effectiveHours(s, MON)).toEqual({ hours: 4, source: 'manual' });
    expect(effectiveHours(s, TUE)).toEqual({ hours: 2.5, source: 'auto' });
  });

  it('formats hours compactly', () => {
    expect(formatHours(10.5)).toBe('10.5');
    expect(formatHours(2.25)).toBe('2.25');
    expect(formatHours(1 / 3)).toBe('0.33');
    expect(formatHours(0)).toBe('0');
  });
});
