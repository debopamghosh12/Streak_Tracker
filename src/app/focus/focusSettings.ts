import { useSyncExternalStore } from 'react';
import { browserKV, readJSON, writeJSON } from '../../lib/storage/kv';
import { DEFAULT_FOCUS_SETTINGS, type FocusSettings } from '../../lib/focus/types';

/**
 * Focus watch settings live on this device only (localStorage): the camera, its position and the
 * calibrated head pose differ per device. The measured focus numbers are synced via the day data.
 */
export const FOCUS_SETTINGS_KEY = 'persist-focus-v1';

const clamp = (n: unknown, lo: number, hi: number, fallback: number) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
};

function load(): FocusSettings {
  const raw = readJSON<Partial<FocusSettings>>(browserKV, FOCUS_SETTINGS_KEY) ?? {};
  const c = raw.calibration;
  return {
    enabled: raw.enabled === true,
    explained: raw.explained === true,
    screenOnly: raw.screenOnly === true,
    phoneSec: clamp(raw.phoneSec, 10, 120, DEFAULT_FOCUS_SETTINGS.phoneSec),
    awayMin: clamp(raw.awayMin, 1, 15, DEFAULT_FOCUS_SETTINGS.awayMin),
    autoPause: raw.autoPause === true,
    preview: raw.preview === true,
    pipCamera: raw.pipCamera !== false,
    calibration:
      c && [c.yaw, c.pitch, c.noseRel].every((x) => typeof x === 'number' && Number.isFinite(x)) ? { yaw: c.yaw, pitch: c.pitch, noseRel: c.noseRel } : null,
  };
}

let current: FocusSettings | null = null;
const listeners = new Set<() => void>();

export function getFocusSettings(): FocusSettings {
  return (current ??= load());
}

export function updateFocusSettings(patch: Partial<FocusSettings>) {
  current = { ...getFocusSettings(), ...patch };
  writeJSON(browserKV, FOCUS_SETTINGS_KEY, current);
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

export function useFocusSettings(): FocusSettings {
  return useSyncExternalStore(subscribe, getFocusSettings);
}
