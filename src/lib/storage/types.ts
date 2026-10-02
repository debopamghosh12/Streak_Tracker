import type { CarriedItem, DayRecord, ReviewRecord, Slot, TodayMode, TrackerState, UserPhase, UserWeek } from '../../state/types';

/** Synced per-user settings (one row per user). */
export interface SyncedSettings {
  version: 2;
  rolledThrough: string;
  /** Absent in rows written by older app versions: the local value is kept. */
  todayMode?: TodayMode;
  defaultSlots?: Slot[];
}

/**
 * How a carried item is saved:
 * - active: in the list
 * - dropped: user dropped it — removed and tombstoned so rollover never recreates it
 * - removed: taken off the list without a tombstone (e.g. undoing "Move to tomorrow")
 * Remotely both dropped and removed are a soft delete (dropped = true).
 */
export type CarriedStatus = 'active' | 'dropped' | 'removed';

/** The persistence interface the app talks to. Local, remote and synced stores all implement it. */
export interface TrackerStorage {
  load(): TrackerState;
  saveDay(date: string, day: DayRecord): void;
  saveCarried(item: CarriedItem, status?: CarriedStatus): void;
  saveTopicDone(topicId: string, date: string | null): void;
  saveReview(week: string, review: ReviewRecord): void;
  saveSettings(settings: SyncedSettings): void;
  /** User week (deleted = soft delete, synced so other devices remove it too). */
  savePlanWeek(week: UserWeek, deleted?: boolean): void;
  savePlanPhase(phase: UserPhase, deleted?: boolean): void;
  /** Full backup (the JSON the "Export" button downloads). */
  exportAll(): TrackerState;
  /** Replace everything with a backup / reset state. Returns the normalised state. */
  importAll(data: unknown): TrackerState;
}

export type TableName = 'days' | 'carried_items' | 'topics_done' | 'reviews' | 'settings' | 'plan_phases' | 'plan_weeks';
/** Push/pull order. Plan tables go last so core data still syncs if 002_plan_extension.sql hasn't been run yet. */
export const TABLES: TableName[] = ['days', 'carried_items', 'topics_done', 'reviews', 'settings', 'plan_phases', 'plan_weeks'];

/** One synced row, in app terms. Backends map it to their own schema. */
export type SyncRecord =
  | { table: 'days'; key: string; day: DayRecord }
  | { table: 'carried_items'; key: string; item: CarriedItem; dropped: boolean }
  | { table: 'topics_done'; key: string; doneOn: string | null }
  | { table: 'reviews'; key: string; review: ReviewRecord }
  | { table: 'settings'; key: 'settings'; settings: SyncedSettings }
  | { table: 'plan_phases'; key: string; phase: UserPhase; deleted: boolean }
  | { table: 'plan_weeks'; key: string; week: UserWeek; deleted: boolean };

/** A row as stored on the server, with the server's updated_at. */
export type PulledRecord = SyncRecord & { updatedAt: string };

export interface RemoteUser {
  id: string;
  email: string;
}

/**
 * Everything the sync engine needs from a server. Supabase implements it today;
 * a Spring Boot client would implement the same five calls.
 */
export interface RemoteBackend {
  getUser(): Promise<RemoteUser | null>;
  onAuthChange(cb: (user: RemoteUser | null) => void): () => void;
  signIn(email: string, redirectTo: string): Promise<void>;
  signOut(): Promise<void>;
  /** Upsert rows of one table; returns the server updated_at for each key. */
  upsert(table: TableName, records: SyncRecord[]): Promise<{ key: string; updatedAt: string }[]>;
  /** Rows of one table with updated_at > since (all rows when since is null), oldest first. */
  pull(table: TableName, since: string | null): Promise<PulledRecord[]>;
}

/** Minimal key-value storage (window.localStorage in the app, a Map in tests). */
export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
