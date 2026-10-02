import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyDay, initialState, reducer } from '../state/reducer';
import type { Action, DayEdit, TrackerState } from '../state/types';
import { fromKey } from './dates';
import { canEditDay, shouldRemindDsa, totalDsa } from './dayDetails';
import { effectiveHours } from './hours';
import { OUTBOX_KEY } from './storage/outbox';
import { FakeServer, makeDevice } from './storage/testing';
import { currentStreak, longestStreak, statsFor } from './streak';
import { getDayTasks, makeCarried, tomorrowKey } from './tasks';
import { weekScore } from './weekScore';

// Mocked clock: fixed dates/instants only.
const FRI = '2026-10-02'; // plan day 1
const SAT = '2026-10-03';
const SUN = '2026-10-04';
const MON = '2026-10-05';
const AT = Date.UTC(2026, 9, 3, 6, 0);
const ALL = ['plan', 'apt', 'apps', 'cs', 'java', 'ai', 'dsa1', 'dsa2', 'recall'];
const run = (s: TrackerState, ...as: Action[]) => as.reduce(reducer, s);
const tick = (date: string, ids: string[]) => ids.map((id) => ({ type: 'toggleBlock', date, id }) as Action);
const patchOf = (s: TrackerState, date: string, p: Partial<DayEdit>): DayEdit => {
  const d = s.days[date] ?? emptyDay();
  return { dsa: d.dsa, apps: d.apps, hours: d.hours, hoursManual: d.hoursManual, topicsCovered: d.topicsCovered, morning: d.morning, night: d.night, ...p };
};
const edit = (s: TrackerState, date: string, today: string, p: Partial<DayEdit>, topicIds?: string[]): TrackerState =>
  reducer(s, { type: 'editDay', date, today, at: AT, patch: patchOf(s, date, p), topicIds });

describe('section 5: a carried-away task is not done on its original day', () => {
  it('ticked, then "Move to tomorrow": the tick no longer counts on Friday', () => {
    let s = run(initialState(FRI), ...tick(FRI, ALL));
    const dsa2 = getDayTasks(s.days[FRI], fromKey(FRI), s.plan).active.find((t) => t.id === 'dsa2')!;
    s = run(s, { type: 'moveOut', date: FRI, id: 'dsa2', item: makeCarried(FRI, dsa2, tomorrowKey(FRI)) });
    expect(s.carried.map((c) => c.id)).toEqual([`${FRI}:dsa2`]);
    expect(statsFor(s, fromKey(FRI))).toMatchObject({ done: 8, total: 9, pct: 89, counts: true }); // was 100% before the fix
  });

  it('carried at midnight, then a tick arrives for Friday (e.g. synced from another device): still not counted', () => {
    let s = run(initialState(FRI), ...tick(FRI, ALL.filter((x) => x !== 'dsa2')));
    s = run(s, { type: 'rollover', today: SAT }, { type: 'toggleBlock', date: FRI, id: 'dsa2' });
    expect(statsFor(s, fromKey(FRI)).pct).toBe(89); // was 100% before the fix
  });

  it('completing the carried item later is not credited back, and the task stays in the total', () => {
    let s = run(initialState(FRI), ...tick(FRI, ALL.filter((x) => x !== 'dsa2')));
    s = run(s, { type: 'rollover', today: SAT }, { type: 'toggleCarried', id: `${FRI}:dsa2`, date: SAT });
    expect(statsFor(s, fromKey(FRI))).toMatchObject({ done: 8, total: 9, pct: 89 });
  });

  it('a dropped carried item also counts as not done on its original day', () => {
    let s = run(initialState(FRI), ...tick(FRI, ALL.filter((x) => x !== 'dsa2')));
    s = run(s, { type: 'rollover', today: SAT }, { type: 'dropCarried', id: `${FRI}:dsa2` }, { type: 'toggleBlock', date: FRI, id: 'dsa2' });
    expect(statsFor(s, fromKey(FRI)).pct).toBe(89);
  });
});

describe('Day details: editing a past day', () => {
  it("updates the weekly totals, hours and the running DSA counter", () => {
    let s = run(initialState(FRI), ...tick(FRI, ['dsa1', 'dsa2']), { type: 'setCounter', date: SAT, field: 'dsa', value: 4 });
    expect(totalDsa(s)).toBe(4);
    s = edit(s, FRI, SAT, { dsa: 6, apps: 3, hours: 7.25, hoursManual: true });
    expect(s.days[FRI]).toMatchObject({ dsa: 6, apps: 3, hours: 7.25, hoursManual: true, editedAt: AT });
    expect(totalDsa(s)).toBe(10);
    const w = weekScore(s, 1, AT);
    expect(w.dsa).toBe(10);
    expect(w.apps).toBe(3);
    expect(effectiveHours(s, FRI, AT)).toEqual({ hours: 7.25, source: 'manual' });
    // reset to auto
    s = edit(s, FRI, SAT, { hoursManual: false });
    expect(effectiveHours(s, FRI, AT)).toEqual({ hours: 3.5, source: 'auto' }); // two ticked DSA blocks: 2 h + 1.5 h
  });

  it('clamps to the allowed ranges and ticks syllabus topics picked from autocomplete', () => {
    let s = edit(initialState(FRI), FRI, SAT, { dsa: 99, apps: -2, hours: 20, hoursManual: true, topicsCovered: [' Two pointers ', 'Two pointers', ''] }, ['w1-dsa']);
    expect(s.days[FRI]).toMatchObject({ dsa: 50, apps: 0, hours: 16, topicsCovered: ['Two pointers'] });
    expect(s.topicsDone['w1-dsa']).toBe(FRI);
    s = edit(s, FRI, SAT, { hours: 2.1, hoursManual: true });
    expect(s.days[FRI].hours).toBe(2); // steps of 0.25
  });

  it('never changes the day verdict or the current / longest streak', () => {
    const counted = run(initialState(FRI), ...tick(FRI, ['plan', 'apt', 'apps', 'cs', 'java', 'dsa1', 'dsa2']), ...tick(SAT, ['plan', 'apt', 'apps', 'cs', 'java', 'dsa1', 'dsa2']));
    const missed = run(initialState(FRI), ...tick(FRI, ['plan', 'dsa1']));
    for (const s of [counted, missed]) {
      const before = { fri: statsFor(s, fromKey(FRI)), cur: currentStreak(s, fromKey(SUN)), longest: longestStreak(s, fromKey(SUN)) };
      const after = edit(s, FRI, SUN, { dsa: 9, apps: 4, hours: 11, hoursManual: true, morning: 'm', night: 'n', topicsCovered: ['Arrays'] });
      expect({ fri: statsFor(after, fromKey(FRI)), cur: currentStreak(after, fromKey(SUN)), longest: longestStreak(after, fromKey(SUN)) }).toEqual(before);
      expect(after.days[FRI].blocks).toEqual(s.days[FRI].blocks); // ticks untouched
    }
  });

  it('future days and days before the plan cannot be edited; today can (without "edited later")', () => {
    const s = initialState(SAT);
    expect(edit(s, SUN, SAT, { dsa: 5 })).toBe(s);
    expect(edit(s, '2026-10-01', SAT, { dsa: 5 })).toBe(s);
    expect(canEditDay(SUN, SAT)).toBe(false);
    expect(canEditDay('2026-10-01', SAT)).toBe(false);
    expect(canEditDay(FRI, SAT)).toBe(true);
    const todayEdit = edit(s, SAT, SAT, { dsa: 2 });
    expect(todayEdit.days[SAT].dsa).toBe(2);
    expect(todayEdit.days[SAT].editedAt).toBeUndefined();
  });
});

describe('Today reminder: "Forgot yesterday\'s DSA count?"', () => {
  it('shows only when yesterday was a plan day with a ticked DSA block and 0 DSA problems', () => {
    const withDsaBlock = run(initialState(FRI), ...tick(FRI, ['dsa1']));
    expect(shouldRemindDsa(withDsaBlock, SAT)).toBe(true);
    expect(shouldRemindDsa(run(withDsaBlock, { type: 'setCounter', date: FRI, field: 'dsa', value: 3 }), SAT)).toBe(false);
    expect(shouldRemindDsa(run(initialState(FRI), ...tick(FRI, ['java', 'cs'])), SAT)).toBe(false); // no DSA block ticked
    expect(shouldRemindDsa(initialState(FRI), SAT)).toBe(false); // nothing saved for yesterday
    expect(shouldRemindDsa(run(initialState(FRI), ...tick('2026-10-01', ['dsa1'])), FRI)).toBe(false); // 1 Oct is before the plan
    // moved to tomorrow = not done on that day, so no reminder for it
    let moved = run(initialState(FRI), ...tick(FRI, ['dsa1']));
    const t = getDayTasks(moved.days[FRI], fromKey(FRI), moved.plan).active.find((x) => x.id === 'dsa1')!;
    moved = run(moved, { type: 'moveOut', date: FRI, id: 'dsa1', item: makeCarried(FRI, t, SAT) });
    expect(shouldRemindDsa(moved, SAT)).toBe(false);
  });

  it('stays dismissed for that day, and can show again for the next day', () => {
    const s = run(initialState(FRI), ...tick(FRI, ['dsa1']), ...tick(SUN, []), ...tick(MON, []));
    expect(shouldRemindDsa(s, SAT, FRI)).toBe(false); // dismissed for Friday
    const s2 = run(s, ...tick(SAT, ['dsa2']));
    expect(shouldRemindDsa(s2, SUN, FRI)).toBe(true); // Saturday is a new day
  });
});

describe('Day details edits sync', () => {
  const T0 = Date.parse('2026-10-03T08:00:00Z');
  const atSec = (sec: number) => vi.setSystemTime(T0 + sec * 1000);
  const devices: ReturnType<typeof makeDevice>[] = [];
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    atSec(0);
  });
  afterEach(() => {
    for (const d of devices.splice(0)) d.store.stop();
    vi.useRealTimers();
  });

  it('creates an outbox entry, uploads it, and a newer edit wins the merge', async () => {
    const server = new FakeServer();
    const a = makeDevice(server, SAT);
    const b = makeDevice(server, SAT);
    devices.push(a, b);
    await a.start();
    await b.start();

    atSec(1);
    b.dispatch({ type: 'editDay', date: FRI, today: SAT, at: Date.now(), patch: patchOf(b.state, FRI, { dsa: 3 }) });
    await b.store.flushNow();

    atSec(5);
    a.dispatch({ type: 'editDay', date: FRI, today: SAT, at: Date.now(), patch: patchOf(a.state, FRI, { dsa: 7, apps: 2 }) });
    expect(Object.keys(JSON.parse(a.kv.getItem(OUTBOX_KEY)!))).toContain(`days|${FRI}`);
    await a.store.flushNow();
    const row = server.get('days', FRI)!;
    expect(row.table === 'days' && row.day.dsa).toBe(7);

    await b.store.pullNow();
    expect(b.state.days[FRI]).toMatchObject({ dsa: 7, apps: 2 }); // newer edit wins
    expect(b.state.days[FRI].editedAt).toBe(T0 + 5000);
  });
});
