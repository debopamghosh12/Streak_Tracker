/** Pure state logic: no React, no storage. */
import { SUBJECTS } from '../data/plan';
import { fromKey, toKey } from '../lib/dates';
import { datesToRoll, makeCarried, unfinishedTasks, yesterdayKey } from '../lib/tasks';
import type { SubjectId } from '../data/plan';
import type { Action, CarriedItem, CustomTask, DayRecord, Override, ReviewRecord, TaskSubject, TrackerState, UserPhase, UserPlan, UserWeek, WeekTopics } from './types';

export const todayKey = () => toKey(new Date());

export const emptyDay = (): DayRecord => ({
  blocks: {},
  sundayTasks: {},
  dsa: 0,
  apps: 0,
  hours: 0,
  topicsCovered: [],
  morning: '',
  night: '',
  frozen: false,
  overrides: {},
  skipped: {},
  customTasks: [],
  movedOut: [],
});

export const emptyReview = (): ReviewRecord => ({ javaShipped: false, aiBuilt: false, well: '', slipped: '', change: '' });

/** Fresh state starts rolled through yesterday, so a first visit never floods Today with history. */
export const initialState = (today: string): TrackerState => ({
  days: {},
  topicsDone: {},
  carried: [],
  carryDropped: [],
  rolledThrough: yesterdayKey(today),
  reviews: {},
  plan: { weeks: {}, phases: {} },
  settings: { version: 2 },
});

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isKey = (k: unknown): k is string => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k);
const isTime = (t: unknown): t is string => typeof t === 'string' && /^\d{2}:\d{2}$/.test(t);
const SUBJECT_IDS = new Set<string>(SUBJECTS.map((s) => s.id));
const asSubject = (s: unknown): TaskSubject => (typeof s === 'string' && SUBJECT_IDS.has(s) ? (s as TaskSubject) : null);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

function sanitizeOverride(v: unknown): Override | null {
  if (!isObj(v)) return null;
  return {
    text: str(v.text),
    start: isTime(v.start) ? v.start : undefined,
    end: isTime(v.end) ? v.end : undefined,
    subject: asSubject(v.subject),
  };
}

export function sanitizeDay(v: Record<string, unknown>): DayRecord {
  const d = emptyDay();
  if (isObj(v.blocks)) d.blocks = Object.fromEntries(Object.entries(v.blocks).map(([k, x]) => [k, !!x]));
  if (isObj(v.sundayTasks)) d.sundayTasks = Object.fromEntries(Object.entries(v.sundayTasks).map(([k, x]) => [k, !!x]));
  for (const f of ['dsa', 'apps', 'hours'] as const) d[f] = Number.isFinite(Number(v[f])) ? Number(v[f]) : 0;
  d.topicsCovered = Array.isArray(v.topicsCovered) ? v.topicsCovered.filter((t): t is string => typeof t === 'string') : [];
  d.morning = str(v.morning);
  d.night = str(v.night);
  d.frozen = !!v.frozen;
  if (isObj(v.overrides)) {
    for (const [k, o] of Object.entries(v.overrides)) {
      const s = sanitizeOverride(o);
      if (s) d.overrides[k] = s;
    }
  }
  if (isObj(v.skipped)) d.skipped = Object.fromEntries(Object.entries(v.skipped).map(([k, r]) => [k, str(r)]));
  if (Array.isArray(v.customTasks)) {
    d.customTasks = v.customTasks.filter(isObj).map(
      (c): CustomTask => ({
        id: str(c.id) || `c-${Math.random().toString(36).slice(2, 9)}`,
        text: str(c.text),
        start: isTime(c.start) ? c.start : undefined,
        end: isTime(c.end) ? c.end : undefined,
        subject: asSubject(c.subject),
        done: !!c.done,
      }),
    );
  }
  d.movedOut = Array.isArray(v.movedOut) ? v.movedOut.filter((x): x is string => typeof x === 'string') : [];
  return d;
}

const SUBJECT_KEYS = ['dsa', 'java', 'cs', 'ai', 'apt'] as const;
const weekNum = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5000 ? n : null;
};

export function sanitizeUserWeek(v: unknown): UserWeek | null {
  if (!isObj(v)) return null;
  const n = weekNum(v.weekNumber);
  if (!n) return null;
  const rawTopics = isObj(v.topics) ? v.topics : {};
  const topics = Object.fromEntries(
    SUBJECT_KEYS.map((k) => {
      const t = typeof rawTopics[k] === 'string' ? (rawTopics[k] as string).trim() : '';
      return [k, t ? t.slice(0, 300) : null];
    }),
  ) as WeekTopics;
  const week: UserWeek = { weekNumber: n, phaseId: typeof v.phaseId === 'string' && v.phaseId ? v.phaseId : null, topics };
  if (isObj(v.targets)) {
    const targets: Partial<Record<SubjectId, string>> = {};
    for (const k of SUBJECT_KEYS) {
      const t = v.targets[k];
      if (typeof t === 'string' && t.trim()) targets[k] = t.trim().slice(0, 200);
    }
    if (Object.keys(targets).length) week.targets = targets;
  }
  return week;
}

export function sanitizeUserPhase(v: unknown): UserPhase | null {
  if (!isObj(v) || typeof v.id !== 'string' || !v.id) return null;
  const startWeek = weekNum(v.startWeek);
  const name = str(v.name).trim().slice(0, 80);
  if (!startWeek || !name) return null;
  const end = v.endWeek == null ? null : weekNum(v.endWeek);
  const phase: UserPhase = { id: v.id, name, startWeek, endWeek: end != null && end >= startWeek ? end : null };
  const goal = str(v.goal).trim();
  if (goal) phase.goal = goal.slice(0, 200);
  const dsa = Number(v.dsaGoal);
  if (Number.isInteger(dsa) && dsa > 0) phase.dsaGoal = dsa;
  return phase;
}

export function sanitizePlan(v: unknown): UserPlan {
  const plan: UserPlan = { weeks: {}, phases: {} };
  if (!isObj(v)) return plan;
  if (isObj(v.weeks)) {
    for (const w of Object.values(v.weeks)) {
      const s = sanitizeUserWeek(w);
      if (s) plan.weeks[String(s.weekNumber)] = s;
    }
  }
  if (isObj(v.phases)) {
    for (const p of Object.values(v.phases)) {
      const s = sanitizeUserPhase(p);
      if (s) plan.phases[s.id] = s;
    }
  }
  return plan;
}

export function sanitizeCarried(v: unknown): CarriedItem | null {
  if (!isObj(v) || typeof v.id !== 'string' || !isKey(v.sourceDate) || !isKey(v.currentDate)) return null;
  return {
    id: v.id,
    sourceDate: v.sourceDate,
    sourceBlockId: str(v.sourceBlockId),
    text: str(v.text),
    subject: asSubject(v.subject),
    currentDate: v.currentDate,
    moves: Math.max(1, Number(v.moves) || 1),
    done: !!v.done,
    completedOn: isKey(v.completedOn) ? v.completedOn : undefined,
  };
}

/** Rolls every unfinished task from past days forward to `today`. Returns the same object when nothing changes. */
export function rollover(state: TrackerState, today: string): TrackerState {
  let changed = false;
  // 1. Carried items still open on a past day move again (one move, however many days were skipped).
  let carried = state.carried.map((c) => {
    if (c.done || c.currentDate >= today) return c;
    changed = true;
    return { ...c, currentDate: today, moves: c.moves + 1 };
  });

  // 2. Unfinished tasks from days not yet processed become new carried items, straight onto today.
  const yesterday = yesterdayKey(today);
  let rolledThrough = state.rolledThrough;
  if (rolledThrough < yesterday) {
    const known = new Set([...carried.map((c) => c.id), ...state.carryDropped]);
    const fresh: CarriedItem[] = [];
    for (const k of datesToRoll(Object.keys(state.days), rolledThrough, today)) {
      for (const t of unfinishedTasks(state.days[k], fromKey(k), state.plan)) {
        const item = makeCarried(k, t, today);
        if (known.has(item.id)) continue;
        known.add(item.id);
        fresh.push(item);
      }
    }
    carried = [...carried, ...fresh];
    rolledThrough = yesterday;
    changed = true;
  }
  return changed ? { ...state, carried, rolledThrough } : state;
}

/**
 * Normalises anything parsed from storage or a backup into a valid v2 state.
 * v1 data (no `carried` field) is migrated: its old carry list becomes carried items.
 */
export function sanitize(raw: unknown, today: string): TrackerState {
  const base = initialState(today);
  if (!isObj(raw)) return base;

  const days: Record<string, DayRecord> = {};
  if (isObj(raw.days)) for (const [k, v] of Object.entries(raw.days)) if (isKey(k) && isObj(v)) days[k] = sanitizeDay(v);

  const reviews: Record<string, ReviewRecord> = {};
  if (isObj(raw.reviews)) {
    for (const [k, v] of Object.entries(raw.reviews)) if (isObj(v)) reviews[k] = { ...emptyReview(), ...(v as Partial<ReviewRecord>) };
  }

  const topicsDone: Record<string, string> = {};
  if (isObj(raw.topicsDone)) for (const [k, v] of Object.entries(raw.topicsDone)) if (isKey(v)) topicsDone[k] = v;

  const carryDropped = Array.isArray(raw.carryDropped) ? raw.carryDropped.filter((x): x is string => typeof x === 'string') : [];
  const plan = sanitizePlan(raw.plan);
  const state: TrackerState = { ...base, days, reviews, topicsDone, carryDropped, plan };

  if (Array.isArray(raw.carried)) {
    state.carried = raw.carried.map(sanitizeCarried).filter((c): c is CarriedItem => !!c);
    state.rolledThrough = isKey(raw.rolledThrough) ? raw.rolledThrough : base.rolledThrough;
    return state;
  }

  // ---- v1 migration ----
  // Items finished later in v1 become done carried items, so they are kept and never recreated.
  const v1Done = isObj(raw.carryDone) ? raw.carryDone : {};
  for (const [id, on] of Object.entries(v1Done)) {
    if (!isKey(on)) continue;
    const [src, taskId] = id.split(':');
    if (!isKey(src)) continue;
    const t = unfinishedTasks(days[src], fromKey(src), plan).find((x) => x.id === taskId);
    if (!t) continue;
    state.carried.push({ ...makeCarried(src, t, on), done: true, completedOn: on });
  }
  // Every other unchecked past block (not dropped in v1) is carried onto today.
  return rollover({ ...state, rolledThrough: '0000-00-00' }, today);
}

function withDay(state: TrackerState, date: string, fn: (d: DayRecord) => DayRecord): TrackerState {
  const cur = state.days[date] ?? emptyDay();
  return { ...state, days: { ...state.days, [date]: fn(cur) } };
}

const without = <T,>(rec: Record<string, T>, key: string) => {
  const next = { ...rec };
  delete next[key];
  return next;
};

export function reducer(state: TrackerState, action: Action): TrackerState {
  switch (action.type) {
    case 'toggleBlock':
      return withDay(state, action.date, (d) => ({ ...d, blocks: { ...d.blocks, [action.id]: !d.blocks[action.id] } }));
    case 'toggleSunday':
      return withDay(state, action.date, (d) => ({
        ...d,
        sundayTasks: { ...d.sundayTasks, [action.id]: !d.sundayTasks[action.id] },
      }));
    case 'toggleCustom':
      return withDay(state, action.date, (d) => ({
        ...d,
        customTasks: d.customTasks.map((c) => (c.id === action.id ? { ...c, done: !c.done } : c)),
      }));
    case 'setCounter':
      return withDay(state, action.date, (d) => ({ ...d, [action.field]: action.value }));
    case 'setText':
      return withDay(state, action.date, (d) => ({ ...d, [action.field]: action.value }));
    case 'addTag': {
      const next = withDay(state, action.date, (d) =>
        d.topicsCovered.includes(action.tag) ? d : { ...d, topicsCovered: [...d.topicsCovered, action.tag] },
      );
      if (action.topicId && !next.topicsDone[action.topicId]) {
        return { ...next, topicsDone: { ...next.topicsDone, [action.topicId]: action.date } };
      }
      return next;
    }
    case 'removeTag':
      return withDay(state, action.date, (d) => ({
        ...d,
        topicsCovered: d.topicsCovered.filter((_, i) => i !== action.index),
      }));
    case 'toggleTopic': {
      const topicsDone = { ...state.topicsDone };
      if (topicsDone[action.topicId]) delete topicsDone[action.topicId];
      else topicsDone[action.topicId] = action.date;
      return { ...state, topicsDone };
    }
    case 'setOverride':
      return action.dates.reduce(
        (s, date) => withDay(s, date, (d) => ({ ...d, overrides: { ...d.overrides, [action.id]: action.override } })),
        state,
      );
    case 'clearOverride':
      return withDay(state, action.date, (d) => ({ ...d, overrides: without(d.overrides, action.id) }));
    case 'skipTask':
      return withDay(state, action.date, (d) =>
        Object.keys(d.skipped).length >= 3 ? d : { ...d, skipped: { ...d.skipped, [action.id]: action.reason } },
      );
    case 'unskipTask':
      return withDay(state, action.date, (d) => ({ ...d, skipped: without(d.skipped, action.id) }));
    case 'moveOut': {
      if (state.carried.some((c) => c.id === action.item.id)) return state;
      const next = withDay(state, action.date, (d) => ({ ...d, movedOut: [...d.movedOut, action.id] }));
      return {
        ...next,
        carried: [...next.carried, action.item],
        carryDropped: next.carryDropped.filter((x) => x !== action.item.id),
      };
    }
    case 'undoMoveOut': {
      const next = withDay(state, action.date, (d) => ({ ...d, movedOut: d.movedOut.filter((x) => x !== action.id) }));
      const cid = `${action.date}:${action.id}`;
      return { ...next, carried: next.carried.filter((c) => c.id !== cid) };
    }
    case 'addCustom':
      return withDay(state, action.date, (d) => ({ ...d, customTasks: [...d.customTasks, action.task] }));
    case 'updateCustom':
      return withDay(state, action.date, (d) => ({
        ...d,
        customTasks: d.customTasks.map((c) => (c.id === action.id ? { ...c, ...action.patch } : c)),
      }));
    case 'deleteCustom':
      return withDay(state, action.date, (d) => ({ ...d, customTasks: d.customTasks.filter((c) => c.id !== action.id) }));
    case 'toggleCarried':
      return {
        ...state,
        carried: state.carried.map((c) =>
          c.id === action.id ? (c.done ? { ...c, done: false, completedOn: undefined } : { ...c, done: true, completedOn: action.date }) : c,
        ),
      };
    case 'updateCarried':
      return { ...state, carried: state.carried.map((c) => (c.id === action.id ? { ...c, ...action.patch } : c)) };
    case 'moveCarried':
      return { ...state, carried: state.carried.map((c) => (c.id === action.id ? { ...c, currentDate: action.date } : c)) };
    case 'dropCarried':
      return {
        ...state,
        carried: state.carried.filter((c) => c.id !== action.id),
        carryDropped: state.carryDropped.includes(action.id) ? state.carryDropped : [...state.carryDropped, action.id],
      };
    case 'restoreCarried': {
      if (state.carried.some((c) => c.id === action.item.id)) return state;
      const carried = [...state.carried];
      carried.splice(Math.min(action.index, carried.length), 0, action.item);
      return { ...state, carried, carryDropped: state.carryDropped.filter((x) => x !== action.item.id) };
    }
    case 'rollover':
      return rollover(state, action.today);
    case 'upsertPlanWeek': {
      const w = sanitizeUserWeek(action.week);
      if (!w) return state;
      return { ...state, plan: { ...state.plan, weeks: { ...state.plan.weeks, [String(w.weekNumber)]: w } } };
    }
    case 'deletePlanWeek': {
      const key = String(action.weekNumber);
      if (!(key in state.plan.weeks)) return state;
      return { ...state, plan: { ...state.plan, weeks: without(state.plan.weeks, key) } };
    }
    case 'upsertPlanPhase': {
      const p = sanitizeUserPhase(action.phase);
      if (!p) return state;
      return { ...state, plan: { ...state.plan, phases: { ...state.plan.phases, [p.id]: p } } };
    }
    case 'deletePlanPhase': {
      if (!(action.id in state.plan.phases)) return state;
      // Weeks pinned to the deleted phase fall back to range-based phases.
      const weeks = Object.fromEntries(
        Object.entries(state.plan.weeks).map(([k, w]) => [k, w.phaseId === action.id ? { ...w, phaseId: null } : w]),
      );
      const changed = Object.values(state.plan.weeks).some((w) => w.phaseId === action.id);
      return { ...state, plan: { weeks: changed ? weeks : state.plan.weeks, phases: without(state.plan.phases, action.id) } };
    }
    case 'freeze':
      return withDay(state, action.date, (d) => ({ ...d, frozen: true }));
    case 'updateReview': {
      const key = String(action.week);
      const cur = state.reviews[key] ?? emptyReview();
      return { ...state, reviews: { ...state.reviews, [key]: { ...cur, ...action.patch } } };
    }
    case 'import':
      return rollover(sanitize(action.state, action.today), action.today);
    case 'reset':
      return initialState(action.today);
    case 'replace':
      return action.state;
  }
}
