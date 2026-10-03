import { Eye, EyeOff } from 'lucide-react';
import { useMemo } from 'react';
import { focusPct, sumStats } from '../../lib/focus/classify';
import type { TaskTimer } from '../../state/types';
import { updateFocusSettings, useFocusSettings } from './focusSettings';
import { FOCUS_COLORS, FOCUS_LABELS, setFocusStatus, useFocusStatus } from './focusStatus';
import { focusSupport } from './support';

/**
 * Eye button next to the play button on every unticked row: turns Focus watch on/off (first time:
 * explainer + camera permission). With no stopwatch running it only arms the feature; watching
 * starts when a stopwatch starts.
 */
export function FocusEyeButton() {
  const settings = useFocusSettings();
  const support = useMemo(focusSupport, []);
  if (!support.ok) return null;
  const on = settings.enabled;
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? 'Turn Focus watch off' : 'Turn Focus watch on'}
      title={on ? 'Focus watch is on — it watches while a stopwatch runs' : 'Focus watch (camera, on-device)'}
      onClick={() => {
        if (!settings.explained) setFocusStatus({ explainOpen: true });
        else updateFocusSettings({ enabled: !on });
      }}
      className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center transition-colors ${on ? 'text-primary' : 'text-gray-500 hover:text-primary'}`}
    >
      {on ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
    </button>
  );
}

/** Dot + "Focus 87%" on the running task's row. */
export function FocusLive({ taskId, timer }: { taskId: string; timer: TaskTimer }) {
  const status = useFocusStatus();
  if (status.taskId !== taskId || status.phase === 'off') return null;
  const pct = focusPct(sumStats(timer.focusRun, status.pending));
  const paused = status.phase !== 'watching' && status.phase !== 'calibrating';
  const color = !paused && status.state ? FOCUS_COLORS[status.state] : '#444';
  const label = paused ? 'Focus watch paused' : status.state ? FOCUS_LABELS[status.state] : 'Starting…';
  return (
    <span className="inline-flex items-center gap-1.5 text-gray-400" title={label}>
      <span className="w-2 h-2 rounded-full" style={{ background: color }} aria-hidden />
      <span className="sr-only">{label}</span>
      {pct !== null ? `Focus ${pct}%` : label}
    </span>
  );
}
