import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { useToast } from '../components/ui';
import { persistDiff, storage, type SyncStatus } from '../lib/storage';
import { reducer, todayKey } from './reducer';
import type { Action, TrackerState } from './types';

export { emptyDay, emptyReview, initialState, sanitize, todayKey } from './reducer';

/**
 * App state lives in a tiny external store. Each dispatch runs the pure reducer, then
 * persists only what changed through the storage layer (local first, then sync).
 */
function createAppStore() {
  let state: TrackerState = storage.load();
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe(cb: () => void) {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    dispatch(action: Action) {
      const next = reducer(state, action);
      if (next === state) return;
      if (action.type === 'import' || action.type === 'reset') {
        state = storage.importAll(next);
      } else {
        const prev = state;
        state = next;
        // 'replace' carries a state the storage layer already holds (a remote merge).
        if (action.type !== 'replace') persistDiff(prev, next, storage);
      }
      for (const cb of listeners) cb();
    },
  };
}

type AppStore = ReturnType<typeof createAppStore>;
let appStore: AppStore | null = null;
const getAppStore = () => (appStore ??= createAppStore());

interface StoreValue {
  state: TrackerState;
  dispatch: (action: Action) => void;
  exportAll: () => TrackerState;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const app = getAppStore();
  const state = useSyncExternalStore(app.subscribe, app.getState);
  const toast = useToast();

  useEffect(() => {
    const rollover = () => app.dispatch({ type: 'rollover', today: todayKey() });
    const offRemote = storage.onRemoteChange((merged) => {
      app.dispatch({ type: 'replace', state: merged });
      rollover(); // another device may not have rolled over yet
    });
    const offNotice = storage.onNotice((msg) => toast(msg, { duration: 4000 }));
    storage.start();

    // Roll unfinished work forward: once the first pull settled (so we roll over synced data),
    // then whenever the tab becomes visible and every minute (catches midnight).
    let cancelled = false;
    let interval: number | undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible') rollover();
    };
    void storage.whenReady().then(() => {
      if (cancelled) return;
      rollover();
      interval = window.setInterval(rollover, 60_000);
      document.addEventListener('visibilitychange', onVisible);
    });

    return () => {
      cancelled = true;
      offRemote();
      offNotice();
      storage.stop();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [app, toast]);

  return <StoreContext.Provider value={{ state, dispatch: app.dispatch, exportAll: () => storage.exportAll() }}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}

/** Sync status + auth actions for the UI. `enabled` is false when Supabase isn't configured. */
export function useSync(): { status: SyncStatus; enabled: boolean; signIn: (email: string) => Promise<void>; signOut: () => Promise<void> } {
  const status = useSyncExternalStore(storage.subscribeStatus, storage.getStatus);
  return {
    status,
    enabled: storage.enabled,
    signIn: (email) => storage.signIn(email),
    signOut: () => storage.signOut(),
  };
}
