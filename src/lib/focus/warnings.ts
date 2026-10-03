import { LIMITS, type FocusState } from './types';

export type WarningKind = 'phone' | 'away';

export const WARNING_TEXT: Record<WarningKind, string> = { phone: 'Phone down.', away: 'Still studying?' };

/** Warning engine state. Pure: advance with stepWarnings on every sample. */
export interface WarnState {
  /** When the current phone episode started (smoothed state "phone"). */
  phoneSince: number | null;
  /** When looking away / away started (continuous, either of the two). */
  distractedSince: number | null;
  /** When "away" (no face) started — for the optional auto-pause. */
  awaySince: number | null;
  /** When the current focused stretch started. */
  focusedSince: number | null;
  active: { kind: WarningKind; count: number; lastAt: number } | null;
  /** Warnings issued in this distraction episode (max 5). */
  issued: number;
  lastWarnAt: number | null;
  autoPaused: boolean;
}

export const initialWarnState = (): WarnState => ({
  phoneSince: null,
  distractedSince: null,
  awaySince: null,
  focusedSince: null,
  active: null,
  issued: 0,
  lastWarnAt: null,
  autoPaused: false,
});

export interface WarnInput {
  now: number;
  /** Smoothed state; null while warming up or while the feed is stalled. */
  state: FocusState | null;
  phoneSec: number;
  awayMin: number;
  autoPause: boolean;
  /** Warnings are silenced until this time (Break). */
  breakUntil: number | null;
}

export type WarnEvent = { type: 'warn'; kind: WarningKind; count: number } | { type: 'clear' } | { type: 'autoPause' };

/**
 * Advances the warning engine by one sample.
 * - Phone in view ≥ phoneSec → "Phone down." Looking away / away ≥ awayMin → "Still studying?"
 * - While still distracted, repeat every 2 minutes, at most 5 warnings per episode, then stop.
 * - Focused for 6 s clears the warning and ends the episode.
 * - Break silences warnings (time still counts). Auto-pause only if the setting is on.
 */
export function stepWarnings(ws: WarnState, input: WarnInput): { ws: WarnState; events: WarnEvent[] } {
  const { now, state } = input;
  const events: WarnEvent[] = [];
  const next: WarnState = { ...ws };

  if (state === null) return { ws: next, events }; // unknown: never counts as focused or distracted

  // Episode timers
  next.phoneSince = state === 'phone' ? (ws.phoneSince ?? now) : null;
  const distracted = state === 'lookingAway' || state === 'away';
  next.distractedSince = distracted ? (ws.distractedSince ?? now) : null;
  next.awaySince = state === 'away' ? (ws.awaySince ?? now) : null;
  next.focusedSince = state === 'focused' ? (ws.focusedSince ?? now) : null;

  // Back to focus for 6 s: clear and end the episode.
  if (state === 'focused' && now - next.focusedSince! >= LIMITS.clearMs) {
    if (next.active) events.push({ type: 'clear' });
    next.active = null;
    next.issued = 0;
    next.lastWarnAt = null;
    next.autoPaused = false;
  }

  // Optional auto-pause after 5 minutes away (once per away stretch).
  if (input.autoPause && next.awaySince !== null && now - next.awaySince > LIMITS.autoPauseMs && !next.autoPaused) {
    next.autoPaused = true;
    events.push({ type: 'autoPause' });
  }

  const kind: WarningKind | null =
    next.phoneSince !== null && now - next.phoneSince >= input.phoneSec * 1000
      ? 'phone'
      : next.distractedSince !== null && now - next.distractedSince >= input.awayMin * 60_000
        ? 'away'
        : null;

  const onBreak = input.breakUntil !== null && now < input.breakUntil;
  if (kind && !onBreak && next.issued < LIMITS.maxWarnings) {
    const due = next.lastWarnAt === null || now - next.lastWarnAt >= LIMITS.repeatMs;
    if (due) {
      next.issued += 1;
      next.lastWarnAt = now;
      next.active = { kind, count: next.issued, lastAt: now };
      events.push({ type: 'warn', kind, count: next.issued });
    }
  }
  return { ws: next, events };
}
