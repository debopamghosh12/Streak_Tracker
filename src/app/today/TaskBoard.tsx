import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { fromKey, isSunday, planStatus, toKey, weekDays, weekNumberFor } from '../../lib/dates';
import { getDayItems, trackedMs, type DayItem } from '../../lib/dayItems';
import { hoursByTask } from '../../lib/hours';
import { usePrefersReducedMotion } from '../../lib/hooks';
import { emptyDay, useStore } from '../../state/store';
import type { TodayMode } from '../../state/types';
import { ItemRow } from './ItemRow';
import type { MoveOption } from './MoveMenu';
import { SlotsBoard } from './SlotsBoard';
import { SortableItem, useBoardSensors, useTicker } from './Sortable';
import { TaskForm } from './TaskForm';
import { TEXT, subjectColor } from './shared';

/** Today's tasks in Flow (ordered, no clock) or Slots (your own time slots) mode. Same tasks either way. */
export function TaskBoard({ dateKey }: { dateKey: string }) {
  const { state, dispatch } = useStore();
  const reduced = usePrefersReducedMotion();
  const mode = state.settings.todayMode;
  const day = state.days[dateKey] ?? emptyDay();
  // The board itself refreshes every 30 s (summary, "Now" slot); running stopwatches tick on their own.
  const now = useTicker();
  const date = fromKey(dateKey);
  const isToday = toKey(new Date(now)) === dateKey;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { items, skipped } = useMemo(() => getDayItems(state, dateKey), [state.days[dateKey], state.carried, state.plan, dateKey]);
  const skipCount = Object.keys(day.skipped).length;
  const restOfWeek =
    planStatus(date) === 'during'
      ? weekDays(weekNumberFor(date))
          .filter((d) => toKey(d) > dateKey && isSunday(d) === isSunday(date))
          .map(toKey)
      : [];

  // Planned · Done · Left (hours from the same per-task rule as the day's auto hours)
  const perTask = hoursByTask(state, dateKey, now);
  const live = items.filter((i) => !i.moved);
  const plannedMin = live.reduce((s, i) => s + i.durationMin, 0);
  const doneMin = perTask.reduce((s, t) => s + t.countedMs, 0) / 60_000;
  const leftMin = live.filter((i) => !i.done).reduce((s, i) => s + Math.max(0, i.durationMin - trackedMs(day.timers[i.id], now) / 60_000), 0);
  const h = (m: number) => `${Math.round((m / 60) * 10) / 10} h`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ModeToggle mode={mode} onChange={(m) => dispatch({ type: 'setTodayMode', mode: m })} />
        <p className="text-xs text-gray-400 tabular-nums">
          Planned <span style={TEXT}>{h(plannedMin)}</span> · Done <span style={TEXT}>{h(doneMin)}</span> · Left <span style={TEXT}>{h(leftMin)}</span>
        </p>
      </div>

      {mode === 'flow' ? (
        <FlowList items={items} dateKey={dateKey} reduced={reduced} restOfWeek={restOfWeek} skipCount={skipCount} />
      ) : (
        <SlotsBoard items={items} day={day} dateKey={dateKey} now={now} isToday={isToday} reduced={reduced} restOfWeek={restOfWeek} skipCount={skipCount} />
      )}

      {skipped.length > 0 && (
        <ul className="space-y-1">
          {skipped.map(({ task, reason }) => (
            <li key={task.id} className="flex items-center gap-3 px-4 py-1 text-[11px] text-gray-500">
              <span className="w-2 h-2 rounded-full opacity-40" style={{ background: subjectColor(task.subject) }} />
              <span className="flex-1 min-w-0 truncate">
                <span className="line-through">{task.title}</span> · skipped{reason ? ` — ${reason}` : ''}
              </span>
              <button type="button" onClick={() => dispatch({ type: 'unskipTask', date: dateKey, id: task.id })} className="min-h-[40px] px-2 hover:text-primary">
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}

      <AddTask dateKey={dateKey} />
    </div>
  );
}

function ModeToggle({ mode, onChange }: { mode: TodayMode; onChange: (m: TodayMode) => void }) {
  const options: { id: TodayMode; label: string; hint: string }[] = [
    { id: 'flow', label: 'Flow', hint: 'One ordered list, no clock' },
    { id: 'slots', label: 'Slots', hint: 'Your own time slots' },
  ];
  return (
    <div role="radiogroup" aria-label="How to run today" className="relative inline-flex p-1 rounded-full bg-black/50 border border-white/5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={mode === o.id}
          title={o.hint}
          onClick={() => onChange(o.id)}
          className="relative min-h-[36px] px-4 rounded-full text-xs sm:text-sm transition-colors"
          style={{ color: mode === o.id ? '#000' : '#9ca3af' }}
        >
          {mode === o.id && <motion.span layoutId="today-mode-pill" className="absolute inset-0 rounded-full bg-primary" transition={{ type: 'spring', stiffness: 500, damping: 35 }} />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function FlowList({
  items,
  dateKey,
  reduced,
  restOfWeek,
  skipCount,
}: {
  items: DayItem[];
  dateKey: string;
  reduced: boolean;
  restOfWeek: string[];
  skipCount: number;
}) {
  const { state, dispatch } = useStore();
  const sensors = useBoardSensors();
  const timers = state.days[dateKey]?.timers ?? {};
  const ids = items.map((i) => i.id);
  const upNextId = items.find((i) => !i.done && !i.moved)?.id;

  const move = (id: string, beforeId: string | null) => dispatch({ type: 'moveTask', date: dateKey, id, beforeId });
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    move(String(active.id), next[next.indexOf(String(active.id)) + 1] ?? null);
  };
  const optionsFor = (i: number): MoveOption[] => [
    { key: 'up', label: 'Up', icon: 'up', disabled: i === 0, onSelect: () => move(ids[i], ids[i - 1]) },
    { key: 'down', label: 'Down', icon: 'down', disabled: i === ids.length - 1, onSelect: () => move(ids[i], ids[i + 2] ?? null) },
  ];

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <SortableItem key={item.id} id={item.id} label={item.title} reduced={reduced}>
              {(handle) => (
                <ItemRow
                  item={item}
                  dateKey={dateKey}
                  timer={timers[item.id]}
                  upNext={item.id === upNextId}
                  handle={handle}
                  moveOptions={optionsFor(i)}
                  restOfWeek={restOfWeek}
                  skipCount={skipCount}
                />
              )}
            </SortableItem>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function AddTask({ dateKey }: { dateKey: string }) {
  const { dispatch } = useStore();
  const [open, setOpen] = useState(false);
  return open ? (
    <div className="bg-[#212121] rounded-xl pt-3">
      <TaskForm
        mode="new"
        initial={{ text: '', subject: null, durationMin: 30 }}
        onCancel={() => setOpen(false)}
        onSave={(v) => {
          dispatch({
            type: 'addCustom',
            date: dateKey,
            task: { id: `c-${Date.now().toString(36)}`, text: v.text, subject: v.subject, durationMin: v.durationMin, done: false },
          });
          setOpen(false);
        }}
      />
    </div>
  ) : (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="w-full min-h-[44px] rounded-xl border border-dashed border-white/10 text-sm text-gray-400 hover:text-primary hover:border-primary/30 inline-flex items-center justify-center gap-2 transition-colors"
    >
      <Plus className="w-4 h-4" /> Add task
    </button>
  );
}
