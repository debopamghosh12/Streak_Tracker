import { AnimatePresence, motion } from 'framer-motion';
import { Check, Lock, Minus, Plus, Snowflake, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { SubjectDot, useToast } from '../components/ui';
import { SUBJECTS, SUBJECT_BY_ID } from '../data/plan';
import { fromKey, longDate, toKey, weekNumberFor } from '../lib/dates';
import { canEditDay } from '../lib/dayDetails';
import { effectiveHours, formatHours } from '../lib/hours';
import { getWeek } from '../lib/planModel';
import { carriedAwayFrom, statsFor } from '../lib/streak';
import { getDayTasks } from '../lib/tasks';
import { dayFocus, focusLine } from '../lib/focus/dayFocus';
import { emptyDay, useStore } from '../state/store';
import type { DayEdit } from '../state/types';

const TEXT = { color: '#E1E0CC' };
const field =
  'w-full min-h-[40px] bg-[#212121] rounded-xl px-3 text-sm placeholder:text-gray-500 outline-none focus:ring-1 focus:ring-primary/40';
const btn = 'min-h-[40px] px-4 rounded-full text-sm transition-colors';

/**
 * Day details: fill in or correct a past day's numbers and notes (Streak heatmap, or the Today
 * reminder). Ticks and the streak verdict are read-only. Saving dispatches one `editDay` action,
 * which goes through the storage layer like any other change, so it syncs.
 */
export function DayDetails({ dateKey, onClose }: { dateKey: string | null; onClose: () => void }) {
  const today = toKey(new Date());
  const open = !!dateKey && canEditDay(dateKey, today);
  return (
    <AnimatePresence>
      {open && <Panel key={dateKey} dateKey={dateKey!} today={today} onClose={onClose} />}
    </AnimatePresence>
  );
}

function Panel({ dateKey, today, onClose }: { dateKey: string; today: string; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const date = fromKey(dateKey);
  const day = state.days[dateKey] ?? emptyDay();
  const stats = statsFor(state, date);
  const hours = effectiveHours(state, dateKey, Date.now());
  const autoHours = effectiveHours({ ...state, days: { ...state.days, [dateKey]: { ...day, hoursManual: false } } }, dateKey, Date.now()).hours;
  const carriedAway = carriedAwayFrom(state, dateKey);
  const tasks = getDayTasks(day, date, state.plan).active;
  const isPast = dateKey < today;
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [draft, setDraft] = useState<DayEdit>(() => ({
    dsa: day.dsa,
    apps: day.apps,
    hoursManual: day.hoursManual,
    hours: day.hoursManual ? day.hours : hours.hours,
    topicsCovered: [...day.topicsCovered],
    morning: day.morning,
    night: day.night,
  }));
  const [topicIds, setTopicIds] = useState<string[]>([]);

  useEffect(() => {
    headingRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = () => {
    dispatch({ type: 'editDay', date: dateKey, today: toKey(new Date()), at: Date.now(), patch: draft, topicIds });
    toast(isPast ? `Saved ${format(date, 'EEE d MMM')}` : 'Saved');
    onClose();
  };

  const status = day.frozen ? 'Frozen' : stats.counts ? 'Counted' : isPast ? 'Not counted' : 'Not yet';
  const statusTone = day.frozen ? 'text-sky-200/80 border-sky-200/30' : stats.counts ? 'text-primary border-primary/40' : 'text-red-400/70 border-red-400/30';

  return (
    <motion.div className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-details-title"
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="absolute inset-x-0 bottom-0 max-h-[88vh] rounded-t-2xl md:inset-x-auto md:right-0 md:top-0 md:bottom-0 md:w-[440px] md:max-h-none md:rounded-none md:rounded-l-2xl bg-[#101010] border border-white/5 flex flex-col"
        style={TEXT}
      >
        <header className="flex items-start gap-3 px-5 pt-5 pb-3">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Day details</p>
            <h2 id="day-details-title" ref={headingRef} tabIndex={-1} className="text-lg outline-none">
              {longDate(date)}
            </h2>
            <p className="text-xs text-gray-500">Week {weekNumberFor(date)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-[#212121]">
            <X className="w-4 h-4 text-primary" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 pb-4 space-y-4">
          {/* Summary (read-only) */}
          <section className="bg-[#212121] rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-2xl tabular-nums">{stats.pct}%</span>
              <span className="text-xs text-gray-400">
                blocks done · {stats.done}/{stats.total}
              </span>
              <span className={`ml-auto text-[11px] px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${statusTone}`}>
                {day.frozen && <Snowflake className="w-3 h-3" />} {status}
              </span>
            </div>
            <p className="text-xs text-gray-400">
              Hours: <span style={TEXT}>{formatHours(hours.hours)}</span> ({hours.source}) · DSA {day.dsa} · Applications {day.apps}
            </p>
            {dayFocus(day) && <p className="text-xs text-gray-400">{focusLine(dayFocus(day)!)}</p>}
            <ul className="space-y-1" aria-label="Tasks (read-only)">
              {tasks.map((t) => {
                const away = carriedAway.has(t.id);
                const done = t.done && !away;
                return (
                  <li key={t.id} className="flex items-center gap-2 text-xs">
                    <span className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${done ? 'bg-primary border-primary' : 'border-white/20'}`}>
                      {done && <Check className="w-3 h-3 text-black" strokeWidth={3} />}
                    </span>
                    <span className={`flex-1 min-w-0 truncate ${done ? '' : 'text-gray-500'}`}>{t.title}</span>
                    {away && <span className="text-[10px] text-gray-500">carried away</span>}
                  </li>
                );
              })}
            </ul>
            <p className="text-[11px] text-gray-500 inline-flex items-start gap-1.5">
              <Lock className="w-3 h-3 mt-0.5 shrink-0" /> Numbers can be edited later. Ticks and the streak verdict are fixed once the day ends.
            </p>
            {day.editedAt && <p className="text-[11px] text-amber-300/70">Edited later · {format(day.editedAt, "EEE d MMM 'at' h:mm a")}</p>}
          </section>

          {/* Editable fields */}
          <section className="space-y-3">
            <NumberField label="DSA problems solved" value={draft.dsa} min={0} max={50} step={1} onChange={(f) => setDraft((d) => ({ ...d, dsa: f(d.dsa) }))} />
            <NumberField label="Applications sent" value={draft.apps} min={0} max={50} step={1} onChange={(f) => setDraft((d) => ({ ...d, apps: f(d.apps) }))} />
            <NumberField
              label="Hours studied"
              value={draft.hoursManual ? draft.hours : autoHours}
              min={0}
              max={16}
              step={0.25}
              onChange={(f) => setDraft((d) => ({ ...d, hours: f(d.hoursManual ? d.hours : autoHours), hoursManual: true }))}
              extra={
                <span className="inline-flex items-center gap-2">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full border ${draft.hoursManual ? 'text-amber-300/80 border-amber-300/30' : 'text-gray-400 border-white/10'}`}
                  >
                    {draft.hoursManual ? 'manual' : 'auto'}
                  </span>
                  {draft.hoursManual && (
                    <button type="button" onClick={() => setDraft((d) => ({ ...d, hoursManual: false, hours: autoHours }))} className="text-[11px] text-gray-400 underline underline-offset-2 hover:text-primary min-h-[28px]">
                      Reset to auto
                    </button>
                  )}
                </span>
              }
            />
            <TopicTags
              dateKey={dateKey}
              tags={draft.topicsCovered}
              onAdd={(tag, topicId) => {
                setDraft((d) => (d.topicsCovered.includes(tag) ? d : { ...d, topicsCovered: [...d.topicsCovered, tag] }));
                if (topicId) setTopicIds((ids) => (ids.includes(topicId) ? ids : [...ids, topicId]));
              }}
              onRemove={(tag) => setDraft((d) => ({ ...d, topicsCovered: d.topicsCovered.filter((t) => t !== tag) }))}
            />
            <label className="block space-y-1">
              <span className="text-xs text-gray-400">Morning plan</span>
              <textarea value={draft.morning} onChange={(e) => {
                  const v = e.target.value;
                  setDraft((d) => ({ ...d, morning: v }));
                }} rows={3} className={`${field} py-2 resize-y`} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-gray-400">Night check-in</span>
              <textarea value={draft.night} onChange={(e) => {
                  const v = e.target.value;
                  setDraft((d) => ({ ...d, night: v }));
                }} rows={3} className={`${field} py-2 resize-y`} />
            </label>
          </section>
        </div>

        <footer className="flex gap-2 px-5 py-4 border-t border-white/5">
          <button type="button" onClick={save} className={`${btn} bg-primary text-black hover:opacity-90 flex-1`}>
            Save
          </button>
          <button type="button" onClick={onClose} className={`${btn} bg-[#212121] text-gray-300 hover:text-primary flex-1`}>
            Cancel
          </button>
        </footer>
      </motion.aside>
    </motion.div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  extra,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Receives an updater so quick repeated taps always step from the latest value. */
  onChange: (update: (prev: number) => number) => void;
  extra?: React.ReactNode;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const iconBtn = 'w-10 h-10 rounded-full bg-black/50 flex items-center justify-center hover:bg-black transition-colors disabled:opacity-30 shrink-0';
  return (
    <div className="bg-[#212121] rounded-xl p-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-tight">{label}</p>
        <p className="text-[11px] text-gray-500">
          {min}–{max}
          {step < 1 ? `, steps of ${step}` : ''}
        </p>
        {extra && <div className="mt-1">{extra}</div>}
      </div>
      <button type="button" className={iconBtn} disabled={value <= min} onClick={() => onChange((prev) => clamp(prev - step))} aria-label={`Decrease ${label}`}>
        <Minus className="w-4 h-4 text-primary" />
      </button>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== '' && Number.isFinite(n)) onChange(() => clamp(n));
        }}
        onBlur={() => setText(String(value))}
        aria-label={label}
        className="w-16 min-h-[40px] bg-black/50 rounded-lg text-center text-lg tabular-nums outline-none focus:ring-1 focus:ring-primary/40 [color-scheme:dark]"
      />
      <button type="button" className={iconBtn} disabled={value >= max} onClick={() => onChange((prev) => clamp(prev + step))} aria-label={`Increase ${label}`}>
        <Plus className="w-4 h-4 text-primary" />
      </button>
    </div>
  );
}

/** Same autocomplete as Today: that day's week topics; picking one also ticks it in the syllabus on save. */
function TopicTags({
  dateKey,
  tags,
  onAdd,
  onRemove,
}: {
  dateKey: string;
  tags: string[];
  onAdd: (tag: string, topicId?: string) => void;
  onRemove: (tag: string) => void;
}) {
  const { state } = useStore();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const week = getWeek(state.plan, weekNumberFor(fromKey(dateKey)));
  const topics = SUBJECTS.map((s) => week.topics[s.id]).filter((t): t is typeof t & { title: string } => !!t.title);

  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase();
    return topics.filter((t) => !tags.includes(t.title) && (!q || t.title.toLowerCase().includes(q) || SUBJECT_BY_ID[t.subject].short.toLowerCase().includes(q)));
  }, [text, tags, topics]);

  const add = (tag: string, topicId?: string) => {
    const t = tag.trim();
    if (!t) return;
    onAdd(t, topicId ?? topics.find((x) => x.title.toLowerCase() === t.toLowerCase())?.id);
    setText('');
  };

  return (
    <div className="space-y-2">
      <span className="text-xs text-gray-400">Topics covered</span>
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
          placeholder="Add a topic"
          className={field}
        />
        {focused && suggestions.length > 0 && (
          <ul className="absolute z-20 left-0 right-0 mt-1 bg-[#181818] border border-white/5 rounded-xl p-1 shadow-xl">
            {suggestions.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add(t.title, t.id)}
                  className="w-full min-h-[40px] text-left px-3 rounded-lg hover:bg-[#212121] text-sm flex items-center gap-2"
                >
                  <SubjectDot color={SUBJECT_BY_ID[t.subject].color} />
                  <span className="flex-1">{t.title}</span>
                  {state.topicsDone[t.id] && <Check className="w-3.5 h-3.5 text-primary" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {tags.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <li key={t} className="bg-primary text-black text-xs rounded-full pl-3 pr-1 py-1 flex items-center gap-1">
              {t}
              <button type="button" aria-label={`Remove ${t}`} onClick={() => onRemove(t)} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-black/10">
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
