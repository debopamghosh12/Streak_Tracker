import { readJSON, writeJSON } from './kv';
import { TABLES, type KV, type RemoteBackend, type SyncRecord, type TableName } from './types';

// Old "prisma-" prefix kept on purpose so queued uploads survive the rename to Persist.
export const OUTBOX_KEY = 'prisma-outbox-v1';

export interface OutboxEntry {
  record: SyncRecord;
  /** Local updatedAt of the version queued. */
  localAt: string;
  /** Bumped on every enqueue, so a flush never clears a newer edit made mid-flight. */
  seq: number;
}

const id = (table: TableName, key: string) => `${table}|${key}`;

/** Pending writes, persisted in localStorage. One entry per row: later edits replace earlier ones. */
export class Outbox {
  private entries: Record<string, OutboxEntry>;
  private seq = 0;

  constructor(private kv: KV) {
    this.entries = readJSON<Record<string, OutboxEntry>>(kv, OUTBOX_KEY) ?? {};
    for (const e of Object.values(this.entries)) this.seq = Math.max(this.seq, e.seq);
  }

  enqueue(record: SyncRecord, localAt: string) {
    this.entries[id(record.table, record.key)] = { record, localAt, seq: ++this.seq };
    this.save();
  }

  remove(table: TableName, key: string) {
    if (delete this.entries[id(table, key)]) this.save();
  }

  has(table: TableName, key: string) {
    return id(table, key) in this.entries;
  }

  get size() {
    return Object.keys(this.entries).length;
  }

  all(): OutboxEntry[] {
    return Object.values(this.entries);
  }

  clear() {
    this.entries = {};
    this.save();
  }

  /**
   * Sends everything queued, one upsert per table. Entries are removed only when the server
   * acknowledged them and they weren't re-queued meanwhile. Throws on the first failed table
   * (already-acknowledged tables stay removed), so the caller can back off and retry.
   */
  async flush(backend: RemoteBackend, onPushed: (entry: OutboxEntry, serverAt: string) => void) {
    const snapshot = this.all();
    for (const table of TABLES) {
      const batch = snapshot.filter((e) => e.record.table === table);
      if (batch.length === 0) continue;
      const acks = await backend.upsert(table, batch.map((e) => e.record));
      const ackAt = new Map(acks.map((a) => [a.key, a.updatedAt]));
      for (const e of batch) {
        const at = ackAt.get(e.record.key);
        if (!at) continue;
        const current = this.entries[id(table, e.record.key)];
        if (current && current.seq === e.seq) delete this.entries[id(table, e.record.key)];
        onPushed(e, at);
      }
      this.save();
    }
  }

  private save() {
    writeJSON(this.kv, OUTBOX_KEY, this.entries);
  }
}
