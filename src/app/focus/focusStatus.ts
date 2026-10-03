import { useSyncExternalStore } from 'react';
import type { FocusState, FocusStats } from '../../lib/focus/types';
import { emptyStats } from '../../lib/focus/types';
import type { WarningKind } from '../../lib/focus/warnings';

export type FocusPhase =
  | 'off'
  | 'loading' // loading models / opening camera
  | 'calibrating'
  | 'watching'
  | 'paused' // feed stalled or detection stopped: not counting
  | 'denied'
  | 'nocamera'
  | 'error';

/** Live Focus watch status for the UI. Contains no image data. */
export interface FocusStatus {
  phase: FocusPhase;
  /** Smoothed state (null while warming up / paused). */
  state: FocusState | null;
  /** Task currently watched. */
  date: string | null;
  taskId: string | null;
  /** Stats measured but not yet saved (flushed to the day data every 30 s). */
  pending: FocusStats;
  warning: { kind: WarningKind; text: string; count: number } | null;
  breakUntil: number | null;
  message: string | null;
  /** For the optional self-view only; never recorded. */
  stream: MediaStream | null;
  explainOpen: boolean;
  /** The tab title is flashing "Come back — Persist" (RunningTitle steps aside). */
  titleAlert: boolean;
}

const initial: FocusStatus = {
  phase: 'off',
  state: null,
  date: null,
  taskId: null,
  pending: emptyStats(),
  warning: null,
  breakUntil: null,
  message: null,
  stream: null,
  explainOpen: false,
  titleAlert: false,
};

let status: FocusStatus = initial;
const listeners = new Set<() => void>();

export const getFocusStatus = () => status;

export function setFocusStatus(patch: Partial<FocusStatus>) {
  status = { ...status, ...patch };
  for (const l of listeners) l();
}

export function resetFocusStatus(keep: Partial<FocusStatus> = {}) {
  status = { ...initial, explainOpen: status.explainOpen, ...keep };
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

export function useFocusStatus(): FocusStatus {
  return useSyncExternalStore(subscribe, getFocusStatus);
}

export const FOCUS_COLORS: Record<FocusState, string> = {
  focused: '#8FB996',
  lookingAway: '#E8B86D',
  away: '#7a7a7a',
  phone: '#D98C8C',
};

export const FOCUS_LABELS: Record<FocusState, string> = {
  focused: 'Focused',
  lookingAway: 'Looking away',
  away: 'Away',
  phone: 'Phone',
};
