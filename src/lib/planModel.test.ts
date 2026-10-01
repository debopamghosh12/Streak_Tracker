import { describe, expect, it } from 'vitest';
import { initialState, reducer } from '../state/reducer';
import type { Action, TrackerState, UserPlan } from '../state/types';
import { daysElapsed, toKey, weekEnd, weekNumberFor, weekRangeLabel } from './dates';
import {
  EMPTY_PLAN,
  emptyUserWeek,
  getWeek,
  heatmapRange,
  lastPlannedWeek,
  lastShownWeek,
  phaseFor,
  phasesOf,
  plannedSyllabusPercent,
} from './planModel';
import { currentStreak, daysCounted, daysSoFar, longestStreak } from './streak';
import { getDayTasks } from './tasks';

// All dates are fixed — no test reads the real clock.
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const run = (s: TrackerState, ...as: Action[]) => as.reduce(reducer, s);
const ALL_BLOCKS = ['plan', 'apt', 'apps', 'cs', 'java', 'ai', 'dsa1', 'dsa2', 'recall'];

describe('week numbering has no upper limit', () => {
  it('continues from 2 Oct 2026 in 7-day steps', () => {
    expect(weekNumberFor(d(2026, 10, 2))).toBe(1);
    expect(weekNumberFor(d(2026, 12, 31))).toBe(13);
    expect(weekNumberFor(d(2027, 1, 1))).toBe(14);
    expect(weekNumberFor(d(2027, 3, 15))).toBe(24);
    expect(weekNumberFor(d(2026, 9, 20))).toBe(1); // before the start
    expect(weekRangeLabel(14)).toBe('1 Jan – 7 Jan 2027');
  });
});

describe('effective plan', () => {
  const plan: UserPlan = {
    weeks: {
      '3': { weekNumber: 3, phaseId: null, topics: { dsa: 'Custom DSA', java: null, cs: 'Custom CS', ai: null, apt: null } },
      '20': emptyUserWeek(20),
    },
    phases: {},
  };

  it('a user week overrides the base week with the same number (topic ids unchanged)', () => {
    const w3 = getWeek(plan, 3);
    expect(w3.source).toBe('override');
    expect(w3.texts.dsa).toBe('Custom DSA');
    expect(w3.texts.java).toBeNull();
    expect(w3.topics.dsa.id).toBe('w3-dsa');
    expect(getWeek(plan, 4).texts.dsa).toBe('Strings, sorting, prefix sums');
    expect(getWeek(EMPTY_PLAN, 3).texts.dsa).toBe('Binary search (arrays + on answer)');
  });

  it('an undefined week has placeholder tasks and the "Keep going" phase', () => {
    const w14 = getWeek(EMPTY_PLAN, 14);
    expect(w14).toMatchObject({ source: 'empty', anySet: false });
    expect(w14.phase).toMatchObject({ name: 'Keep going', number: 4, kind: 'default' });
    const tasks = getDayTasks(undefined, d(2027, 1, 4), EMPTY_PLAN).active; // Monday of week 14
    expect(tasks.find((t) => t.id === 'dsa1')!.text).toBe("Set this week's DSA topic");
    expect(tasks.find((t) => t.id === 'apt')!.text).toBe("Set this week's aptitude topic");
    expect(tasks).toHaveLength(9); // same daily timetable
  });

  it('user phases take over their range; explicit week phase wins', () => {
    const withPhase: UserPlan = {
      weeks: { '16': { ...emptyUserWeek(16), phaseId: 'base-3' } },
      phases: { p1: { id: 'p1', name: 'Offers', startWeek: 14, endWeek: null, dsaGoal: 450 } },
    };
    expect(phaseFor(withPhase, 15)).toMatchObject({ name: 'Offers', number: 4 });
    expect(phaseFor(withPhase, 16).name).toBe('Interview mode');
    expect(phasesOf(withPhase).slice(-1)[0]).toMatchObject({ name: 'Keep going', number: 5 });
  });

  it('planned range, heatmap range and syllabus percent', () => {
    expect(lastPlannedWeek(EMPTY_PLAN)).toBe(13);
    expect(lastPlannedWeek(plan)).toBe(20);
    expect(lastShownWeek(plan, d(2027, 3, 15))).toBe(24);
    expect(heatmapRange(EMPTY_PLAN, d(2027, 3, 15))).toEqual({ weeks: 24, from: d(2026, 10, 2), to: weekEnd(24) });
    expect(heatmapRange(plan, d(2026, 10, 10)).weeks).toBe(20); // a later planned week extends it
    expect(plannedSyllabusPercent(EMPTY_PLAN, { 'w1-dsa': '2026-10-02' })).toBe(2); // 1 of 65
  });
});

describe('streak past week 13', () => {
  const counting = (dates: Date[]) =>
    run(initialState('2026-12-30'), ...dates.flatMap((x) => ALL_BLOCKS.map((id) => ({ type: 'toggleBlock', date: toKey(x), id }) as Action)));

  it('counts days and streaks across the new year', () => {
    const s = counting([d(2026, 12, 31), d(2027, 1, 1), d(2027, 1, 2)]);
    const today = d(2027, 1, 3); // Sunday, nothing done yet
    expect(daysCounted(s, today)).toBe(3);
    expect(daysSoFar(today)).toBe(94); // 91 base days + 3
    expect(daysElapsed(d(2026, 10, 1))).toBe(0);
    expect(currentStreak(s, today)).toBe(3);
    expect(longestStreak(s, today)).toBe(3);
  });

  it('rolls unfinished work forward after 31 Dec', () => {
    const s = run(initialState('2026-12-31'), { type: 'rollover', today: '2027-01-05' });
    const sources = new Set(s.carried.map((c) => c.sourceDate));
    expect([...sources].sort()).toEqual(['2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03', '2027-01-04']);
    expect(s.carried.every((c) => c.currentDate === '2027-01-05')).toBe(true);
    expect(s.carried.find((c) => c.id === '2027-01-04:dsa1')!.text).toBe("DSA block 1 — Set this week's DSA topic");
  });
});

describe('plan actions', () => {
  it('adds, edits and deletes weeks; deleting a phase unpins its weeks', () => {
    let s = initialState('2027-01-01');
    s = run(
      s,
      { type: 'upsertPlanPhase', phase: { id: 'p1', name: 'Offers', startWeek: 14, endWeek: null } },
      { type: 'upsertPlanWeek', week: { ...emptyUserWeek(14), phaseId: 'p1', topics: { dsa: ' Graphs ', java: '', cs: null, ai: null, apt: null } } },
    );
    expect(s.plan.weeks['14'].topics).toEqual({ dsa: 'Graphs', java: null, cs: null, ai: null, apt: null });
    s = run(s, { type: 'deletePlanPhase', id: 'p1' });
    expect(s.plan.phases).toEqual({});
    expect(s.plan.weeks['14'].phaseId).toBeNull();
    s = run(s, { type: 'deletePlanWeek', weekNumber: 14 });
    expect(s.plan.weeks).toEqual({});
  });
});
