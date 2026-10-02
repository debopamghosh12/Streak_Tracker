import {
  DndContext,
  DragOverlay,
  closestCorners,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarClock, Copy, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '../../components/ui';
import { displayTime, toMinutes } from '../../lib/dates';
import {
  effectiveSlots,
  formatMinutes,
  groupBySlot,
  planLayout,
  slotAt,
  slotCapacity,
  validateSlot,
  type DayItem,
} from '../../lib/dayItems';
import { yesterdayKey } from '../../lib/tasks';
import { useStore } from '../../state/store';
import type { DayRecord, Slot } from '../../state/types';
import { ItemRow } from './ItemRow';
import type { MoveOption } from './MoveMenu';
import { SortableItem, useBoardSensors } from './Sortable';
import { TEXT, fieldCls, iconBtn, smallBtn } from './shared';

const TRAY = 'tray';
const containerId = (key: string) => `container:${key}`;

/** Slots mode: the Unplaced tray plus the day's own study slots. */
export function SlotsBoard({
  items,
  day,
  dateKey,
  now,
  isToday,
  reduced,
  restOfWeek,
  skipCount,
}: {
  items: DayItem[];
  day: DayRecord;
  dateKey: string;
  now: number;
  isToday: boolean;
  reduced: boolean;
  restOfWeek: string[];
  skipCount: number;
}) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const sensors = useBoardSensors();
  const slots = effectiveSlots(state, dateKey);
  const { unplaced, bySlot } = groupBySlot(items, slots, day.placement);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [slotForm, setSlotForm] = useState<Slot | 'new' | null>(null);
  const [confirmPlan, setConfirmPlan] = useState(false);

  const minutesNow = new Date(now).getHours() * 60 + new Date(now).getMinutes();
  const nowSlot = isToday ? slotAt(slots, minutesNow) : undefined;
  const layout = planLayout(state, dateKey);
  const yesterdaySlots = effectiveSlots(state, yesterdayKey(dateKey));

  const containerOf = (id: string): string => {
    if (id.startsWith('container:')) return id.slice('container:'.length);
    const sid = day.placement[id];
    return sid && bySlot[sid] ? sid : TRAY;
  };
  const listOf = (key: string) => (key === TRAY ? unplaced : bySlot[key] ?? []);

  const move = (id: string, key: string, beforeId: string | null) =>
    dispatch({ type: 'moveTask', date: dateKey, id, slotId: key === TRAY ? null : key, beforeId });

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const id = String(active.id);
    const from = containerOf(id);
    const overId = String(over.id);
    const to = containerOf(overId);
    if (overId.startsWith('container:')) return move(id, to, null); // dropped on a slot/tray, not on a task: append
    if (from === to) {
      const list = listOf(to).map((i) => i.id);
      const moved = arrayMove(list, list.indexOf(id), list.indexOf(overId));
      const at = moved.indexOf(id);
      if (moved.join() === list.join()) return;
      return move(id, to, moved[at + 1] ?? null);
    }
    move(id, to, overId); // into another container, before the task it was dropped on
  };

  const optionsFor = (item: DayItem): MoveOption[] => {
    const key = containerOf(item.id);
    const list = listOf(key);
    const i = list.findIndex((x) => x.id === item.id);
    return [
      { key: 'up', label: 'Up', icon: 'up', disabled: i <= 0, onSelect: () => move(item.id, key, list[i - 1]?.id ?? null) },
      { key: 'down', label: 'Down', icon: 'down', disabled: i < 0 || i >= list.length - 1, onSelect: () => move(item.id, key, list[i + 2]?.id ?? null) },
      ...slots.map((s) => ({
        key: s.id,
        label: `${s.label ? `${s.label} · ` : ''}${displayTime(s.start)}–${displayTime(s.end)}`,
        icon: 'slot' as const,
        disabled: key === s.id,
        onSelect: () => move(item.id, s.id, null),
      })),
      { key: TRAY, label: 'Unplaced', icon: 'tray', disabled: key === TRAY, onSelect: () => move(item.id, TRAY, null) },
    ];
  };

  const renderList = (list: DayItem[]) => (
    <SortableContext items={list.map((i) => i.id)} strategy={verticalListSortingStrategy}>
      <ul className="space-y-1.5">
        {list.map((item) => (
          <SortableItem key={item.id} id={item.id} label={item.title} reduced={reduced}>
            {(handle) => (
              <ItemRow
                item={item}
                dateKey={dateKey}
                timer={day.timers[item.id]}
                handle={handle}
                moveOptions={optionsFor(item)}
                restOfWeek={restOfWeek}
                skipCount={skipCount}
              />
            )}
          </SortableItem>
        ))}
      </ul>
    </SortableContext>
  );

  const active = activeId ? items.find((i) => i.id === activeId) : undefined;

  return (
    <div className="space-y-3">
      {/* Quick setup */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!layout}
          title={layout ? undefined : 'Sundays have no plan times'}
          onClick={() => {
            if (!layout) return;
            if (slots.length && !confirmPlan) return setConfirmPlan(true);
            dispatch({ type: 'setDayLayout', date: dateKey, slots: layout.slots, placement: layout.placement });
            setConfirmPlan(false);
            toast('Slots set from the plan');
          }}
          className={`${smallBtn} bg-[#212121] text-gray-300 hover:text-primary inline-flex items-center gap-1.5 disabled:opacity-40`}
        >
          <CalendarClock className="w-3.5 h-3.5" /> {confirmPlan ? 'Replace my slots with plan times?' : 'Use plan times'}
        </button>
        <button
          type="button"
          disabled={yesterdaySlots.length === 0}
          onClick={() => {
            const keep = new Set(yesterdaySlots.map((s) => s.id));
            const placement = Object.fromEntries(Object.entries(day.placement).filter(([, sid]) => keep.has(sid)));
            dispatch({ type: 'setDayLayout', date: dateKey, slots: yesterdaySlots, placement });
            toast("Copied yesterday's slots");
          }}
          className={`${smallBtn} bg-[#212121] text-gray-300 hover:text-primary inline-flex items-center gap-1.5 disabled:opacity-40`}
        >
          <Copy className="w-3.5 h-3.5" /> Copy yesterday's slots
        </button>
        <button
          type="button"
          disabled={slots.length === 0}
          onClick={() => {
            dispatch({ type: 'saveDefaultSlots', slots });
            toast('Saved — new days start with these slots');
          }}
          className={`${smallBtn} bg-[#212121] text-gray-300 hover:text-primary inline-flex items-center gap-1.5 disabled:opacity-40`}
        >
          <Save className="w-3.5 h-3.5" /> Save as my default slots
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <Container id={TRAY} count={unplaced.length} title="Unplaced" subtitle={`${unplaced.length} task${unplaced.length === 1 ? '' : 's'}`} empty="Everything is placed.">
          {renderList(unplaced)}
        </Container>

        {slots.map((s) => {
          const list = bySlot[s.id] ?? [];
          const cap = slotCapacity(s, list);
          const isNow = nowSlot?.id === s.id;
          return (
            <Container
              key={s.id}
              id={s.id}
              count={list.length}
              highlight={isNow}
              title={
                <span className="inline-flex items-center gap-2 flex-wrap">
                  {s.label && <span style={TEXT}>{s.label}</span>}
                  <span className="text-gray-400 tabular-nums">
                    {displayTime(s.start)}–{displayTime(s.end)}
                  </span>
                  {isNow && <span className="text-[10px] bg-primary text-black px-1.5 py-0.5 rounded-full">Now</span>}
                </span>
              }
              subtitle={
                cap.over > 0 ? (
                  <span className="text-amber-300/80">{formatMinutes(cap.over)} over</span>
                ) : (
                  `${formatMinutes(cap.used)} of ${formatMinutes(cap.total)} used`
                )
              }
              actions={
                <>
                  <button type="button" aria-label={`Edit slot ${s.label ?? s.start}`} onClick={() => setSlotForm(s)} className={`${iconBtn} text-gray-500 hover:text-primary`}>
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete slot ${s.label ?? s.start}`}
                    onClick={() => {
                      dispatch({ type: 'deleteSlot', date: dateKey, slotId: s.id });
                      toast('Slot deleted — its tasks are Unplaced');
                    }}
                    className={`${iconBtn} text-gray-500 hover:text-red-400/80`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              }
              empty="Drop tasks here, or use “Move to…”."
              form={slotForm && slotForm !== 'new' && slotForm.id === s.id ? <SlotForm slots={slots} initial={s} dateKey={dateKey} onClose={() => setSlotForm(null)} /> : null}
            >
              {renderList(list)}
            </Container>
          );
        })}

        <DragOverlay dropAnimation={reduced ? null : undefined}>
          {active ? (
            <div className="bg-[#2a2a2a] rounded-xl px-4 py-3 shadow-2xl border border-primary/40 text-sm" style={TEXT}>
              {active.title} <span className="text-gray-400 text-xs ml-2">{formatMinutes(active.durationMin)}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <AnimatePresence initial={false}>
        {slotForm === 'new' ? (
          <motion.div key="new-slot" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="bg-[#212121] rounded-xl">
              <SlotForm slots={slots} dateKey={dateKey} onClose={() => setSlotForm(null)} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {slotForm !== 'new' && (
        <button
          type="button"
          onClick={() => setSlotForm('new')}
          className="w-full min-h-[44px] rounded-xl border border-dashed border-white/10 text-sm text-gray-400 hover:text-primary hover:border-primary/30 inline-flex items-center justify-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add slot
        </button>
      )}
    </div>
  );
}

function Container({
  id,
  count,
  title,
  subtitle,
  actions,
  highlight = false,
  empty,
  form,
  children,
}: {
  id: string;
  count: number;
  title: React.ReactNode;
  subtitle: React.ReactNode;
  actions?: React.ReactNode;
  highlight?: boolean;
  empty: string;
  form?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: containerId(id) });
  return (
    <section
      ref={setNodeRef}
      className={`rounded-2xl border p-2 sm:p-3 transition-colors ${
        isOver ? 'border-primary/50 bg-white/[0.02]' : highlight ? 'border-primary/70' : id === TRAY ? 'border-dashed border-white/10' : 'border-white/5'
      }`}
    >
      <header className="flex items-center gap-2 px-1 pb-2 min-h-[40px]">
        <div className="flex-1 min-w-0 text-xs sm:text-sm">
          <div className="truncate">{typeof title === 'string' ? <span style={TEXT}>{title}</span> : title}</div>
          <div className="text-[11px] text-gray-500 tabular-nums">{subtitle}</div>
        </div>
        {actions}
      </header>
      {form}
      {children}
      {count === 0 && <p className="px-2 py-3 text-[11px] text-gray-600">{empty}</p>}
    </section>
  );
}

function SlotForm({ slots, initial, dateKey, onClose }: { slots: Slot[]; initial?: Slot; dateKey: string; onClose: () => void }) {
  const { dispatch } = useStore();
  const [start, setStart] = useState(initial?.start ?? '');
  const [end, setEnd] = useState(initial?.end ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const slot: Slot = { id: initial?.id ?? `s-${Date.now().toString(36)}`, start, end, ...(label.trim() ? { label: label.trim() } : {}) };
    const problem = validateSlot(slots, slot);
    if (problem) return setError(problem);
    dispatch({ type: 'upsertSlot', date: dateKey, slot });
    onClose();
  };
  const length = start && end ? toMinutes(end) - toMinutes(start) : 0;

  return (
    <form onSubmit={submit} className="p-3 space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-[8rem_8rem_minmax(0,1fr)] gap-2">
        <label className="text-[11px] text-gray-500 space-y-1">
          <span>Start</span>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={fieldCls} required autoFocus />
        </label>
        <label className="text-[11px] text-gray-500 space-y-1">
          <span>End</span>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={fieldCls} required />
        </label>
        <label className="text-[11px] text-gray-500 space-y-1 col-span-2 sm:col-span-1">
          <span>Label (optional)</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Morning" className={fieldCls} maxLength={40} />
        </label>
      </div>
      {length > 0 && <p className="text-[11px] text-gray-500">{formatMinutes(length)}</p>}
      {error && <p className="text-xs text-red-400/70">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className={`${smallBtn} bg-primary text-black hover:opacity-90`}>
          {initial ? 'Save slot' : 'Add slot'}
        </button>
        <button type="button" onClick={onClose} className={`${smallBtn} bg-black/50 text-gray-300 hover:text-primary`}>
          Cancel
        </button>
      </div>
    </form>
  );
}
