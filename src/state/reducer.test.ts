import { describe, expect, it } from 'vitest';
import { fromKey } from '../lib/dates';
import { dayStats } from '../lib/streak';
import { getDayTasks, makeCarried, tomorrowKey } from '../lib/tasks';
import { initialState, reducer, sanitize } from './reducer';
import type { Action, TrackerState } from './types';

const run = (s: TrackerState, ...as: Action[]) => as.reduce(reducer, s);
const stats = (s: TrackerState, k: string) => dayStats(s.days[k], fromKey(k));
const toggles = (date: string, ids: string[]) => ids.map((id) => ({ type: 'toggleBlock', date, id }) as Action);

const MON = '2026-10-05';
const TUE = '2026-10-06';
const WED = '2026-10-07';
const THU = '2026-10-08';
const FRI = '2026-10-09';
const SUN = '2026-10-11';

/** Monday with 3 skips, 5/6 blocks done, a custom task, and DSA block 2 moved to Tuesday. */
function monday() {
  let s = initialState(MON);
  s = run(s, ...['ai', 'recall', 'plan', 'cs'].map((id) => ({ type: 'skipTask', date: MON, id, reason: 'r' }) as Action));
  s = run(s, ...toggles(MON, ['apt', 'apps', 'java', 'dsa1', 'cs']));
  s = run(s, { type: 'addCustom', date: MON, task: { id: 'c-1', text: 'Revise SQL', subject: 'cs', done: false } });
  const dsa2 = getDayTasks(s.days[MON], fromKey(MON)).active.find((x) => x.id === 'dsa2')!;
  return run(s, { type: 'moveOut', date: MON, id: 'dsa2', item: makeCarried(MON, dsa2, tomorrowKey(MON)) });
}

describe('streak rules with edits', () => {
  it('allows at most 3 skips a day and removes them from the denominator', () => {
    const s = run(initialState(MON), ...['ai', 'recall', 'plan', 'cs'].map((id) => ({ type: 'skipTask', date: MON, id, reason: 'r' }) as Action));
    expect(Object.keys(s.days[MON].skipped)).toHaveLength(3);
    expect(stats(s, MON).total).toBe(6);
  });

  it('counts at 70% with a DSA block', () => {
    let s = run(initialState(MON), ...['ai', 'recall', 'plan'].map((id) => ({ type: 'skipTask', date: MON, id, reason: '' }) as Action));
    s = run(s, ...toggles(MON, ['apt', 'apps', 'java', 'dsa1']));
    expect(stats(s, MON)).toMatchObject({ counts: false, needed: 1 });
    s = run(s, { type: 'toggleBlock', date: MON, id: 'cs' });
    expect(stats(s, MON).counts).toBe(true);
  });

  it('needs a DSA block even at 7/9', () => {
    const s = run(initialState(MON), ...toggles(MON, ['plan', 'apt', 'apps', 'cs', 'java', 'ai', 'recall']));
    expect(stats(s, MON)).toMatchObject({ counts: false, needed: 1 });
  });

  it('custom tasks and moved-out blocks stay in the denominator', () => {
    const s = monday();
    expect(stats(s, MON).total).toBe(7);
    expect(stats(s, MON).counts).toBe(true);
    expect(s.carried).toHaveLength(1);
    expect(s.carried[0]).toMatchObject({ currentDate: TUE, moves: 1 });
  });

  it('scales the Sunday threshold with skips', () => {
    const three = run(initialState(SUN), ...['contest', 'redo', 'mock'].map((id) => ({ type: 'toggleSunday', date: SUN, id }) as Action));
    expect(stats(three, SUN).counts).toBe(true);
    const skipped = run(
      initialState(SUN),
      { type: 'skipTask', date: SUN, id: 'review', reason: '' },
      { type: 'skipTask', date: SUN, id: 'mock', reason: '' },
      { type: 'toggleSunday', date: SUN, id: 'contest' },
    );
    expect(stats(skipped, SUN)).toMatchObject({ counts: false, total: 3, needed: 1 });
  });
});

describe('carry-forward', () => {
  it('rolls unfinished, non-skipped, carryable tasks forward without duplicates', () => {
    let s = monday();
    const verdict = stats(s, MON).counts;
    s = run(s, { type: 'rollover', today: TUE });
    expect(s.carried.map((c) => c.id).sort()).toEqual([`${MON}:c-1`, `${MON}:dsa2`]);
    expect(s.carried.every((c) => c.currentDate === TUE && c.moves === 1)).toBe(true);
    expect(run(s, { type: 'rollover', today: TUE })).toBe(s);

    s = run(s, { type: 'toggleCarried', id: `${MON}:c-1`, date: TUE });
    expect(stats(s, TUE).done).toBe(0);
    expect(stats(s, MON).counts).toBe(verdict);
    expect(s.carried.find((c) => c.id === `${MON}:c-1`)!.completedOn).toBe(TUE);
  });

  it('jumps straight to today after unopened days, one move, never duplicated', () => {
    let s = run(monday(), { type: 'rollover', today: TUE }, { type: 'rollover', today: FRI });
    const dsa2 = s.carried.filter((c) => c.id === `${MON}:dsa2`);
    expect(dsa2).toHaveLength(1);
    expect(dsa2[0]).toMatchObject({ currentDate: FRI, moves: 2 });
    expect(s.carried.filter((c) => [TUE, WED, THU].includes(c.sourceDate)).every((c) => c.currentDate === FRI)).toBe(true);
    expect(s.carried.some((c) => c.sourceBlockId === 'plan' || c.sourceBlockId === 'recall')).toBe(false);
    s = run(s, { type: 'rollover', today: FRI });
    expect(s.carried.filter((c) => c.id === `${MON}:dsa2`)).toHaveLength(1);
  });

  it('drop tombstones, undo restores, rescheduled items wait', () => {
    const s = run(monday(), { type: 'rollover', today: TUE });
    const idx = s.carried.findIndex((c) => c.id === `${MON}:dsa2`);
    const item = s.carried[idx];
    let d = run(s, { type: 'dropCarried', id: item.id });
    expect(d.carryDropped).toContain(item.id);
    expect(run(d, { type: 'rollover', today: '2026-10-12' }).carried.some((c) => c.id === item.id)).toBe(false);
    d = run(d, { type: 'restoreCarried', item, index: idx });
    expect(d.carried[idx].id).toBe(item.id);
    d = run(d, { type: 'moveCarried', id: item.id, date: '2026-10-15' }, { type: 'rollover', today: '2026-10-12' });
    expect(d.carried.find((c) => c.id === item.id)!.currentDate).toBe('2026-10-15');
  });
});

describe('overrides and backups', () => {
  it('applies overrides to chosen days and resets one date', () => {
    let o = run(initialState(MON), {
      type: 'setOverride',
      dates: [MON, TUE, WED],
      id: 'java',
      override: { text: 'Build auth', start: '12:00', end: '14:00', subject: 'java' },
    });
    expect(o.days[THU]).toBeUndefined();
    o = run(o, { type: 'clearOverride', date: TUE, id: 'java' });
    expect(o.days[TUE].overrides.java).toBeUndefined();
    expect(o.days[WED].overrides.java).toBeDefined();
    const jt = getDayTasks(o.days[MON], fromKey(MON)).active.find((x) => x.id === 'java')!;
    expect(jt).toMatchObject({ edited: true, start: '12:00' });
    expect(jt.base!.start).toBe('11:45');
  });

  it('round-trips a v2 backup', () => {
    const s = run(monday(), { type: 'rollover', today: FRI });
    const back = sanitize(JSON.parse(JSON.stringify(s)), FRI);
    expect(back.carried).toEqual(s.carried);
    expect(back.days).toEqual(s.days);
  });

  it('migrates v1 data into carried items', () => {
    const v1 = {
      days: { '2026-09-30': { blocks: { plan: true, dsa1: true }, sundayTasks: {}, dsa: 1, apps: 0, hours: 1, topicsCovered: [], morning: '', night: '', frozen: false } },
      topicsDone: {},
      carryDropped: ['2026-09-30:ai'],
      carryDone: {},
      reviews: {},
      settings: { version: 1 },
    };
    const s = sanitize(v1, '2026-10-01');
    expect(s.carried.map((c) => c.sourceBlockId).sort()).toEqual(['apps', 'apt', 'cs', 'dsa2', 'java']);
    expect(s.carryDropped).toEqual(['2026-09-30:ai']);
  });
});
