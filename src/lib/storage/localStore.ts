import { initialState, sanitize, todayKey } from '../../state/reducer';
import type { CarriedItem, DayRecord, ReviewRecord, TrackerState, UserPhase, UserWeek } from '../../state/types';
import { tombstoneItem } from './diff';
import { browserKV, readJSON, writeJSON } from './kv';
import type { CarriedStatus, KV, SyncRecord, SyncedSettings, TableName, TrackerStorage } from './types';

// Keys keep the app's original name ("prisma-") on purpose: renaming them would orphan
// everyone's saved progress. The brand is now Persist; storage keys are not user-visible.
export const STATE_KEY = 'prisma-tracker-v2';
export const LEGACY_KEY = 'prisma-tracker-v1';
export const META_KEY = 'prisma-meta-v2';

/** Client-side updatedAt (ISO) for every local record, per table. Missing = older than any server row. */
export type Meta = Record<TableName, Record<string, string>>;
const emptyMeta = (): Meta => ({ days: {}, carried_items: {}, topics_done: {}, reviews: {}, settings: {}, plan_phases: {}, plan_weeks: {} });

export const nowIso = () => new Date().toISOString();

/**
 * The localStorage store: one snapshot of the whole state (as before) plus a per-record
 * updatedAt map. Every save writes through immediately.
 */
export class LocalStore implements TrackerStorage {
  private state: TrackerState;
  private meta: Meta = emptyMeta();

  constructor(
    private kv: KV = browserKV,
    private today: () => string = todayKey,
  ) {
    this.state = initialState(this.today());
  }

  load(): TrackerState {
    const today = this.today();
    const current = readJSON<unknown>(this.kv, STATE_KEY);
    const legacy = current ? null : readJSON<unknown>(this.kv, LEGACY_KEY);
    // v1 is migrated on first load and left in place as a backup.
    this.state = current ? sanitize(current, today) : legacy ? sanitize(legacy, today) : initialState(today);
    const meta = readJSON<Partial<Meta>>(this.kv, META_KEY);
    this.meta = { ...emptyMeta(), ...(meta ?? {}) };
    this.persist();
    return this.state;
  }

  snapshot(): TrackerState {
    return this.state;
  }

  updatedAt(table: TableName, key: string): string | undefined {
    return this.meta[table][key];
  }

  /** After a push, adopt the server's timestamp so later pulls of our own write are no-ops. */
  setUpdatedAt(table: TableName, key: string, at: string) {
    this.meta[table][key] = at;
    writeJSON(this.kv, META_KEY, this.meta);
  }

  // ---- TrackerStorage (each returns the updatedAt it stamped) ----

  saveDay(date: string, day: DayRecord, at = nowIso()): string {
    this.state = { ...this.state, days: { ...this.state.days, [date]: day } };
    return this.stamp('days', date, at);
  }

  saveCarried(item: CarriedItem, status: CarriedStatus = 'active', at = nowIso()): string {
    const s = this.state;
    if (status === 'active') {
      const i = s.carried.findIndex((c) => c.id === item.id);
      const carried = i >= 0 ? s.carried.map((c, j) => (j === i ? item : c)) : [...s.carried, item];
      this.state = { ...s, carried, carryDropped: s.carryDropped.filter((x) => x !== item.id) };
    } else {
      const carried = s.carried.filter((c) => c.id !== item.id);
      const carryDropped = status === 'dropped' && !s.carryDropped.includes(item.id) ? [...s.carryDropped, item.id] : s.carryDropped;
      this.state = { ...s, carried, carryDropped };
    }
    return this.stamp('carried_items', item.id, at);
  }

  saveTopicDone(topicId: string, date: string | null, at = nowIso()): string {
    const topicsDone = { ...this.state.topicsDone };
    if (date) topicsDone[topicId] = date;
    else delete topicsDone[topicId];
    this.state = { ...this.state, topicsDone };
    return this.stamp('topics_done', topicId, at);
  }

  saveReview(week: string, review: ReviewRecord, at = nowIso()): string {
    this.state = { ...this.state, reviews: { ...this.state.reviews, [week]: review } };
    return this.stamp('reviews', week, at);
  }

  saveSettings(settings: SyncedSettings, at = nowIso()): string {
    this.state = {
      ...this.state,
      rolledThrough: settings.rolledThrough,
      settings: {
        ...this.state.settings,
        ...(settings.todayMode ? { todayMode: settings.todayMode } : {}),
        ...(settings.defaultSlots ? { defaultSlots: settings.defaultSlots } : {}),
      },
    };
    return this.stamp('settings', 'settings', at);
  }

  savePlanWeek(week: UserWeek, deleted = false, at = nowIso()): string {
    const key = String(week.weekNumber);
    const weeks = { ...this.state.plan.weeks };
    if (deleted) delete weeks[key];
    else weeks[key] = week;
    this.state = { ...this.state, plan: { ...this.state.plan, weeks } };
    return this.stamp('plan_weeks', key, at);
  }

  savePlanPhase(phase: UserPhase, deleted = false, at = nowIso()): string {
    const phases = { ...this.state.plan.phases };
    if (deleted) delete phases[phase.id];
    else phases[phase.id] = phase;
    this.state = { ...this.state, plan: { ...this.state.plan, phases } };
    return this.stamp('plan_phases', phase.id, at);
  }

  exportAll(): TrackerState {
    return this.state;
  }

  importAll(data: unknown): TrackerState {
    this.state = sanitize(data, this.today());
    // Imported records are "edited now" so they win over older server rows.
    const at = nowIso();
    this.meta = emptyMeta();
    for (const r of this.records()) this.meta[r.table][r.key] = at;
    this.persist();
    return this.state;
  }

  // ---- sync helpers ----

  /** Write a server row locally (no outbox), stamped with the server's updated_at. */
  apply(r: SyncRecord, at: string) {
    switch (r.table) {
      case 'days':
        return this.saveDay(r.key, r.day, at);
      case 'carried_items':
        return this.saveCarried(r.item, r.dropped ? 'dropped' : 'active', at);
      case 'topics_done':
        return this.saveTopicDone(r.key, r.doneOn, at);
      case 'reviews':
        return this.saveReview(r.key, r.review, at);
      case 'settings':
        return this.saveSettings(r.settings, at);
      case 'plan_phases':
        return this.savePlanPhase(r.phase, r.deleted, at);
      case 'plan_weeks':
        return this.savePlanWeek(r.week, r.deleted, at);
    }
  }

  /** Every local record as a sync row (used for the first upload and imports). */
  records(): SyncRecord[] {
    const s = this.state;
    const out: SyncRecord[] = [];
    for (const [key, day] of Object.entries(s.days)) out.push({ table: 'days', key, day });
    for (const item of s.carried) out.push({ table: 'carried_items', key: item.id, item, dropped: false });
    const live = new Set(s.carried.map((c) => c.id));
    for (const id of s.carryDropped) {
      if (!live.has(id) && id.includes(':')) out.push({ table: 'carried_items', key: id, item: tombstoneItem(id), dropped: true });
    }
    for (const [key, doneOn] of Object.entries(s.topicsDone)) out.push({ table: 'topics_done', key, doneOn });
    for (const [key, review] of Object.entries(s.reviews)) out.push({ table: 'reviews', key, review });
    out.push({
      table: 'settings',
      key: 'settings',
      settings: { version: 2, rolledThrough: s.rolledThrough, todayMode: s.settings.todayMode, defaultSlots: s.settings.defaultSlots },
    });
    for (const phase of Object.values(s.plan.phases)) out.push({ table: 'plan_phases', key: phase.id, phase, deleted: false });
    for (const week of Object.values(s.plan.weeks)) out.push({ table: 'plan_weeks', key: String(week.weekNumber), week, deleted: false });
    return out;
  }

  hasUserData(): boolean {
    const s = this.state;
    return (
      Object.keys(s.days).length > 0 ||
      s.carried.length > 0 ||
      Object.keys(s.topicsDone).length > 0 ||
      Object.keys(s.reviews).length > 0 ||
      Object.keys(s.plan.weeks).length > 0 ||
      Object.keys(s.plan.phases).length > 0
    );
  }

  private stamp(table: TableName, key: string, at: string): string {
    this.meta[table][key] = at;
    this.persist();
    return at;
  }

  private persist() {
    writeJSON(this.kv, STATE_KEY, this.state);
    writeJSON(this.kv, META_KEY, this.meta);
  }
}
