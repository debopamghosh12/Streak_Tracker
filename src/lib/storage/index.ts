import { LocalStore } from './localStore';
import { createSupabaseBackend } from './supabaseStore';
import { SyncedStore } from './syncedStore';

/**
 * The app's single storage instance. To move to another backend (e.g. Spring Boot),
 * implement RemoteBackend and swap createSupabaseBackend() here — nothing else changes.
 */
export const storage = new SyncedStore(new LocalStore(), createSupabaseBackend());

export { persistDiff } from './diff';
export type { SyncMode, SyncStatus } from './syncedStore';
export type { TrackerStorage } from './types';
