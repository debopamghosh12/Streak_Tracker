import type { KV } from './types';

/** localStorage with every read/write wrapped in try/catch (private mode, quota, blocked storage). */
export const browserKV: KV = {
  getItem(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* storage full or blocked — keep working in memory */
    }
  },
  removeItem(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

export function memoryKV(seed: Record<string, string> = {}): KV & { data: Map<string, string> } {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

export function readJSON<T>(kv: KV, key: string): T | null {
  try {
    const raw = kv.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJSON(kv: KV, key: string, value: unknown) {
  try {
    kv.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
