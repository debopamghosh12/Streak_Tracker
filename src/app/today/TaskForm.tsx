import { CalendarDays, Timer } from 'lucide-react';
import { useState } from 'react';
import { SUBJECTS } from '../../data/plan';
import { toKey } from '../../lib/dates';
import type { TaskSubject } from '../../state/types';
import { Expand, MAX_SKIPS, fieldCls, smallBtn } from './shared';

export interface FormValues {
  text: string;
  subject: TaskSubject;
  durationMin?: number;
}

export type FormMode = 'planned' | 'custom' | 'new' | 'carried';

/**
 * Inline edit form. Duration replaces start/end times: in Slots mode the time comes from the slot.
 * Carried items keep their source duration, so they edit text, subject and "Move to" instead.
 */
export function TaskForm({
  mode,
  initial,
  edited = false,
  canApplyWeek = false,
  skipCount = 0,
  onSave,
  onCancel,
  onReset,
  onDelete,
  onMoveTomorrow,
  onSkip,
  onMoveTo,
  trackedMs,
  onSetTime,
}: {
  mode: FormMode;
  initial: FormValues;
  edited?: boolean;
  canApplyWeek?: boolean;
  skipCount?: number;
  onSave: (v: FormValues, applyWeek: boolean) => void;
  onCancel: () => void;
  onReset?: () => void;
  onDelete?: () => void;
  onMoveTomorrow?: () => void;
  onSkip?: (reason: string) => void;
  onMoveTo?: (date: string) => void;
  /** Current tracked time for "Edit time" (omit to hide the section). */
  trackedMs?: number;
  onSetTime?: (ms: number) => void;
}) {
  const [v, setV] = useState<FormValues>(initial);
  const [applyWeek, setApplyWeek] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reason, setReason] = useState('');
  const [moveDate, setMoveDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const skipDisabled = skipCount >= MAX_SKIPS;
  const today = toKey(new Date());
  const showDuration = mode !== 'carried';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.text.trim()) return setError('Task text is required.');
    if (showDuration && (!v.durationMin || v.durationMin < 15 || v.durationMin > 720)) return setError('Duration must be 15–720 minutes.');
    if (mode === 'carried' && moveDate && moveDate !== today) onMoveTo?.(moveDate);
    onSave({ ...v, text: v.text.trim() }, applyWeek);
  };

  return (
    <form onSubmit={submit} className="px-4 pb-4 pt-1 space-y-3">
      <div className={`grid grid-cols-1 gap-2 ${showDuration ? 'sm:grid-cols-[minmax(0,1fr)_9rem_minmax(0,11rem)]' : 'sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)]'}`}>
        <label className="block min-w-0">
          <span className="sr-only">Task text</span>
          <input autoFocus value={v.text} onChange={(e) => setV({ ...v, text: e.target.value })} placeholder="What needs doing?" className={fieldCls} />
        </label>
        {showDuration && (
          <label className="flex items-center gap-2 text-[11px] text-gray-500">
            <input
              type="number"
              min={15}
              max={720}
              step={15}
              value={v.durationMin ?? ''}
              onChange={(e) => setV({ ...v, durationMin: e.target.value === '' ? undefined : Number(e.target.value) })}
              className={`${fieldCls} w-20`}
              aria-label="Duration in minutes"
            />
            min
          </label>
        )}
        <label className="block min-w-0">
          <span className="sr-only">Subject</span>
          <select value={v.subject ?? ''} onChange={(e) => setV({ ...v, subject: (e.target.value || null) as TaskSubject })} className={`${fieldCls} pr-8 truncate`}>
            {SUBJECTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value="">Other</option>
          </select>
        </label>
      </div>

      {mode === 'carried' && (
        <label className="flex items-center gap-2 text-xs text-gray-400">
          <CalendarDays className="w-4 h-4 text-primary/70" /> Move to
          <input type="date" min={today} value={moveDate} onChange={(e) => setMoveDate(e.target.value)} className={`${fieldCls} w-auto`} />
        </label>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {canApplyWeek && (
          <label className="inline-flex items-center gap-2 text-xs text-gray-400 min-h-[40px] cursor-pointer">
            <input type="checkbox" checked={applyWeek} onChange={(e) => setApplyWeek(e.target.checked)} className="w-4 h-4 accent-[#DEDBC8]" />
            Apply to rest of this week
          </label>
        )}
        {mode === 'planned' && edited && onReset && (
          <button type="button" onClick={onReset} className="text-xs text-gray-400 underline underline-offset-4 hover:text-primary min-h-[40px]">
            Reset to plan
          </button>
        )}
      </div>

      {onSetTime && trackedMs !== undefined && <EditTime trackedMs={trackedMs} onSetTime={onSetTime} />}

      {error && <p className="text-xs text-red-400/70">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className={`${smallBtn} bg-primary text-black hover:opacity-90`}>
          {mode === 'new' ? 'Add task' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} className={`${smallBtn} bg-black/50 text-gray-300 hover:text-primary`}>
          Cancel
        </button>
        {mode !== 'new' && (
          <button
            type="button"
            onClick={() => (mode === 'planned' ? setDeleting((d) => !d) : onDelete?.())}
            className={`${smallBtn} ml-auto text-red-400/80 hover:bg-red-400/10`}
          >
            {mode === 'carried' ? 'Drop' : 'Delete'}
          </button>
        )}
      </div>

      <Expand open={deleting}>
        <div className="rounded-xl bg-black/40 p-3 space-y-3">
          <p className="text-xs text-gray-400">Remove this block from today?</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <button type="button" onClick={onMoveTomorrow} className={`${smallBtn} bg-[#2a2a2a] text-primary hover:bg-[#333] sm:flex-1`}>
              Move to tomorrow
            </button>
            <button
              type="button"
              disabled={skipDisabled}
              onClick={() => onSkip?.(reason.trim())}
              className={`${smallBtn} bg-[#2a2a2a] text-primary hover:bg-[#333] sm:flex-1 disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              Skip today
            </button>
          </div>
          {skipDisabled ? (
            <p className="text-[11px] text-amber-300/70">Max 3 skips a day — move it instead</p>
          ) : (
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for skipping (optional)" className={fieldCls} />
          )}
          <p className="text-[11px] text-gray-500">
            Moving keeps it in today's count as unfinished. Skipping removes it from today's streak denominator ({skipCount}/{MAX_SKIPS} used).
          </p>
        </div>
      </Expand>
    </form>
  );
}

/**
 * "Edit time": the only way tracked time is corrected (e.g. a forgotten timer). Nothing is changed
 * automatically. Applies immediately, separately from Save.
 */
function EditTime({ trackedMs, onSetTime }: { trackedMs: number; onSetTime: (ms: number) => void }) {
  const totalMin = Math.floor(trackedMs / 60_000);
  const [hours, setHours] = useState(String(Math.floor(totalMin / 60)));
  const [minutes, setMinutes] = useState(String(totalMin % 60));
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    const h = Number(hours || 0);
    const m = Number(minutes || 0);
    if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return setError('Use 0–23 hours and 0–59 minutes.');
    setError(null);
    onSetTime((h * 60 + m) * 60_000);
  };

  return (
    <fieldset className="rounded-xl bg-black/30 p-3 space-y-2">
      <legend className="sr-only">Edit tracked time</legend>
      <p className="text-xs text-gray-400 inline-flex items-center gap-1.5">
        <Timer className="w-3.5 h-3.5 text-primary/70" /> Edit time
      </p>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
        <input type="number" min={0} max={23} value={hours} onChange={(e) => setHours(e.target.value)} className={`${fieldCls} w-16`} aria-label="Hours" />
        h
        <input type="number" min={0} max={59} value={minutes} onChange={(e) => setMinutes(e.target.value)} className={`${fieldCls} w-16`} aria-label="Minutes" />
        m
        <button type="button" onClick={apply} className={`${smallBtn} bg-[#2a2a2a] text-primary hover:bg-[#333]`}>
          Set time
        </button>
        <button
          type="button"
          onClick={() => {
            setHours('0');
            setMinutes('0');
            setError(null);
            onSetTime(0);
          }}
          className={`${smallBtn} text-gray-400 hover:text-primary`}
        >
          Reset to 0
        </button>
      </div>
      {error && <p className="text-[11px] text-red-400/70">{error}</p>}
    </fieldset>
  );
}
