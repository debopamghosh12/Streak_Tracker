/** Pure state logic: no React, no storage. */
import { PLAN_START, SUBJECTS } from '../data/plan';
import { fromKey, toKey } from '../lib/dates';
import { datesToRoll, makeCarried, tomorrowKey, unfinishedTasks, yesterdayKey } from '../lib/tasks';
import { effectiveSlots, findRunning, getDayItems, trackedMs, validateSlot } from '../lib/dayItems';
import type { SubjectId } from '../data/plan';
import type {
  Action,
  AppSettings,
  CarriedItem,
  CustomTask,
  DayRecord,
  Override,
  ReviewRecord,
  SessionFocus,
  Slot,
  TaskSubject,
  TaskTimer,
  TrackerState,
  UserPhase,
  UserPlan,
  UserWeek,
  WeekTopics,
} from './types';

export const todayKey = () => toKey(new Date());

export const emptyDay = (): DayRecord => ({
  blocks: {},
  sundayTasks: {},
  dsa: 0,
  apps: 0,
  hours: 0,
  hoursManual: false,
  topicsCovered: [],
  morning: '',
  night: '',
  frozen: false,
  overrides: {},
  skipped: {},
  customTasks: [],
  movedOut: [],
  placement: {},
  timers: {},
});

export const defaultSettings = (): AppSettings => ({ version: 2, todayMode: 'flow', defaultSlots: [] });

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
  settings: defaultSettings(),
});

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isKey = (k: unknown): k is string => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k);
const isTime = (t: unknown): t is string => typeof t === 'string' && /^\d{2}:\d{2}$/.test(t);
const SUBJECT_IDS = new Set<string>(SUBJECTS.map((s) => s.id));
const asSubject = (s: unknown): TaskSubject => (typeof s === 'string' && SUBJECT_IDS.has(s) ? (s as TaskSubject) : null);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

const asDuration = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 5 && n <= 24 * 60 ? n : undefined;
};

function sanitizeOverride(v: unknown): Override | null {
  if (!isObj(v)) return null;
  const o: Override = {
    text: str(v.text),
    start: isTime(v.start) ? v.start : undefined,
    end: isTime(v.end) ? v.end : undefined,
    subject: asSubject(v.subject),
  };
  const dur = asDuration(v.durationMin);
  if (dur) o.durationMin = dur;
  return o;
}

export function sanitizeSlots(v: unknown): Slot[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: Slot[] = [];
  for (const x of v) {
    if (!isObj(x) || typeof x.id !== 'string' || !x.id || !isTime(x.start) || !isTime(x.end)) continue;
    const slot: Slot = { id: x.id, start: x.start, end: x.end };
    const label = str(x.label).trim().slice(0, 40);
    if (label) slot.label = label;
    if (!validateSlot(out, slot)) out.push(slot); // drop invalid or overlapping slots
  }
  return out;
}

/** Focus numbers only (seconds and a count); anything else is dropped. */
function sanitizeFocus(v: unknown): SessionFocus | null {
  if (!isObj(v)) return null;
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : 0);
  return { focused: n(v.focused), distracted: n(v.distracted), away: n(v.away), pickups: Math.round(n(v.pickups)) };
}

const addFocus = (a: SessionFocus | undefined, b: SessionFocus): SessionFocus => ({
  focused: (a?.focused ?? 0) + b.focused,
  distracted: (a?.distracted ?? 0) + b.distracted,
  away: (a?.away ?? 0) + b.away,
  pickups: (a?.pickups ?? 0) + b.pickups,
});

function sanitizeTimers(v: unknown): Record<string, TaskTimer> {
  const out: Record<string, TaskTimer> = {};
  if (!isObj(v)) return out;
  const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null);
  for (const [id, t] of Object.entries(v)) {
    if (!isObj(t)) continue;
    const sessions = (Array.isArray(t.sessions) ? t.sessions : [])
      .filter(isObj)
      .map((x) => {
        const session: { start: number | null; end: number | null; focus?: SessionFocus } = { start: num(x.start), end: num(x.end) };
        const f = sanitizeFocus(x.focus);
        if (f) session.focus = f;
        return session;
      })
      .filter((x): x is { start: number; end: number; focus?: SessionFocus } => x.start != null && x.end != null && x.end >= x.start);
    const timer: TaskTimer = { sessions };
    const run = sanitizeFocus(t.focusRun);
    if (run) timer.focusRun = run;
    const kept = sanitizeFocus(t.focusKept);
    if (kept) timer.focusKept = kept;
    const running = num(t.runningSince);
    if (running != null) {
      timer.runningSince = running;
      const startedAt = num(t.runStartedAt);
      if (startedAt != null) timer.runStartedAt = startedAt;
    }
    const nonNeg = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null);
    const base = nonNeg(t.baseMs);
    if (base != null) timer.baseMs = base;
    const prior = nonNeg(t.priorMs);
    if (prior) timer.priorMs = prior;
    out[id] = timer;
  }
  return out;
}

export function sanitizeSettings(v: unknown): AppSettings {
  const s = defaultSettings();
  if (!isObj(v)) return s;
  if (v.todayMode === 'flow' || v.todayMode === 'slots') s.todayMode = v.todayMode;
  s.defaultSlots = sanitizeSlots(v.defaultSlots) ?? [];
  return s;
}

export function sanitizeDay(v: Record<string, unknown>): DayRecord {
  const d = emptyDay();
  if (isObj(v.blocks)) d.blocks = Object.fromEntries(Object.entries(v.blocks).map(([k, x]) => [k, !!x]));
  if (isObj(v.sundayTasks)) d.sundayTasks = Object.fromEntries(Object.entries(v.sundayTasks).map(([k, x]) => [k, !!x]));
  for (const f of ['dsa', 'apps', 'hours'] as const) d[f] = Number.isFinite(Number(v[f])) ? Number(v[f]) : 0;
  // Older saves had no flag: any hours entered then were entered by hand.
  d.hoursManual = typeof v.hoursManual === 'boolean' ? v.hoursManual : d.hours > 0;
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
        ...(asDuration(c.durationMin) ? { durationMin: asDuration(c.durationMin) } : {}),
      }),
    );
  }
  d.movedOut = Array.isArray(v.movedOut) ? v.movedOut.filter((x): x is string => typeof x === 'string') : [];
  // Flow / Slots fields (absent in older saves: plan order, default slots, nothing placed, no timers).
  if (Array.isArray(v.order)) d.order = v.order.filter((x): x is string => typeof x === 'string');
  const slots = sanitizeSlots(v.slots);
  if (slots) d.slots = slots;
  if (isObj(v.placement)) {
    d.placement = Object.fromEntries(Object.entries(v.placement).filter(([, x]) => typeof x === 'string')) as Record<string, string>;
  }
  d.timers = sanitizeTimers(v.timers);
  if (typeof v.editedAt === 'number' && Number.isFinite(v.editedAt) && v.editedAt > 0) d.editedAt = v.editedAt;
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
  return splitAtMidnight(changed ? { ...state, carried, rolledThrough } : state, today);
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
  const state: TrackerState = { ...base, days, reviews, topicsDone, carryDropped, plan, settings: sanitizeSettings(raw.settings) };

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

/** Closes a running timer at `at` (no-op if it isn't running). */
function closeTimer(timers: Record<string, TaskTimer>, id: string, at: number): Record<string, TaskTimer> {
  const t = timers[id];
  if (t?.runningSince == null) return timers;
  const { runningSince, focusRun, ...rest } = t;
  delete rest.runStartedAt;
  const session = { start: runningSince, end: Math.max(runningSince, at), ...(focusRun ? { focus: focusRun } : {}) };
  return { ...timers, [id]: { ...rest, sessions: [...t.sessions, session] } };
}

/**
 * A stopwatch left running across midnight: close the session at 00:00 local on its day and
 * continue it on the next day — on the carried item if the task was carried forward, else on the
 * same task id. Repeats for every midnight up to `today`. Never stops or trims the timer.
 */
function splitAtMidnight(state: TrackerState, today: string): TrackerState {
  const running = findRunning(state.days);
  if (!running || running.date >= today) return state;
  let next = state;
  let { date, id, timer } = running;
  while (date < today && timer.runningSince != null) {
    const nextDate = tomorrowKey(date);
    const boundary = fromKey(nextDate).getTime(); // 00:00 local on the next day
    const start = timer.runningSince;
    const startedAt = timer.runStartedAt ?? start;
    const { runningSince: _r, runStartedAt: _s, focusRun, ...rest } = timer;
    void _r;
    void _s;
    const closedSession = { start, end: boundary, ...(focusRun ? { focus: focusRun } : {}) };
    const closed: TaskTimer = { ...rest, sessions: start < boundary ? [...timer.sessions, closedSession] : timer.sessions };
    next = withDay(next, date, (d) => ({ ...d, timers: { ...d.timers, [id]: closed } }));

    const nextId = id.includes(':') ? id : next.carried.some((c) => c.id === `${date}:${id}`) ? `${date}:${id}` : id;
    const existing = next.days[nextDate]?.timers?.[nextId];
    const continued: TaskTimer = {
      sessions: existing?.sessions ?? [],
      ...(existing?.baseMs != null ? { baseMs: existing.baseMs } : {}),
      priorMs: (closed.priorMs ?? 0) + trackedMs(closed),
      runningSince: Math.max(start, boundary),
      runStartedAt: startedAt,
    };
    next = withDay(next, nextDate, (d) => ({ ...d, timers: { ...d.timers, [nextId]: continued } }));
    date = nextDate;
    id = nextId;
    timer = continued;
  }
  return next;
}

/** Ticking a task done stops its timer (when the action carries a timestamp). */
function stopIfDone(d: DayRecord, id: string, becomesDone: boolean | undefined, at: number | undefined): DayRecord {
  if (!becomesDone || at == null || d.timers?.[id]?.runningSince == null) return d;
  return { ...d, timers: closeTimer(d.timers, id, at) };
}

function stopAllTimers(state: TrackerState, at: number): TrackerState {
  let next = state;
  for (const [date, day] of Object.entries(state.days)) {
    for (const [id, t] of Object.entries(day.timers ?? {})) {
      if (t.runningSince != null) next = withDay(next, date, (d) => ({ ...d, timers: closeTimer(d.timers, id, at) }));
    }
  }
  return next;
}

/**
 * Reorders a task within the day's single order (shared by both modes) and optionally moves it
 * to a slot (slotId string), the Unplaced tray (null), or keeps its placement (undefined).
 * beforeId: insert before that task; null = after the last task of the target container.
 */
function moveTask(state: TrackerState, date: string, id: string, slotId: string | null | undefined, beforeId: string | null): TrackerState {
  const ids = getDayItems(state, date).items.map((i) => i.id);
  if (!ids.includes(id)) return state;
  const day = state.days[date] ?? emptyDay();
  const placement = { ...day.placement };
  if (slotId === null) delete placement[id];
  else if (slotId !== undefined) placement[id] = slotId;

  const order = ids.filter((x) => x !== id);
  let at = order.length;
  if (beforeId && order.includes(beforeId)) at = order.indexOf(beforeId);
  else if (slotId !== undefined) {
    const valid = new Set(effectiveSlots(state, date).map((sl) => sl.id));
    const inTarget = (x: string) => (slotId === null ? !(placement[x] && valid.has(placement[x])) : placement[x] === slotId);
    const last = order.reduce((acc, x, i) => (inTarget(x) ? i : acc), -1);
    if (last >= 0) at = last + 1;
  }
  order.splice(at, 0, id);
  return withDay(state, date, (d) => ({ ...d, order, placement }));
}

export function reducer(state: TrackerState, action: Action): TrackerState {
  switch (action.type) {
    case 'toggleBlock':
      return withDay(state, action.date, (d) =>
        stopIfDone({ ...d, blocks: { ...d.blocks, [action.id]: !d.blocks[action.id] } }, action.id, !d.blocks[action.id], action.at),
      );
    case 'toggleSunday':
      return withDay(state, action.date, (d) =>
        stopIfDone({ ...d, sundayTasks: { ...d.sundayTasks, [action.id]: !d.sundayTasks[action.id] } }, action.id, !d.sundayTasks[action.id], action.at),
      );
    case 'toggleCustom':
      return withDay(state, action.date, (d) => ({
        ...stopIfDone(d, action.id, !d.customTasks.find((c) => c.id === action.id)?.done, action.at),
        customTasks: d.customTasks.map((c) => (c.id === action.id ? { ...c, done: !c.done } : c)),
      }));
    case 'setCounter':
      return withDay(state, action.date, (d) => ({ ...d, [action.field]: action.value, ...(action.field === 'hours' ? { hoursManual: true } : {}) }));
    case 'editDay': {
      if (action.date > action.today || action.date < toKey(PLAN_START)) return state; // future / pre-plan: locked
      const p = action.patch;
      const clamp = (n: number, max: number, step: number) => Math.min(max, Math.max(0, Math.round((Number(n) || 0) / step) * step));
      const tags = [...new Set(p.topicsCovered.map((t) => t.trim()).filter(Boolean))];
      let next = withDay(state, action.date, (d) => ({
        ...d,
        dsa: clamp(p.dsa, 50, 1),
        apps: clamp(p.apps, 50, 1),
        hoursManual: p.hoursManual,
        hours: p.hoursManual ? clamp(p.hours, 16, 0.25) : 0,
        topicsCovered: tags,
        morning: p.morning,
        night: p.night,
        ...(action.date < action.today ? { editedAt: action.at } : {}),
      }));
      const newTopics = (action.topicIds ?? []).filter((id) => !next.topicsDone[id]);
      if (newTopics.length) {
        next = { ...next, topicsDone: { ...next.topicsDone, ...Object.fromEntries(newTopics.map((id) => [id, action.date])) } };
      }
      return next;
    }
    case 'resetHours':
      return withDay(state, action.date, (d) => ({ ...d, hours: 0, hoursManual: false }));
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
    case 'toggleCarried': {
      const item = state.carried.find((c) => c.id === action.id);
      const next = {
        ...state,
        carried: state.carried.map((c) =>
          c.id === action.id ? (c.done ? { ...c, done: false, completedOn: undefined } : { ...c, done: true, completedOn: action.date }) : c,
        ),
      };
      const running = next.days[action.date]?.timers?.[action.id]?.runningSince != null;
      return item && !item.done && running ? withDay(next, action.date, (d) => stopIfDone(d, action.id, true, action.at)) : next;
    }
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
    case 'setTodayMode':
      return state.settings.todayMode === action.mode ? state : { ...state, settings: { ...state.settings, todayMode: action.mode } };
    case 'moveTask':
      return moveTask(state, action.date, action.id, action.slotId, action.beforeId);
    case 'upsertSlot': {
      const slots = effectiveSlots(state, action.date);
      if (validateSlot(slots, action.slot)) return state; // overlapping or invalid: rejected
      const exists = slots.some((s) => s.id === action.slot.id);
      const next = exists ? slots.map((s) => (s.id === action.slot.id ? action.slot : s)) : [...slots, action.slot];
      return withDay(state, action.date, (d) => ({ ...d, slots: next }));
    }
    case 'deleteSlot': {
      const slots = effectiveSlots(state, action.date).filter((s) => s.id !== action.slotId);
      return withDay(state, action.date, (d) => ({
        ...d,
        slots,
        placement: Object.fromEntries(Object.entries(d.placement).filter(([, sid]) => sid !== action.slotId)),
      }));
    }
    case 'setDayLayout': {
      const slots = sanitizeSlots(action.slots) ?? [];
      return withDay(state, action.date, (d) => ({ ...d, slots, placement: { ...action.placement } }));
    }
    case 'saveDefaultSlots':
      return { ...state, settings: { ...state.settings, defaultSlots: sanitizeSlots(action.slots) ?? [] } };
    case 'timerStart': {
      // One timer at a time, across all days: pause whatever is running first.
      const paused = stopAllTimers(state, action.at);
      return withDay(paused, action.date, (d) => {
        const t = d.timers[action.id] ?? { sessions: [] };
        return { ...d, timers: { ...d.timers, [action.id]: { ...t, runningSince: action.at, runStartedAt: action.at } } };
      });
    }
    case 'focusAdd':
      return withDay(state, action.date, (d) => {
        const t = d.timers[action.id];
        if (!t) return d;
        if (t.runningSince != null) return { ...d, timers: { ...d.timers, [action.id]: { ...t, focusRun: addFocus(t.focusRun, action.delta) } } };
        if (t.sessions.length === 0) return d;
        // Paused just before the flush: add to the session that just closed.
        const sessions = t.sessions.map((x, i) => (i === t.sessions.length - 1 ? { ...x, focus: addFocus(x.focus, action.delta) } : x));
        return { ...d, timers: { ...d.timers, [action.id]: { ...t, sessions } } };
      });
    case 'timerPause':
      return withDay(state, action.date, (d) => ({ ...d, timers: closeTimer(d.timers, action.id, action.at) }));
    case 'timerSetTime':
      return withDay(state, action.date, (d) => {
        const t = d.timers[action.id];
        const running = t?.runningSince != null;
        // The set value replaces everything tracked so far; a running stopwatch keeps going from it.
        const next: TaskTimer = { sessions: [], baseMs: Math.max(0, Math.round(action.ms)) };
        // Focus numbers survive a manual time edit.
        const kept = (t?.sessions ?? []).reduce<SessionFocus | undefined>((acc, x) => (x.focus ? addFocus(acc, x.focus) : acc), t?.focusKept);
        if (kept) next.focusKept = kept;
        if (t?.focusRun) next.focusRun = t.focusRun;
        if (running) {
          next.runningSince = action.at;
          next.runStartedAt = t!.runStartedAt ?? t!.runningSince;
        }
        return { ...d, timers: { ...d.timers, [action.id]: next } };
      });
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
