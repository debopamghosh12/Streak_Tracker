import type { LocalStore } from './localStore';
import type { Outbox } from './outbox';
import type { PulledRecord } from './types';

const ms = (iso?: string | null) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
};

/** True when timestamp a is strictly newer than b (missing = the beginning of time). */
export const isNewer = (a?: string | null, b?: string | null) => ms(a) > ms(b);

/**
 * Applies pulled server rows to the local store, row by row: the newer updated_at wins.
 * A local edit made offline (newer local updatedAt) is kept and stays queued for upload.
 * When the server wins, any queued older local version of that row is discarded.
 * Returns how many rows changed locally.
 */
export function mergePulled(local: LocalStore, outbox: Outbox, pulled: PulledRecord[]): number {
  let changed = 0;
  for (const r of pulled) {
    if (!isNewer(r.updatedAt, local.updatedAt(r.table, r.key))) continue;
    local.apply(r, r.updatedAt);
    outbox.remove(r.table, r.key);
    changed++;
  }
  return changed;
}

/** The newest updated_at in a list (server clock). */
export function maxUpdatedAt(records: { updatedAt: string }[], current?: string): string | undefined {
  let best = current;
  for (const r of records) if (isNewer(r.updatedAt, best)) best = r.updatedAt;
  return best;
}
