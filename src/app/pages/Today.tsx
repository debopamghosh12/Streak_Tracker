import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, Check, Copy, Minus, Pencil, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { PageTitle } from '../../components/PageTitle';
import { Card, ProgressRing, RoundCheck, SectionLabel, SubjectDot, listItem, useToast } from '../../components/ui';
import { DAILY_COUNTERS, SUBJECTS, SUBJECT_BY_ID, TIMETABLE, type CounterField } from '../../data/plan';
import { displayTime, fromKey, isSunday, planStatus, shortDate, toKey, toMinutes, weekDays, weekNumberFor } from '../../lib/dates';
import { getWeek, type EffectiveTopic, type EffectiveWeek } from '../../lib/planModel';
import { Link } from 'react-router-dom';
import { copyText, useNow } from '../../lib/hooks';
import { currentStreak, dayStats } from '../../lib/streak';
import { getDayTasks, makeCarried, tomorrowKey, type DayTask, type DayTasks } from '../../lib/tasks';
import { emptyDay, useStore } from '../../state/store';
import type { CarriedItem, DayRecord, TaskSubject } from '../../state/types';

const TEXT = { color: '#E1E0CC' };
const MAX_SKIPS = 3;

const subjectLabel = (s: TaskSubject) => (s ? SUBJECT_BY_ID[s].short : 'Other');
const subjectColor = (s: TaskSubject) => (s ? SUBJECT_BY_ID[s].color : '#555');
const timeRange = (start?: string, end?: string) =>
  start && end ? `${displayTime(start)}–${displayTime(end)}` : start ? displayTime(start) : '';
const describe = (v: { text: string; start?: string; end?: string; subject: TaskSubject }) =>
  `"${v.text}"${timeRange(v.start, v.end) ? ` ${timeRange(v.start, v.end)}` : ''} (${subjectLabel(v.subject)})`;

export default function Today() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const now = useNow();
  const key = toKey(now);
  const day: DayRecord = state.days[key] ?? emptyDay();
  const week = getWeek(state.plan, weekNumberFor(now));
  const sunday = isSunday(now);
  const stats = dayStats(day, now);
  const status = planStatus(now);
  const streak = currentStreak(state, now);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tasks = useMemo(() => getDayTasks(day, now, state.plan), [day, key, state.plan]);
  const carriedToday = state.carried.filter((c) => c.currentDate === key);
  const cleared = carriedToday.filter((c) => c.done);
  const pending = carriedToday.filter((c) => !c.done);

  const copy = async (text: string) => {
    toast((await copyText(text)) ? 'Copied' : 'Copy failed');
  };

  const dateLabel = format(now, 'EEE d MMM');

  const morningText = () => {
    const lines = tasks.active
      .filter((t) => !tasks.movedOut.has(t.id))
      .map((t) => {
        const time = timeRange(t.start, t.end);
        return `- ${time ? `${time} ` : ''}${t.title}${t.text ? `: ${t.text}` : ''}`;
      });
    const carried = pending.length ? `\nCarried over (${pending.length}):\n${pending.map((c) => `- ${c.text} (from ${shortDate(fromKey(c.sourceDate))})`).join('\n')}` : '';
    const notes = day.morning.trim() ? `\nNotes: ${day.morning.trim()}` : '';
    return `Plan for ${dateLabel} (Week ${week.n}):\n${lines.join('\n')}${carried}${notes}`;
  };

  const nightText = () => {
    const done = tasks.active.filter((t) => t.done).map((t) => t.title);
    const edited = tasks.active.filter((t) => t.edited && t.base);
    const moved = tasks.active.filter((t) => tasks.movedOut.has(t.id));
    const parts = [
      `Done on ${dateLabel} (Week ${week.n}): ${done.length ? done.join(', ') : 'nothing checked yet'} (${stats.done}/${stats.total}, ${stats.pct}%)`,
      `DSA problems: ${day.dsa} · Applications: ${day.apps} · Hours: ${day.hours}`,
      `Topics covered: ${day.topicsCovered.length ? day.topicsCovered.join('; ') : '—'}`,
    ];
    if (edited.length) {
      parts.push(
        `Edited tasks:\n${edited
          .map((t) => `- ${t.title}: ${describe(t.base!)} → ${describe({ text: t.kind === 'block' ? t.text : t.title, start: t.start, end: t.end, subject: t.subject })}`)
          .join('\n')}`,
      );
    }
    if (tasks.skipped.length) {
      parts.push(`Skipped: ${tasks.skipped.map(({ task, reason }) => `${task.title}${reason ? ` (${reason})` : ''}`).join('; ')}`);
    }
    if (moved.length) parts.push(`Moved to tomorrow: ${moved.map((t) => t.title).join('; ')}`);
    parts.push(`Carried items cleared (${cleared.length}): ${cleared.length ? cleared.map((c) => c.text).join('; ') : '—'}`);
    parts.push(`Carried items still pending (${pending.length}): ${pending.length ? pending.map((c) => `${c.text} [moved ${c.moves}×]`).join('; ') : '—'}`);
    parts.push(`Current streak: ${streak} day${streak === 1 ? '' : 's'} · Today ${stats.counts ? 'counts' : `not yet (${stats.needed} more)`}`);
    if (day.night.trim()) parts.push(`Notes: ${day.night.trim()}`);
    return parts.join('\n');
  };

  return (
    <div>
      <PageTitle first="Today," second="one block at a time." />

      {status === 'before' && (
        <Card className="mb-4 text-sm text-gray-400">
          The plan <span className="text-primary">starts Fri 2 Oct</span>. You're seeing Week 1 so you can warm up. Anything you tick
          today is saved, but the streak heatmap begins on day one.
        </Card>
      )}

      <div className="space-y-4">
        <CarriedOver items={carriedToday} today={key} />

        <Card>
          <SectionLabel
            right={
              <span className="text-xs text-gray-500 inline-flex items-center gap-3">
                {!sunday && !week.allSet && (
                  <Link to="/app/syllabus" className="text-primary underline underline-offset-4 hover:opacity-80 min-h-[40px] -my-3 inline-flex items-center">
                    Set topics
                  </Link>
                )}
                {sunday ? 'Sunday · 5 hrs' : `Week ${week.n} · Mon–Sat`}
              </span>
            }
          >
            {sunday ? 'Sunday checkpoint' : 'Timetable'}
          </SectionLabel>
          <DayList dateKey={key} date={now} day={day} tasks={tasks} sunday={sunday} now={now} />
        </Card>

        <Card>
          <SectionLabel>Today's numbers</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {DAILY_COUNTERS.map((c) => (
              <Counter
                key={c.field}
                label={c.label}
                hint={c.target}
                value={day[c.field]}
                step={c.step}
                max={c.max}
                onChange={(v) => dispatch({ type: 'setCounter', date: key, field: c.field as CounterField, value: v })}
              />
            ))}
          </div>
        </Card>

        <TopicsCovered day={day} week={week} dateKey={key} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CheckIn
            title="Morning plan"
            placeholder="What will today look like? Anything to move around?"
            value={day.morning}
            onChange={(v) => dispatch({ type: 'setText', date: key, field: 'morning', value: v })}
            onCopy={() => copy(morningText())}
          />
          <CheckIn
            title="Night check-in"
            placeholder="What got done, what didn't, and why?"
            value={day.night}
            onChange={(v) => dispatch({ type: 'setText', date: key, field: 'night', value: v })}
            onCopy={() => copy(nightText())}
          />
        </div>

        <Card className="flex items-center gap-4 sm:gap-6">
          <div className="flex flex-col items-center gap-1.5 shrink-0">
            <ProgressRing pct={stats.total ? (stats.done / stats.total) * 100 : 0} size={72}>
              {stats.done}/{stats.total}
            </ProgressRing>
            {carriedToday.length > 0 && (
              <span className="text-[10px] text-gray-500 tabular-nums whitespace-nowrap">
                Carried: {cleared.length} / {carriedToday.length} cleared
              </span>
            )}
          </div>
          <div>
            <p className="text-[10px] sm:text-xs uppercase tracking-[0.18em] text-gray-500 mb-1">Mark day</p>
            <AnimatePresence mode="wait">
              <motion.p
                key={stats.counts ? 'yes' : `no-${stats.needed}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="text-xl sm:text-2xl"
                style={TEXT}
              >
                {stats.counts ? (
                  <span className="inline-flex items-center gap-2">
                    Counts for streak <Check className="w-5 h-5 text-primary" />
                  </span>
                ) : (
                  <>
                    Not yet — <span className="italic font-serif">{stats.needed} more {sunday ? 'task' : 'block'}{stats.needed === 1 ? '' : 's'}</span>
                  </>
                )}
              </motion.p>
            </AnimatePresence>
            <p className="text-xs text-gray-500 mt-1">
              {sunday
                ? 'Sunday counts at 3 of 5 tasks.'
                : stats.dsaDone
                  ? 'A day counts at 70% of blocks with at least one DSA block.'
                  : 'Needs 70% of blocks and at least one DSA block.'}
              {' '}Carried items don't count toward today.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ---------------- Shared bits ---------------- */

function EditButton({ onClick, active, label }: { onClick: () => void; active: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={active}
      className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center transition-colors hover:text-primary ${
        active ? 'text-primary' : 'text-gray-500'
      }`}
    >
      <Pencil className="w-4 h-4" />
    </button>
  );
}

function Expand({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const fieldCls =
  'w-full min-h-[40px] bg-black/50 rounded-lg px-3 text-sm placeholder:text-gray-500 outline-none focus:ring-1 focus:ring-primary/40 [color-scheme:dark]';
const smallBtn = 'min-h-[40px] px-4 rounded-full text-xs transition-colors';

/* ---------------- Edit form ---------------- */

interface FormValues {
  text: string;
  start?: string;
  end?: string;
  subject: TaskSubject;
}

type FormMode = 'planned' | 'custom' | 'new' | 'carried';

function TaskForm({
  mode,
  initial,
  showTimes = true,
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
}: {
  mode: FormMode;
  initial: FormValues;
  showTimes?: boolean;
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
}) {
  const [v, setV] = useState<FormValues>(initial);
  const [applyWeek, setApplyWeek] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reason, setReason] = useState('');
  const [moveDate, setMoveDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const skipDisabled = skipCount >= MAX_SKIPS;
  const today = toKey(new Date());

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.text.trim()) return setError('Task text is required.');
    if (v.start && v.end && v.end <= v.start) return setError('End time must be after the start.');
    if (mode === 'carried' && moveDate && moveDate !== today) onMoveTo?.(moveDate);
    onSave({ ...v, text: v.text.trim(), start: v.start || undefined, end: v.end || undefined }, applyWeek);
  };

  return (
    <form onSubmit={submit} className="px-4 pb-4 pt-1 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_auto_minmax(0,11rem)] gap-2">
        <label className="block min-w-0">
          <span className="sr-only">Task text</span>
          <input
            autoFocus
            value={v.text}
            onChange={(e) => setV({ ...v, text: e.target.value })}
            placeholder="What needs doing?"
            className={fieldCls}
          />
        </label>
        {showTimes && (
          <>
            <label className="flex items-center gap-2 text-[11px] text-gray-500">
              <span className="sm:sr-only w-10">Start</span>
              <input type="time" value={v.start ?? ''} onChange={(e) => setV({ ...v, start: e.target.value })} className={`${fieldCls} sm:w-[7.5rem]`} aria-label="Start time" />
            </label>
            <label className="flex items-center gap-2 text-[11px] text-gray-500">
              <span className="sm:sr-only w-10">End</span>
              <input type="time" value={v.end ?? ''} onChange={(e) => setV({ ...v, end: e.target.value })} className={`${fieldCls} sm:w-[7.5rem]`} aria-label="End time" />
            </label>
          </>
        )}
        <label className="block min-w-0">
          <span className="sr-only">Subject</span>
          <select
            value={v.subject ?? ''}
            onChange={(e) => setV({ ...v, subject: (e.target.value || null) as TaskSubject })}
            className={`${fieldCls} pr-8 truncate`}
          >
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

/* ---------------- Day list (timetable / Sunday) ---------------- */

type ListRow = { kind: 'task'; task: DayTask } | { kind: 'break'; id: string; start: string; end: string };

function DayList({ dateKey, date, day, tasks, sunday, now }: { dateKey: string; date: Date; day: DayRecord; tasks: DayTasks; sunday: boolean; now: Date }) {
  const { dispatch } = useStore();
  const [editing, setEditing] = useState<string | null>(null);
  const mins = now.getHours() * 60 + now.getMinutes();
  const skipCount = Object.keys(day.skipped).length;

  // Remaining days of this plan week of the same kind (Mon–Sat blocks / Sunday tasks).
  const restOfWeek =
    planStatus(date) === 'during'
      ? weekDays(weekNumberFor(date))
          .filter((d) => toKey(d) > dateKey && isSunday(d) === sunday)
          .map(toKey)
      : [];

  const rows: ListRow[] = tasks.active.map((task) => ({ kind: 'task' as const, task }));
  if (!sunday) for (const r of TIMETABLE) if (r.kind === 'break') rows.push({ kind: 'break', id: r.id, start: r.start, end: r.end });
  const startOf = (r: ListRow) => (r.kind === 'break' ? r.start : r.task.start);
  // Timed rows in time order (follows edits), untimed custom tasks at the end. Sort is stable.
  rows.sort((a, b) => {
    const sa = startOf(a);
    const sb = startOf(b);
    if (!sa || !sb) return sa ? -1 : sb ? 1 : 0;
    return toMinutes(sa) - toMinutes(sb);
  });

  return (
    <>
      <ul className="space-y-1.5">
        {rows.map((row, i) => {
          if (row.kind === 'break') {
            const live = mins >= toMinutes(row.start) && mins < toMinutes(row.end);
            return (
              <motion.li key={row.id} layout custom={i} variants={listItem} initial="hidden" animate="show" className="flex items-center gap-3 px-4 py-1.5">
                <span className="text-[11px] text-gray-500 tabular-nums w-24 shrink-0">{timeRange(row.start, row.end)}</span>
                <span className={`h-px flex-1 ${live ? 'bg-primary/40' : 'bg-[#262626]'}`} />
                <span className={`text-[11px] ${live ? 'text-primary' : 'text-gray-600'}`}>{live ? 'Break · now' : 'Break'}</span>
              </motion.li>
            );
          }
          const t = row.task;
          const live = !!t.start && !!t.end && mins >= toMinutes(t.start) && mins < toMinutes(t.end);
          return (
            <TaskRow
              key={t.id}
              i={i}
              task={t}
              dateKey={dateKey}
              live={live}
              moved={tasks.movedOut.has(t.id)}
              editing={editing === t.id}
              setEditing={(on) => setEditing(on ? t.id : null)}
              restOfWeek={restOfWeek}
              skipCount={skipCount}
            />
          );
        })}
      </ul>

      {tasks.skipped.length > 0 && (
        <ul className="mt-2 space-y-1">
          {tasks.skipped.map(({ task, reason }) => (
            <li key={task.id} className="flex items-center gap-3 px-4 py-1 text-[11px] text-gray-500">
              <SubjectDot color={subjectColor(task.subject)} className="opacity-40" />
              <span className="flex-1 min-w-0 truncate">
                <span className="line-through">{task.title}</span> · skipped{reason ? ` — ${reason}` : ''}
              </span>
              <button
                type="button"
                onClick={() => dispatch({ type: 'unskipTask', date: dateKey, id: task.id })}
                className="min-h-[40px] px-2 hover:text-primary"
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2">
        {editing === 'new' ? (
          <div className="bg-[#212121] rounded-xl pt-3">
            <TaskForm
              mode="new"
              initial={{ text: '', subject: null }}
              onCancel={() => setEditing(null)}
              onSave={(v) => {
                dispatch({
                  type: 'addCustom',
                  date: dateKey,
                  task: { id: `c-${Date.now().toString(36)}`, text: v.text, start: v.start, end: v.end, subject: v.subject, done: false },
                });
                setEditing(null);
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="w-full min-h-[44px] rounded-xl border border-dashed border-white/10 text-sm text-gray-400 hover:text-primary hover:border-primary/30 inline-flex items-center justify-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add task
          </button>
        )}
      </div>
    </>
  );
}

function TaskRow({
  task,
  i,
  dateKey,
  live,
  moved,
  editing,
  setEditing,
  restOfWeek,
  skipCount,
}: {
  task: DayTask;
  i: number;
  dateKey: string;
  live: boolean;
  moved: boolean;
  editing: boolean;
  setEditing: (on: boolean) => void;
  restOfWeek: string[];
  skipCount: number;
}) {
  const { dispatch } = useStore();
  const toast = useToast();
  const planned = task.kind !== 'custom';
  const time = timeRange(task.start, task.end);

  const toggle = () =>
    dispatch(
      task.kind === 'block'
        ? { type: 'toggleBlock', date: dateKey, id: task.id }
        : task.kind === 'sunday'
          ? { type: 'toggleSunday', date: dateKey, id: task.id }
          : { type: 'toggleCustom', date: dateKey, id: task.id },
    );

  const save = (v: FormValues, applyWeek: boolean) => {
    if (planned) {
      dispatch({ type: 'setOverride', dates: [dateKey, ...(applyWeek ? restOfWeek : [])], id: task.id, override: v });
      if (applyWeek && restOfWeek.length) toast(`Applied to ${restOfWeek.length + 1} days`);
    } else {
      dispatch({ type: 'updateCustom', date: dateKey, id: task.id, patch: v });
    }
    setEditing(false);
  };

  return (
    <motion.li
      layout
      custom={i}
      variants={listItem}
      initial="hidden"
      animate="show"
      className={`bg-[#212121] rounded-xl border transition-colors ${live && !moved ? 'border-primary/70' : 'border-transparent'}`}
    >
      <div className="px-4 py-3 flex items-center gap-2 sm:gap-3">
        <div className={`flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 ${moved ? 'opacity-50' : ''}`}>
          <span className="text-xs text-gray-500 tabular-nums sm:w-24 shrink-0 flex items-center gap-2">
            {time || '—'}
            {live && !moved && <span className="sm:hidden text-[10px] bg-primary text-black px-1.5 py-0.5 rounded-full">Now</span>}
          </span>
          <div className={`min-w-0 transition-opacity duration-300 ${task.done ? 'opacity-50' : ''}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <SubjectDot color={subjectColor(task.subject)} />
              <span className={`text-sm sm:text-base ${task.done ? 'line-through' : ''}`} style={TEXT}>
                {task.title}
              </span>
              {live && !moved && <span className="hidden sm:inline text-[10px] bg-primary text-black px-1.5 py-0.5 rounded-full">Now</span>}
              {task.edited && <span className="text-[10px] text-gray-400 border border-white/10 px-1.5 py-0.5 rounded-full">edited</span>}
              {task.kind === 'custom' && <span className="text-[10px] text-gray-400 border border-white/10 px-1.5 py-0.5 rounded-full">added</span>}
              {moved && <span className="text-[10px] text-amber-300/80 border border-amber-300/30 px-1.5 py-0.5 rounded-full">moved to tomorrow</span>}
            </div>
            {task.text && <p className={`text-xs sm:text-sm text-gray-400 mt-0.5 ${task.done ? 'line-through' : ''}`}>{task.text}</p>}
          </div>
        </div>
        {moved ? (
          <button
            type="button"
            onClick={() => dispatch({ type: 'undoMoveOut', date: dateKey, id: task.id })}
            className="min-h-[40px] px-3 rounded-full text-xs text-gray-400 hover:text-primary hover:bg-black/40"
          >
            Undo
          </button>
        ) : (
          <>
            <EditButton onClick={() => setEditing(!editing)} active={editing} label={`Edit ${task.title}`} />
            <RoundCheck checked={task.done} onChange={toggle} label={`Mark ${task.title} done`} />
          </>
        )}
      </div>
      <Expand open={editing && !moved}>
        <TaskForm
          mode={planned ? 'planned' : 'custom'}
          initial={{ text: task.kind === 'block' ? task.text : task.title, start: task.start, end: task.end, subject: task.subject }}
          edited={task.edited}
          canApplyWeek={planned && restOfWeek.length > 0}
          skipCount={skipCount}
          onSave={save}
          onCancel={() => setEditing(false)}
          onReset={() => {
            dispatch({ type: 'clearOverride', date: dateKey, id: task.id });
            setEditing(false);
          }}
          onDelete={() => {
            dispatch({ type: 'deleteCustom', date: dateKey, id: task.id });
            toast('Task deleted');
          }}
          onMoveTomorrow={() => {
            dispatch({ type: 'moveOut', date: dateKey, id: task.id, item: makeCarried(dateKey, task, tomorrowKey(dateKey)) });
            setEditing(false);
            toast('Moved to tomorrow');
          }}
          onSkip={(reason) => {
            dispatch({ type: 'skipTask', date: dateKey, id: task.id, reason });
            setEditing(false);
            toast('Skipped for today');
          }}
        />
      </Expand>
    </motion.li>
  );
}

/* ---------------- Carried over ---------------- */

function CarriedOver({ items, today }: { items: CarriedItem[]; today: string }) {
  return (
    <Card>
      <SectionLabel right={<span className="text-xs text-gray-500">{items.filter((c) => !c.done).length} pending</span>}>Carried over</SectionLabel>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">Nothing carried over. Clean slate.</p>
      ) : (
        <ul className="space-y-1.5">
          <AnimatePresence initial={false}>
            {items.map((c, i) => (
              <CarriedRow key={c.id} item={c} i={i} today={today} />
            ))}
          </AnimatePresence>
        </ul>
      )}
      <p className="text-[11px] text-gray-500 mt-3">
        Unfinished tasks roll forward at midnight. Fall behind? Cut, don't stack — drop AI or aptitude first, never both DSA blocks.
      </p>
    </Card>
  );
}

function CarriedRow({ item, i, today }: { item: CarriedItem; i: number; today: string }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [date, setDate] = useState(() => tomorrowKey(today));
  const stale = item.moves >= 3 && !item.done;

  const drop = () => {
    const index = state.carried.findIndex((c) => c.id === item.id);
    dispatch({ type: 'dropCarried', id: item.id });
    toast('Dropped', { action: { label: 'Undo', onClick: () => dispatch({ type: 'restoreCarried', item, index }) }, duration: 5000 });
  };
  const moveTo = (d: string) => {
    if (!d || d === today) return;
    dispatch({ type: 'moveCarried', id: item.id, date: d });
    toast(`Moved to ${shortDate(fromKey(d))}`);
  };

  return (
    <motion.li
      layout
      custom={i}
      variants={listItem}
      initial="hidden"
      animate="show"
      exit={{ opacity: 0, x: -10, transition: { duration: 0.2 } }}
      className={`bg-[#212121] rounded-xl border transition-colors ${stale ? 'border-amber-300/50' : 'border-transparent'}`}
    >
      <div className="px-4 py-3 flex items-center gap-2 sm:gap-3">
        <SubjectDot color={subjectColor(item.subject)} />
        <div className={`flex-1 min-w-0 transition-opacity duration-300 ${item.done ? 'opacity-50' : ''}`}>
          <p className={`text-sm sm:text-base ${item.done ? 'line-through' : ''}`} style={TEXT}>
            {item.text}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <span className="text-[10px] text-gray-400 border border-white/10 px-1.5 py-0.5 rounded-full">
              from {format(fromKey(item.sourceDate), 'EEE d MMM')}
            </span>
            {item.moves >= 2 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${stale ? 'text-amber-300/80 border-amber-300/30' : 'text-gray-400 border-white/10'}`}>
                moved {item.moves}×
              </span>
            )}
            {item.done && item.completedOn && <span className="text-[10px] text-primary/70">cleared {format(fromKey(item.completedOn), 'd MMM')}</span>}
          </div>
        </div>
        <EditButton onClick={() => setEditing((e) => !e)} active={editing} label={`Edit ${item.text}`} />
        <RoundCheck checked={item.done} onChange={() => dispatch({ type: 'toggleCarried', id: item.id, date: today })} label={`Mark ${item.text} done`} />
      </div>

      {stale && !editing && (
        <div className="px-4 pb-3 -mt-1 flex flex-wrap items-center gap-2">
          <p className="text-[11px] text-amber-300/70 flex-1 min-w-[200px]">Carried {item.moves}× — finish it, reschedule it, or drop it</p>
          <button type="button" onClick={drop} className={`${smallBtn} text-gray-300 bg-black/40 hover:text-primary inline-flex items-center gap-1`}>
            <X className="w-3.5 h-3.5" /> Drop
          </button>
          {picking ? (
            <span className="inline-flex items-center gap-1.5">
              <input
                type="date"
                min={tomorrowKey(today)}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`${fieldCls} w-auto`}
                aria-label="Move to date"
              />
              <button
                type="button"
                onClick={() => {
                  moveTo(date);
                  setPicking(false);
                }}
                className={`${smallBtn} bg-primary text-black`}
              >
                Move
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setPicking(true)} className={`${smallBtn} text-gray-300 bg-black/40 hover:text-primary inline-flex items-center gap-1`}>
              <CalendarDays className="w-3.5 h-3.5" /> Move to…
            </button>
          )}
        </div>
      )}

      <Expand open={editing}>
        <TaskForm
          mode="carried"
          showTimes={false}
          initial={{ text: item.text, subject: item.subject }}
          onSave={(v) => {
            dispatch({ type: 'updateCarried', id: item.id, patch: { text: v.text, subject: v.subject } });
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
          onDelete={drop}
          onMoveTo={moveTo}
        />
      </Expand>
    </motion.li>
  );
}

/* ---------------- Counters ---------------- */

function Counter({
  label,
  hint,
  value,
  step,
  max,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  step: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const set = (v: number) => onChange(Math.max(0, Math.min(max, Math.round(v / step) * step)));
  const btn =
    'w-10 h-10 rounded-full bg-black/50 flex items-center justify-center hover:bg-black transition-colors disabled:opacity-30';
  return (
    <div className="bg-[#212121] rounded-xl p-3 sm:p-4 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate" style={TEXT}>
          {label}
        </p>
        <p className="text-[11px] text-gray-500">{hint}</p>
      </div>
      <button type="button" className={btn} onClick={() => set(value - step)} disabled={value <= 0} aria-label={`Decrease ${label}`}>
        <Minus className="w-4 h-4 text-primary" />
      </button>
      <motion.span key={value} initial={{ y: -4, opacity: 0.4 }} animate={{ y: 0, opacity: 1 }} className="w-10 text-center text-xl tabular-nums" style={TEXT}>
        {value}
      </motion.span>
      <button type="button" className={btn} onClick={() => set(value + step)} disabled={value >= max} aria-label={`Increase ${label}`}>
        <Plus className="w-4 h-4 text-primary" />
      </button>
    </div>
  );
}

/* ---------------- Topics covered ---------------- */

function TopicsCovered({ day, week, dateKey }: { day: DayRecord; week: EffectiveWeek; dateKey: string }) {
  const { state, dispatch } = useStore();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);

  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase();
    return SUBJECTS.map((s) => week.topics[s.id])
      .filter((t): t is EffectiveTopic & { title: string } => !!t.title)
      .filter(
        (t) => !day.topicsCovered.includes(t.title) && (!q || t.title.toLowerCase().includes(q) || SUBJECT_BY_ID[t.subject].short.toLowerCase().includes(q)),
      );
  }, [text, week, day.topicsCovered]);

  const add = (tag: string, topicId?: string) => {
    const t = tag.trim();
    if (!t) return;
    // A typed tag that exactly matches a topic also marks it.
    const match = topicId ?? SUBJECTS.map((x) => week.topics[x.id]).find((x) => x.title?.toLowerCase() === t.toLowerCase())?.id;
    dispatch({ type: 'addTag', date: dateKey, tag: t, topicId: match });
    setText('');
  };

  return (
    <Card>
      <SectionLabel>Topics covered today</SectionLabel>
      <div className="relative">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(text);
            }
          }}
          placeholder="e.g. Sliding window – max sum subarray"
          className="w-full min-h-[44px] bg-[#212121] rounded-xl px-4 text-sm placeholder:text-gray-500 outline-none focus:ring-1 focus:ring-primary/40"
        />
        <AnimatePresence>
          {focused && suggestions.length > 0 && (
            <motion.ul
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute z-20 left-0 right-0 mt-1 bg-[#181818] border border-white/5 rounded-xl p-1 shadow-xl"
            >
              <li className="px-3 pt-1.5 pb-1 text-[10px] uppercase tracking-[0.18em] text-gray-500">This week's topics</li>
              {suggestions.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => add(t.title, t.id)}
                    className="w-full min-h-[40px] text-left px-3 rounded-lg hover:bg-[#212121] text-sm flex items-center gap-2"
                    style={TEXT}
                  >
                    <SubjectDot color={SUBJECT_BY_ID[t.subject].color} />
                    <span className="flex-1">{t.title}</span>
                    {state.topicsDone[t.id] && <Check className="w-3.5 h-3.5 text-primary" />}
                  </button>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
      {day.topicsCovered.length > 0 && (
        <ul className="flex flex-wrap gap-2 mt-3">
          <AnimatePresence initial={false}>
            {day.topicsCovered.map((t, i) => (
              <motion.li
                key={t}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-primary text-black text-xs sm:text-sm rounded-full pl-3 pr-1 py-1 flex items-center gap-1"
              >
                {t}
                <button
                  type="button"
                  aria-label={`Remove ${t}`}
                  onClick={() => dispatch({ type: 'removeTag', date: dateKey, index: i })}
                  className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-black/10"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      <p className="text-[11px] text-gray-500 mt-3">Pick from this week's topics to tick them off in the syllabus too.</p>
    </Card>
  );
}

/* ---------------- Check-ins ---------------- */

function CheckIn({
  title,
  placeholder,
  value,
  onChange,
  onCopy,
}: {
  title: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onCopy: () => void;
}) {
  return (
    <Card className="flex flex-col">
      <SectionLabel
        right={
          <button
            type="button"
            onClick={onCopy}
            className="min-h-[40px] px-3 rounded-full text-xs bg-[#212121] hover:bg-[#2a2a2a] text-primary inline-flex items-center gap-1.5"
          >
            <Copy className="w-3.5 h-3.5" /> Copy for Claude
          </button>
        }
      >
        {title}
      </SectionLabel>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={5}
        className="w-full flex-1 bg-[#212121] rounded-xl p-4 text-sm placeholder:text-gray-500 outline-none focus:ring-1 focus:ring-primary/40 resize-y"
      />
    </Card>
  );
}
