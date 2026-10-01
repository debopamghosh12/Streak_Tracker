import type { CarriedItem, DayRecord, ReviewRecord, TrackerState } from '../../state/types';
import { browserKV, readJSON, writeJSON } from './kv';
import type { LocalStore } from './localStore';
import { isNewer, maxUpdatedAt, mergePulled } from './merge';
import { Outbox } from './outbox';
import {
  TABLES,
  type CarriedStatus,
  type KV,
  type PulledRecord,
  type RemoteBackend,
  type RemoteUser,
  type SyncRecord,
  type SyncedSettings,
  type TableName,
  type TrackerStorage,
} from './types';

export type SyncMode = 'disabled' | 'signedOut' | 'synced' | 'syncing' | 'offline' | 'error';

export interface SyncStatus {
  mode: SyncMode;
  email: string | null;
  pending: number;
}

export const SYNC_KEY = 'prisma-sync-v1';
export const BACKUP_KEY = 'prisma-backup-before-sync';

interface SyncMeta {
  userId: string | null;
  lastPulledAt: Partial<Record<TableName, string>>;
}

export interface SyncedStoreOptions {
  kv?: KV;
  debounceMs?: number;
  pullIntervalMs?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  /** Rows committed slightly out of order are re-read inside this window (merge is idempotent). */
  pullOverlapMs?: number;
  readyTimeoutMs?: number;
  isOnline?: () => boolean;
  redirectTo?: () => string;
}

const defaultOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

/**
 * Offline-first sync: every save goes to the local store immediately and into a persistent
 * outbox; the outbox is flushed (debounced, batched per table, retried with backoff) while
 * signed in, and server changes are pulled and merged row by row (newer updated_at wins).
 * Without a backend it is a plain local store.
 */
export class SyncedStore implements TrackerStorage {
  private readonly kv: KV;
  private readonly outbox: Outbox;
  private readonly opts: Required<Omit<SyncedStoreOptions, 'kv'>>;
  private user: RemoteUser | null = null;
  private status: SyncStatus;
  private attempt = 0;
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private pullTimer: ReturnType<typeof setInterval> | undefined;
  private flushing: Promise<boolean> | null = null;
  private pulling: Promise<void> | null = null;
  private pendingNotice: string | null = null;
  private authWork: Promise<void> = Promise.resolve();
  private started = false;
  private unsubs: (() => void)[] = [];
  private readonly statusListeners = new Set<() => void>();
  private readonly remoteListeners = new Set<(s: TrackerState) => void>();
  private readonly noticeListeners = new Set<(msg: string) => void>();
  private resolveReady!: () => void;
  private readonly ready: Promise<void>;

  constructor(
    readonly local: LocalStore,
    private readonly backend: RemoteBackend | null,
    options: SyncedStoreOptions = {},
  ) {
    this.kv = options.kv ?? browserKV;
    this.opts = {
      debounceMs: options.debounceMs ?? 1000,
      pullIntervalMs: options.pullIntervalMs ?? 60_000,
      baseBackoffMs: options.baseBackoffMs ?? 1000,
      maxBackoffMs: options.maxBackoffMs ?? 60_000,
      pullOverlapMs: options.pullOverlapMs ?? 10_000,
      readyTimeoutMs: options.readyTimeoutMs ?? 5000,
      isOnline: options.isOnline ?? defaultOnline,
      redirectTo: options.redirectTo ?? (() => `${window.location.origin}/app`),
    };
    this.outbox = new Outbox(this.kv);
    this.status = { mode: backend ? 'signedOut' : 'disabled', email: null, pending: this.outbox.size };
    this.ready = new Promise((r) => (this.resolveReady = r));
    if (!backend) this.resolveReady();
  }

  /* ---------------- TrackerStorage ---------------- */

  load(): TrackerState {
    return this.local.load();
  }

  saveDay(date: string, day: DayRecord) {
    this.queue({ table: 'days', key: date, day }, this.local.saveDay(date, day));
  }

  saveCarried(item: CarriedItem, status: CarriedStatus = 'active') {
    this.queue({ table: 'carried_items', key: item.id, item, dropped: status !== 'active' }, this.local.saveCarried(item, status));
  }

  saveTopicDone(topicId: string, date: string | null) {
    this.queue({ table: 'topics_done', key: topicId, doneOn: date }, this.local.saveTopicDone(topicId, date));
  }

  saveReview(week: string, review: ReviewRecord) {
    this.queue({ table: 'reviews', key: week, review }, this.local.saveReview(week, review));
  }

  saveSettings(settings: SyncedSettings) {
    this.queue({ table: 'settings', key: 'settings', settings }, this.local.saveSettings(settings));
  }

  exportAll(): TrackerState {
    return this.local.exportAll();
  }

  /** Import goes through the outbox like any edit, so it syncs. Nothing is deleted remotely. */
  importAll(data: unknown): TrackerState {
    const state = this.local.importAll(data);
    if (this.backend) {
      for (const r of this.local.records()) this.outbox.enqueue(r, this.local.updatedAt(r.table, r.key) ?? '');
      this.emitStatus();
      this.scheduleFlush();
    }
    return state;
  }

  /* ---------------- subscriptions ---------------- */

  getStatus = (): SyncStatus => this.status;

  subscribeStatus = (cb: () => void) => {
    this.statusListeners.add(cb);
    return () => void this.statusListeners.delete(cb);
  };

  /** Fires with the merged local state after server rows were applied. */
  onRemoteChange(cb: (s: TrackerState) => void) {
    this.remoteListeners.add(cb);
    return () => void this.remoteListeners.delete(cb);
  }

  onNotice(cb: (msg: string) => void) {
    this.noticeListeners.add(cb);
    return () => void this.noticeListeners.delete(cb);
  }

  /** Resolves once the first pull after load finished (or immediately when local-only / signed out). */
  whenReady(): Promise<void> {
    return this.ready;
  }

  /** Resolves when auth handling, pulls and flushes in flight have finished (used by tests). */
  async settled() {
    await this.authWork;
    await this.pulling;
    await this.flushing;
  }

  get enabled() {
    return !!this.backend;
  }

  /* ---------------- lifecycle ---------------- */

  start() {
    if (this.started || !this.backend) return;
    this.started = true;
    const backend = this.backend;

    if (typeof window !== 'undefined') {
      const onOnline = () => {
        void this.pullNow();
        void this.flushNow();
      };
      const onOffline = () => this.setMode('offline');
      const onVisible = () => {
        if (document.visibilityState === 'visible') {
          void this.pullNow();
          void this.flushNow();
        }
      };
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
      document.addEventListener('visibilitychange', onVisible);
      this.unsubs.push(() => {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
        document.removeEventListener('visibilitychange', onVisible);
      });
    }

    const onUser = (u: RemoteUser | null) => {
      this.authWork = this.authWork.then(() => this.handleUser(u));
      return this.authWork;
    };
    this.unsubs.push(backend.onAuthChange((u) => void onUser(u)));
    backend
      .getUser()
      .then(onUser, () => onUser(null));
    setTimeout(() => this.resolveReady(), this.opts.readyTimeoutMs);
  }

  stop() {
    for (const off of this.unsubs) off();
    this.unsubs = [];
    clearTimeout(this.flushTimer);
    clearInterval(this.pullTimer);
    this.pullTimer = undefined;
    this.started = false;
  }

  async signIn(email: string) {
    if (!this.backend) throw new Error('Sync is not configured');
    await this.backend.signIn(email, this.opts.redirectTo());
  }

  async signOut() {
    if (!this.backend) return;
    await this.backend.signOut();
    // Local data stays on this device. Queued writes belong to the old account, so drop them;
    // the next sign-in does a full merge and re-uploads anything newer than the server.
    this.outbox.clear();
    writeJSON(this.kv, SYNC_KEY, { userId: null, lastPulledAt: {} } satisfies SyncMeta);
    this.authWork = this.authWork.then(() => this.handleUser(null));
    await this.authWork;
  }

  /* ---------------- auth ---------------- */

  private async handleUser(u: RemoteUser | null) {
    if (!u) {
      this.user = null;
      clearInterval(this.pullTimer);
      this.pullTimer = undefined;
      clearTimeout(this.flushTimer);
      this.status = { mode: this.backend ? 'signedOut' : 'disabled', email: null, pending: this.outbox.size };
      this.emitStatus();
      this.resolveReady();
      return;
    }
    if (this.user?.id === u.id) return; // same session re-announced
    this.user = u;
    this.status = { ...this.status, email: u.email };
    this.setMode('syncing');
    try {
      await this.reconcile(u);
    } catch {
      this.setMode(this.opts.isOnline() ? 'error' : 'offline');
      this.scheduleFlush();
    } finally {
      this.resolveReady();
    }
    if (!this.pullTimer && this.started) {
      this.pullTimer = setInterval(() => void this.pullNow(), this.opts.pullIntervalMs);
    }
  }

  /**
   * Runs on every sign-in / app load with a session. The first time this user syncs from this
   * device it backs up local data, pulls everything and uploads local rows that are missing on
   * the server or newer than it — nothing is deleted on either side.
   */
  async reconcile(u: RemoteUser) {
    let meta = this.syncMeta();
    const first = meta.userId !== u.id;
    const hadLocal = this.local.hasUserData();
    if (first) {
      writeJSON(this.kv, BACKUP_KEY, this.local.exportAll());
      meta = { userId: u.id, lastPulledAt: {} };
    }

    const pulled = await this.fetchSince(meta);
    const changed = mergePulled(this.local, this.outbox, pulled);

    if (first) {
      const remoteAt = new Map(pulled.map((r) => [`${r.table}|${r.key}`, r.updatedAt]));
      for (const r of this.local.records()) {
        const server = remoteAt.get(`${r.table}|${r.key}`);
        const mine = this.local.updatedAt(r.table, r.key);
        if (server === undefined || isNewer(mine, server)) this.outbox.enqueue(r, mine ?? '');
      }
      if (hadLocal) {
        this.pendingNotice = pulled.length === 0 ? 'Your local data is now synced' : 'This device is merged with your synced data';
      }
    }
    writeJSON(this.kv, SYNC_KEY, meta);
    if (changed) this.emitRemote();
    this.emitStatus();
    await this.flushNow();
  }

  /* ---------------- pull ---------------- */

  pullNow(): Promise<void> {
    if (!this.backend || !this.user || !this.opts.isOnline()) return Promise.resolve();
    if (this.pulling) return this.pulling;
    this.pulling = (async () => {
      try {
        const meta = this.syncMeta();
        const pulled = await this.fetchSince(meta);
        writeJSON(this.kv, SYNC_KEY, meta);
        if (mergePulled(this.local, this.outbox, pulled) > 0) this.emitRemote();
        if (this.status.mode === 'error' && this.outbox.size === 0) this.setMode('synced');
      } catch {
        this.setMode(this.opts.isOnline() ? 'error' : 'offline');
      } finally {
        this.pulling = null;
      }
    })();
    return this.pulling;
  }

  /** Pulls each table since its last pull (minus a small overlap) and advances the cursors in `meta`. */
  private async fetchSince(meta: SyncMeta): Promise<PulledRecord[]> {
    const all: PulledRecord[] = [];
    for (const table of TABLES) {
      const last = meta.lastPulledAt[table];
      const since = last ? new Date(Date.parse(last) - this.opts.pullOverlapMs).toISOString() : null;
      const rows = await this.backend!.pull(table, since);
      const newest = maxUpdatedAt(rows, last);
      if (newest) meta.lastPulledAt[table] = newest;
      all.push(...rows);
    }
    return all;
  }

  /* ---------------- push ---------------- */

  private queue(record: SyncRecord, localAt: string) {
    if (!this.backend) return;
    this.outbox.enqueue(record, localAt);
    this.emitStatus();
    this.scheduleFlush();
  }

  private backoff() {
    return Math.min(this.opts.maxBackoffMs, this.opts.baseBackoffMs * 2 ** Math.max(0, this.attempt - 1));
  }

  private scheduleFlush() {
    if (!this.user) return;
    clearTimeout(this.flushTimer);
    const delay = this.attempt > 0 ? Math.max(this.opts.debounceMs, this.backoff()) : this.opts.debounceMs;
    this.flushTimer = setTimeout(() => void this.flushNow(), delay);
  }

  /** Sends the outbox now. Resolves true when everything queued at the start was acknowledged. */
  flushNow(): Promise<boolean> {
    clearTimeout(this.flushTimer);
    if (!this.backend || !this.user) return Promise.resolve(false);
    if (this.flushing) return this.flushing;
    if (!this.opts.isOnline()) {
      this.setMode('offline');
      return Promise.resolve(false);
    }
    if (this.outbox.size === 0) {
      this.setMode('synced');
      this.emitPendingNotice();
      return Promise.resolve(true);
    }
    const backend = this.backend;
    this.setMode('syncing');
    this.flushing = (async () => {
      try {
        await this.outbox.flush(backend, (entry, serverAt) => {
          const { table, key } = entry.record;
          if ((this.local.updatedAt(table, key) ?? '') === entry.localAt) this.local.setUpdatedAt(table, key, serverAt);
        });
        this.attempt = 0;
        this.setMode(this.outbox.size > 0 ? 'syncing' : 'synced');
        if (this.outbox.size > 0) this.scheduleFlush();
        else this.emitPendingNotice();
        return true;
      } catch {
        this.attempt++;
        this.setMode(this.opts.isOnline() ? 'error' : 'offline');
        this.scheduleFlush();
        return false;
      } finally {
        this.flushing = null;
      }
    })();
    return this.flushing;
  }

  /* ---------------- helpers ---------------- */

  private syncMeta(): SyncMeta {
    const m = readJSON<SyncMeta>(this.kv, SYNC_KEY);
    return { userId: m?.userId ?? null, lastPulledAt: { ...(m?.lastPulledAt ?? {}) } };
  }

  private setMode(mode: SyncMode) {
    if (!this.user && mode !== 'disabled') return; // signed out: status stays "signedOut"
    this.status = { mode, email: this.user?.email ?? null, pending: this.outbox.size };
    this.emitStatus(true);
  }

  private emitStatus(force = false) {
    if (!force) {
      if (this.status.pending === this.outbox.size) return;
      this.status = { ...this.status, pending: this.outbox.size };
    }
    for (const cb of this.statusListeners) cb();
  }

  private emitRemote() {
    const s = this.local.snapshot();
    for (const cb of this.remoteListeners) cb(s);
  }

  private emitPendingNotice() {
    if (!this.pendingNotice) return;
    const msg = this.pendingNotice;
    this.pendingNotice = null;
    for (const cb of this.noticeListeners) cb(msg);
  }
}
