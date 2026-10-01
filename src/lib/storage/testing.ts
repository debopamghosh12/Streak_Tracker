/* Test helpers: an in-memory server and a simulated device. Not used by the app. */
import { persistDiff } from './diff';
import { memoryKV } from './kv';
import { LocalStore } from './localStore';
import { carriedUuid } from './supabaseStore';
import { SyncedStore } from './syncedStore';
import { reducer } from '../../state/reducer';
import type { Action, TrackerState } from '../../state/types';
import type { PulledRecord, RemoteBackend, RemoteUser, SyncRecord, TableName } from './types';

export const USER: RemoteUser = { id: '11111111-1111-4111-8111-111111111111', email: 'me@example.com' };

/** A fake server: one row per (table, server id), updated_at from the (mockable) clock. */
export class FakeServer {
  rows = new Map<string, PulledRecord & { serverId: string }>();
  failNext = 0;
  calls: { table: TableName; count: number }[] = [];
  private last = 0;

  private clock() {
    this.last = Math.max(Date.now(), this.last + 1);
    return new Date(this.last).toISOString();
  }

  upsert(userId: string, table: TableName, records: SyncRecord[]) {
    this.calls.push({ table, count: records.length });
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error('network down');
    }
    return records.map((r) => {
      const serverId = r.table === 'carried_items' ? carriedUuid(userId, r.key) : r.key;
      const updatedAt = this.clock();
      this.rows.set(`${table}|${serverId}`, { ...structuredClone(r), updatedAt, serverId } as PulledRecord & { serverId: string });
      return { key: r.key, updatedAt };
    });
  }

  pull(table: TableName, since: string | null): PulledRecord[] {
    return [...this.rows.values()]
      .filter((r) => r.table === table && (!since || Date.parse(r.updatedAt) > Date.parse(since)))
      .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))
      .map((r) => {
        const copy = structuredClone(r) as PulledRecord & { serverId?: string };
        delete copy.serverId;
        return copy;
      });
  }

  count(table: TableName) {
    return [...this.rows.values()].filter((r) => r.table === table).length;
  }

  get(table: TableName, key: string) {
    return [...this.rows.values()].find((r) => r.table === table && r.key === key);
  }
}

export class FakeBackend implements RemoteBackend {
  signedIn = true;
  private listeners = new Set<(u: RemoteUser | null) => void>();
  constructor(
    private server: FakeServer,
    private user: RemoteUser = USER,
  ) {}
  async getUser() {
    return this.signedIn ? this.user : null;
  }
  onAuthChange(cb: (u: RemoteUser | null) => void) {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }
  async signIn() {
    this.signedIn = true;
    for (const cb of this.listeners) cb(this.user);
  }
  async signOut() {
    this.signedIn = false;
  }
  async upsert(table: TableName, records: SyncRecord[]) {
    return this.server.upsert(this.user.id, table, records);
  }
  async pull(table: TableName, since: string | null) {
    return this.server.pull(table, since);
  }
}

/** One browser: its own localStorage, local store, sync engine and app dispatch (as the provider does it). */
export function makeDevice(server: FakeServer, today: string, opts: { signedIn?: boolean; seed?: Record<string, string> } = {}) {
  const kv = memoryKV(opts.seed);
  let online = true;
  const backend = new FakeBackend(server);
  backend.signedIn = opts.signedIn ?? true;
  const local = new LocalStore(kv, () => today);
  const store = new SyncedStore(local, backend, { kv, isOnline: () => online, redirectTo: () => 'http://localhost/app', readyTimeoutMs: 60_000 });
  let state: TrackerState = store.load();
  const notices: string[] = [];
  store.onRemoteChange((s) => (state = s));
  store.onNotice((m) => notices.push(m));

  return {
    kv,
    local,
    store,
    backend,
    notices,
    get state() {
      return state;
    },
    setOnline(v: boolean) {
      online = v;
    },
    dispatch(action: Action) {
      const next = reducer(state, action);
      if (next === state) return;
      if (action.type === 'import' || action.type === 'reset') state = store.importAll(next);
      else {
        persistDiff(state, next, store);
        state = next;
      }
    },
    async start() {
      store.start();
      await store.whenReady();
    },
  };
}
