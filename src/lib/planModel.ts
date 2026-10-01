/**
 * The effective plan = the built-in 13 base weeks + the user's own weeks and phases.
 * A user week with the same number as a base week overrides it. Weeks nobody defined
 * still exist (the plan is open-ended) — their topics are simply "not set".
 */
import {
  BASE_PHASES,
  BASE_WEEKS,
  DEFAULT_PHASE,
  SUBJECTS,
  WEEKLY_TARGETS,
  WEEKS,
  topicId,
  type SubjectId,
  type TopicTexts,
} from '../data/plan';
import type { UserPhase, UserPlan, UserWeek } from '../state/types';
import { weekEnd, weekNumberFor, weekStart } from './dates';

export const EMPTY_PLAN: UserPlan = { weeks: {}, phases: {} };

export interface EffectivePhase {
  id: string;
  name: string;
  startWeek: number;
  endWeek: number | null;
  goal?: string;
  dsaGoal?: number;
  kind: 'base' | 'user' | 'default';
  /** 1-based display number ("Phase 4 — Keep going"). */
  number: number;
}

export interface EffectiveTopic {
  id: string;
  week: number;
  subject: SubjectId;
  title: string | null;
}

export interface EffectiveWeek {
  n: number;
  start: Date;
  end: Date;
  texts: TopicTexts;
  topics: Record<SubjectId, EffectiveTopic>;
  /** base: built-in · override: user edit of a base week · user: user-added · empty: nobody defined it */
  source: 'base' | 'override' | 'user' | 'empty';
  anySet: boolean;
  allSet: boolean;
  phase: EffectivePhase;
  targets: Record<SubjectId, string>;
  userWeek?: UserWeek;
}

const emptyTexts = (): TopicTexts => ({ dsa: null, java: null, cs: null, ai: null, apt: null });

export const emptyUserWeek = (n: number): UserWeek => ({ weekNumber: n, phaseId: null, topics: emptyTexts() });

/** Highest week that has a plan (base or user). */
export function lastPlannedWeek(plan: UserPlan = EMPTY_PLAN): number {
  return Math.max(BASE_WEEKS, ...Object.values(plan.weeks).map((w) => w.weekNumber));
}

/** Weeks shown in lists, heatmap and selectors: through the current week or the last planned one, whichever is later. */
export function lastShownWeek(plan: UserPlan, today: Date): number {
  return Math.max(lastPlannedWeek(plan), weekNumberFor(today));
}

export function weekTexts(plan: UserPlan, n: number): TopicTexts {
  const user = plan.weeks[String(n)];
  if (user) return { ...emptyTexts(), ...user.topics };
  const base = WEEKS[n - 1];
  if (base) return Object.fromEntries(SUBJECTS.map((s) => [s.id, base.topics[s.id].title])) as TopicTexts;
  return emptyTexts();
}

/** All phases in display order: base, then user phases by start week, numbered 1..n. The default phase is numbered last. */
export function phasesOf(plan: UserPlan = EMPTY_PLAN): EffectivePhase[] {
  const user = Object.values(plan.phases).sort((a, b) => a.startWeek - b.startWeek || a.name.localeCompare(b.name));
  const list: Omit<EffectivePhase, 'number'>[] = [
    ...BASE_PHASES.map((p) => ({ ...p, kind: 'base' as const })),
    ...user.map((p: UserPhase) => ({ ...p, kind: 'user' as const })),
  ];
  return [...list, { ...DEFAULT_PHASE, kind: 'default' as const }].map((p, i) => ({ ...p, number: i + 1 }));
}

const covers = (p: { startWeek: number; endWeek: number | null }, n: number) => n >= p.startWeek && (p.endWeek == null || n <= p.endWeek);

/**
 * Phase of week n: the week's explicit phase if set, else the latest-starting user phase that
 * covers it, else the base phase, else "Keep going".
 */
export function phaseFor(plan: UserPlan, n: number, phases: EffectivePhase[] = phasesOf(plan)): EffectivePhase {
  const explicit = plan.weeks[String(n)]?.phaseId;
  if (explicit) {
    const p = phases.find((x) => x.id === explicit);
    if (p) return p;
  }
  const user = phases.filter((p) => p.kind === 'user' && covers(p, n)).sort((a, b) => b.startWeek - a.startWeek)[0];
  if (user) return user;
  const base = phases.find((p) => p.kind === 'base' && covers(p, n));
  return base ?? phases[phases.length - 1];
}

export function getWeek(plan: UserPlan, n: number, phases: EffectivePhase[] = phasesOf(plan)): EffectiveWeek {
  const userWeek = plan.weeks[String(n)];
  const texts = weekTexts(plan, n);
  const topics = Object.fromEntries(
    SUBJECTS.map((s) => [s.id, { id: topicId(n, s.id), week: n, subject: s.id, title: texts[s.id] }]),
  ) as Record<SubjectId, EffectiveTopic>;
  const setCount = SUBJECTS.filter((s) => texts[s.id]).length;
  const targets = Object.fromEntries(
    WEEKLY_TARGETS.map((t) => [t.subject, userWeek?.targets?.[t.subject]?.trim() || t.target]),
  ) as Record<SubjectId, string>;
  return {
    n,
    start: weekStart(n),
    end: weekEnd(n),
    texts,
    topics,
    source: userWeek ? (n <= BASE_WEEKS ? 'override' : 'user') : n <= BASE_WEEKS ? 'base' : 'empty',
    anySet: setCount > 0,
    allSet: setCount === SUBJECTS.length,
    phase: phaseFor(plan, n, phases),
    targets,
    userWeek,
  };
}

/** Weeks 1..last (inclusive). */
export function listWeeks(plan: UserPlan, last: number): EffectiveWeek[] {
  const phases = phasesOf(plan);
  return Array.from({ length: Math.max(0, last) }, (_, i) => getWeek(plan, i + 1, phases));
}

/** Topics that are actually set, in weeks 1..upTo. */
export function setTopics(plan: UserPlan, upTo: number): EffectiveTopic[] {
  return listWeeks(plan, upTo).flatMap((w) => SUBJECTS.map((s) => w.topics[s.id]).filter((t) => t.title));
}

/** % of planned (set) topics done, across every planned week. */
export function plannedSyllabusPercent(plan: UserPlan, topicsDone: Record<string, string>): number {
  const topics = setTopics(plan, lastPlannedWeek(plan));
  if (topics.length === 0) return 0;
  return Math.round((topics.filter((t) => topicsDone[t.id]).length / topics.length) * 100);
}

/** Heatmap span: from week 1 through the current week or the last planned week, whichever is later. */
export function heatmapRange(plan: UserPlan, today: Date): { weeks: number; from: Date; to: Date } {
  const weeks = lastShownWeek(plan, today);
  return { weeks, from: weekStart(1), to: weekEnd(weeks) };
}
