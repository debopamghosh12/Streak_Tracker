import { CalendarDays, Pause, Play, X } from 'lucide-react';
import { useState } from 'react';
import { format } from 'date-fns';
import { RoundCheck, useToast } from '../../components/ui';
import { fromKey, shortDate } from '../../lib/dates';
import { displayMs, formatMinutes, formatStopwatch, overtimeMs, type DayItem } from '../../lib/dayItems';
import { makeCarried, tomorrowKey } from '../../lib/tasks';
import { useStore } from '../../state/store';
import type { TaskTimer } from '../../state/types';
import { MoveMenu, type MoveOption } from './MoveMenu';
import { TaskForm, type FormValues } from './TaskForm';
import { EditButton, Expand, TEXT, fieldCls, iconBtn, smallBtn, subjectColor } from './shared';
import { useStopwatchNow } from './stopwatchClock';

const chip = 'text-[10px] px-1.5 py-0.5 rounded-full border';

/**
 * One task row, used by Flow and Slots mode alike. The drag handle (if any) is passed in by
 * the sortable wrapper; everything a drag can do is also in the "Move to…" menu.
 */
export function ItemRow({
  item,
  dateKey,
  timer,
  upNext = false,
  handle,
  moveOptions,
  restOfWeek,
  skipCount,
}: {
  item: DayItem;
  dateKey: string;
  timer: TaskTimer | undefined;
  upNext?: boolean;
  handle?: React.ReactNode;
  moveOptions: MoveOption[];
  restOfWeek: string[];
  skipCount: number;
}) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [moveDate, setMoveDate] = useState(() => tomorrowKey(dateKey));

  const carried = item.carried;
  const running = timer?.runningSince != null; // icon and state come straight from saved data
  const hasTime = running || displayMs(timer) > 0;
  const stale = !!carried && carried.moves >= 3 && !carried.done;

  const toggle = () => {
    const at = Date.now();
    if (item.kind === 'block') dispatch({ type: 'toggleBlock', date: dateKey, id: item.id, at });
    else if (item.kind === 'sunday') dispatch({ type: 'toggleSunday', date: dateKey, id: item.id, at });
    else if (item.kind === 'custom') dispatch({ type: 'toggleCustom', date: dateKey, id: item.id, at });
    else dispatch({ type: 'toggleCarried', id: item.id, date: dateKey, at });
  };

  const toggleTimer = () =>
    dispatch(running ? { type: 'timerPause', date: dateKey, id: item.id, at: Date.now() } : { type: 'timerStart', date: dateKey, id: item.id, at: Date.now() });

  const drop = () => {
    if (!carried) return;
    const index = state.carried.findIndex((c) => c.id === carried.id);
    dispatch({ type: 'dropCarried', id: carried.id });
    toast('Dropped', { action: { label: 'Undo', onClick: () => dispatch({ type: 'restoreCarried', item: carried, index }) }, duration: 5000 });
  };
  const moveCarriedTo = (d: string) => {
    if (!carried || !d || d === dateKey) return;
    dispatch({ type: 'moveCarried', id: carried.id, date: d });
    toast(`Moved to ${shortDate(fromKey(d))}`);
  };

  const save = (v: FormValues, applyWeek: boolean) => {
    if (item.kind === 'block' || item.kind === 'sunday') {
      dispatch({
        type: 'setOverride',
        dates: [dateKey, ...(applyWeek ? restOfWeek : [])],
        id: item.id,
        override: { text: v.text, subject: v.subject, durationMin: v.durationMin },
      });
      if (applyWeek && restOfWeek.length) toast(`Applied to ${restOfWeek.length + 1} days`);
    } else if (item.kind === 'custom') {
      dispatch({ type: 'updateCustom', date: dateKey, id: item.id, patch: { text: v.text, subject: v.subject, durationMin: v.durationMin } });
    } else {
      dispatch({ type: 'updateCarried', id: item.id, patch: { text: v.text, subject: v.subject } });
    }
    setEditing(false);
  };

  return (
    <div
      className={`bg-[#212121] rounded-xl border transition-colors ${
        stale ? 'border-amber-300/50' : upNext && !item.moved ? 'border-primary/70' : 'border-transparent'
      }`}
    >
      <div className="flex items-start gap-1.5 sm:gap-2 pl-1.5 pr-3 py-2.5">
        {handle ?? <span className="w-2" />}
        <div className={`flex-1 min-w-0 pt-1.5 ${item.moved ? 'opacity-50' : ''}`}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: subjectColor(item.subject) }} />
            <span className={`text-sm sm:text-base transition-opacity ${item.done ? 'line-through opacity-50' : ''}`} style={TEXT}>
              {item.title}
            </span>
            {upNext && !item.moved && <span className="text-[10px] bg-primary text-black px-1.5 py-0.5 rounded-full">Up next</span>}
            {item.edited && <span className={`${chip} text-gray-400 border-white/10`}>edited</span>}
            {item.kind === 'custom' && <span className={`${chip} text-gray-400 border-white/10`}>added</span>}
            {carried && <span className={`${chip} text-gray-400 border-white/10`}>from {format(fromKey(carried.sourceDate), 'EEE d MMM')}</span>}
            {carried && carried.moves >= 2 && (
              <span className={`${chip} ${stale ? 'text-amber-300/80 border-amber-300/30' : 'text-gray-400 border-white/10'}`}>moved {carried.moves}×</span>
            )}
            {item.moved && <span className={`${chip} text-amber-300/80 border-amber-300/30`}>moved to tomorrow</span>}
          </div>
          {item.text && <p className={`text-xs sm:text-sm text-gray-400 mt-0.5 ${item.done ? 'line-through opacity-50' : ''}`}>{item.text}</p>}

          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`${chip} text-gray-300 border-white/10 tabular-nums`}>{formatMinutes(item.durationMin)}</span>
            {hasTime && timer && <StopwatchReadout timer={timer} targetMs={item.durationMin * 60_000} />}
            <span className="ml-auto flex items-center -my-1">
              {!item.moved && (
                <button
                  type="button"
                  onClick={toggleTimer}
                  disabled={item.done && !running}
                  aria-label={running ? `Pause timer for ${item.title}` : `Start timer for ${item.title}`}
                  className={`${iconBtn} ${running ? 'text-primary' : 'text-gray-500 hover:text-primary'} disabled:opacity-30`}
                >
                  {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
              )}
              {!item.moved && <MoveMenu label={item.title} options={moveOptions} />}
              {!item.moved && <EditButton onClick={() => setEditing((e) => !e)} active={editing} label={`Edit ${item.title}`} />}
            </span>
          </div>
        </div>
        <div className="pt-0.5">
          {item.moved ? (
            <button
              type="button"
              onClick={() => dispatch({ type: 'undoMoveOut', date: dateKey, id: item.id })}
              className="min-h-[40px] px-3 rounded-full text-xs text-gray-400 hover:text-primary hover:bg-black/40"
            >
              Undo
            </button>
          ) : (
            <RoundCheck checked={item.done} onChange={toggle} label={`Mark ${item.title} done`} />
          )}
        </div>
      </div>

      {stale && !editing && (
        <div className="px-4 pb-3 -mt-1 flex flex-wrap items-center gap-2">
          <p className="text-[11px] text-amber-300/70 flex-1 min-w-[180px]">Carried {carried!.moves}× — finish it, reschedule it, or drop it</p>
          <button type="button" onClick={drop} className={`${smallBtn} text-gray-300 bg-black/40 hover:text-primary inline-flex items-center gap-1`}>
            <X className="w-3.5 h-3.5" /> Drop
          </button>
          {picking ? (
            <span className="inline-flex items-center gap-1.5">
              <input type="date" min={tomorrowKey(dateKey)} value={moveDate} onChange={(e) => setMoveDate(e.target.value)} className={`${fieldCls} w-auto`} aria-label="Move to date" />
              <button
                type="button"
                onClick={() => {
                  moveCarriedTo(moveDate);
                  setPicking(false);
                }}
                className={`${smallBtn} bg-primary text-black`}
              >
                Move
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setPicking(true)} className={`${smallBtn} text-gray-300 bg-black/40 hover:text-primary inline-flex items-center gap-1`}>
              <CalendarDays className="w-3.5 h-3.5" /> Move to date…
            </button>
          )}
        </div>
      )}

      <Expand open={editing && !item.moved}>
        <TaskForm
          mode={item.kind === 'carried' ? 'carried' : item.kind === 'custom' ? 'custom' : 'planned'}
          initial={{ text: item.kind === 'block' ? item.text : item.title, subject: item.subject, durationMin: item.durationMin }}
          edited={item.edited}
          canApplyWeek={(item.kind === 'block' || item.kind === 'sunday') && restOfWeek.length > 0}
          skipCount={skipCount}
          onSave={save}
          onCancel={() => setEditing(false)}
          onReset={() => {
            dispatch({ type: 'clearOverride', date: dateKey, id: item.id });
            setEditing(false);
          }}
          onDelete={() => {
            if (item.kind === 'carried') drop();
            else {
              dispatch({ type: 'deleteCustom', date: dateKey, id: item.id });
              toast('Task deleted');
            }
          }}
          onMoveTomorrow={() => {
            if (!item.task) return;
            dispatch({ type: 'moveOut', date: dateKey, id: item.id, item: makeCarried(dateKey, item.task, tomorrowKey(dateKey)) });
            setEditing(false);
            toast('Moved to tomorrow');
          }}
          onSkip={(reason) => {
            dispatch({ type: 'skipTask', date: dateKey, id: item.id, reason });
            setEditing(false);
            toast('Skipped for today');
          }}
          onMoveTo={moveCarriedTo}
          trackedMs={displayMs(timer, Date.now())}
          onSetTime={(ms) => {
            dispatch({ type: 'timerSetTime', date: dateKey, id: item.id, ms, at: Date.now() });
            toast(ms ? `Time set to ${formatStopwatch(ms)}` : 'Time reset to 0');
          }}
        />
      </Expand>
    </div>
  );
}

/**
 * The live stopwatch. Only this small component subscribes to the shared 1-second clock (and only
 * while running), so a running timer re-renders just this readout. Elapsed is computed from the
 * saved timestamps every time, so it's right after a reload, sleep or a background tab.
 */
function StopwatchReadout({ timer, targetMs }: { timer: TaskTimer; targetMs: number }) {
  const running = timer.runningSince != null;
  const tick = useStopwatchNow(running);
  const elapsed = displayMs(timer, running ? Math.max(tick, timer.runningSince!) : undefined);
  const over = overtimeMs(elapsed, targetMs);
  const since = timer.runStartedAt ?? timer.runningSince;

  return (
    <span className="inline-flex items-center gap-2 flex-wrap text-[11px] tabular-nums" aria-live="off">
      <span className={over > 0 ? 'text-amber-300/90' : running ? 'text-primary' : 'text-gray-400'} title={running ? 'Running' : 'Paused'}>
        {formatStopwatch(elapsed)} / {formatStopwatch(targetMs)}
      </span>
      <span className="w-16 sm:w-24 h-1 rounded-full bg-black/60 overflow-hidden" aria-hidden>
        <span
          className={`block h-full rounded-full ${over > 0 ? 'bg-amber-300/80' : 'bg-primary'}`}
          style={{ width: `${Math.min(100, (elapsed / Math.max(1, targetMs)) * 100)}%` }}
        />
      </span>
      {over > 0 && <span className="text-amber-300/80">+{formatStopwatch(over)} over</span>}
      {running && since != null && <span className="text-gray-500">running since {format(since, 'h:mm a')}</span>}
    </span>
  );
}
