import type { DayRecord, TaskTimer, TrackerState } from '../../state/types';
import { toKey } from '../dates';
import { focusPct, sumStats } from './classify';
import type { FocusStats } from './types';

/** All focus numbers of one timer: closed sessions, the running session and kept stats. */
export const timerFocus = (t: TaskTimer | undefined): FocusStats => sumStats(t?.focusKept, t?.focusRun, ...(t?.sessions ?? []).map((s) => s.focus));

/** A day's focus summary (null when Focus watch didn't run that day). */
export function dayFocus(day: DayRecord | undefined): (FocusStats & { pct: number }) | null {
  const total = sumStats(...Object.values(day?.timers ?? {}).map(timerFocus));
  const pct = focusPct(total);
  return pct === null ? null : { ...total, pct };
}

export function rangeFocus(state: Pick<TrackerState, 'days'>, dates: Date[]): (FocusStats & { pct: number }) | null {
  const total = sumStats(...dates.map((d) => dayFocus(state.days[toKey(d)]) ?? undefined));
  const pct = focusPct(total);
  return pct === null ? null : { ...total, pct };
}

/** "Focus 87% · 12 min distracted · 2 phone pickups" */
export function focusLine(f: FocusStats & { pct: number }): string {
  const mins = Math.round((f.distracted + f.away) / 60);
  return `Focus ${f.pct}% · ${mins} min distracted · ${f.pickups} phone pickup${f.pickups === 1 ? '' : 's'}`;
}
