import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy, Minus, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { PageTitle } from '../../components/PageTitle';
import { Card, ProgressRing, SectionLabel, SubjectDot, useToast } from '../../components/ui';
import { DAILY_COUNTERS, SUBJECTS, SUBJECT_BY_ID, type CounterField } from '../../data/plan';
import { displayTime, fromKey, isSunday, planStatus, shortDate, toKey, weekNumberFor } from '../../lib/dates';
import { effectiveSlots, formatMinutes, formatStopwatch, getDayItems, groupBySlot, type DayItem } from '../../lib/dayItems';
import { effectiveHours, formatHours, hoursByTask } from '../../lib/hours';
import { copyText, useNow } from '../../lib/hooks';
import { getWeek, type EffectiveTopic, type EffectiveWeek } from '../../lib/planModel';
import { currentStreak, dayStats } from '../../lib/streak';
import { emptyDay, useStore } from '../../state/store';
import type { DayRecord, Override, TaskSubject } from '../../state/types';
import { TaskBoard } from '../today/TaskBoard';
import { TEXT, subjectLabel } from '../today/shared';

const describe = (v: Pick<Override, 'text' | 'durationMin' | 'subject'>) =>
  `"${v.text}"${v.durationMin ? ` ${formatMinutes(v.durationMin)}` : ''} (${subjectLabel(v.subject as TaskSubject)})`;
const itemLine = (i: DayItem) => `${i.title}${i.text ? `: ${i.text}` : ''} (${formatMinutes(i.durationMin)})`;

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
  const { items, skipped } = useMemo(() => getDayItems(state, key), [state.days[key], state.carried, state.plan, key]);
  const carriedToday = state.carried.filter((c) => c.currentDate === key);
  const cleared = carriedToday.filter((c) => c.done);
  const pending = carriedToday.filter((c) => !c.done);
  const hours = effectiveHours(state, key, now.getTime());

  const copy = async (text: string) => {
    toast((await copyText(text)) ? 'Copied' : 'Copy failed');
  };

  const dateLabel = format(now, 'EEE d MMM');

  const morningText = () => {
    const live = items.filter((i) => !i.moved);
    let body: string;
    if (state.settings.todayMode === 'slots') {
      const slots = effectiveSlots(state, key);
      const { unplaced, bySlot } = groupBySlot(live, slots, day.placement);
      const groups = slots.map((s) => {
        const list = bySlot[s.id] ?? [];
        const head = `${displayTime(s.start)}–${displayTime(s.end)}${s.label ? ` ${s.label}` : ''}:`;
        return `${head}\n${list.length ? list.map((i) => `  - ${itemLine(i)}`).join('\n') : '  (empty)'}`;
      });
      if (unplaced.length) groups.push(`Unplaced:\n${unplaced.map((i) => `  - ${itemLine(i)}`).join('\n')}`);
      body = groups.join('\n') || '(no slots yet)';
    } else {
      body = live.map((i, n) => `${n + 1}. ${itemLine(i)}`).join('\n');
    }
    const planned = live.reduce((s, i) => s + i.durationMin, 0);
    const carried = pending.length ? `\nCarried over (${pending.length}): ${pending.map((c) => `${c.text} (from ${shortDate(fromKey(c.sourceDate))})`).join('; ')}` : '';
    const notes = day.morning.trim() ? `\nNotes: ${day.morning.trim()}` : '';
    return `Plan for ${dateLabel} (Week ${week.n}) — ${formatMinutes(planned)} planned:\n${body}${carried}${notes}`;
  };

  const nightText = () => {
    const done = items.filter((i) => i.done && i.kind !== 'carried').map((i) => i.title);
    const edited = items.filter((i) => i.edited && i.task?.base);
    const moved = items.filter((i) => i.moved);
    const tracked = hoursByTask(state, key, Date.now()).filter((t) => t.trackedMs > 0);
    const parts = [
      `Done on ${dateLabel} (Week ${week.n}): ${done.length ? done.join(', ') : 'nothing checked yet'} (${stats.done}/${stats.total}, ${stats.pct}%)`,
      `DSA problems: ${day.dsa} · Applications: ${day.apps} · Total hours: ${formatHours(hours.hours)} (${hours.source})`,
      `Time tracked: ${tracked.length ? `\n${tracked.map((t) => `- ${t.item.title}: ${formatStopwatch(t.trackedMs)} of ${formatMinutes(t.item.durationMin)}`).join('\n')}` : '—'}`,
      `Topics covered: ${day.topicsCovered.length ? day.topicsCovered.join('; ') : '—'}`,
    ];
    if (edited.length) {
      parts.push(
        `Edited tasks:\n${edited
          .map((i) => `- ${i.title}: ${describe(i.task!.base!)} → ${describe({ text: i.kind === 'block' ? i.text : i.title, durationMin: i.durationMin, subject: i.subject })}`)
          .join('\n')}`,
      );
    }
    if (skipped.length) parts.push(`Skipped: ${skipped.map(({ task, reason }) => `${task.title}${reason ? ` (${reason})` : ''}`).join('; ')}`);
    if (moved.length) parts.push(`Moved to tomorrow: ${moved.map((i) => i.title).join('; ')}`);
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
        <Card>
          <SectionLabel
            right={
              <span className="text-xs text-gray-500 inline-flex items-center gap-3">
                {!sunday && !week.allSet && (
                  <Link to="/app/syllabus" className="text-primary underline underline-offset-4 hover:opacity-80 min-h-[40px] -my-3 inline-flex items-center">
                    Set topics
                  </Link>
                )}
                {sunday ? 'Sunday checkpoint' : `Week ${week.n} · Mon–Sat`}
              </span>
            }
          >
            Today's tasks
          </SectionLabel>
          <TaskBoard dateKey={key} />
        </Card>

        <Card>
          <SectionLabel>Today's numbers</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {DAILY_COUNTERS.map((c) => (
              <Counter
                key={c.field}
                label={c.label}
                hint={c.target}
                value={c.field === 'hours' ? hours.hours : day[c.field]}
                step={c.step}
                max={c.max}
                onChange={(v) => dispatch({ type: 'setCounter', date: key, field: c.field as CounterField, value: v })}
                extra={
                  c.field === 'hours' ? (
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                          hours.source === 'auto' ? 'text-gray-400 border-white/10' : 'text-amber-300/80 border-amber-300/30'
                        }`}
                        title={hours.source === 'auto' ? 'From timers, else the duration of ticked tasks' : 'Entered by hand'}
                      >
                        {hours.source}
                      </span>
                      {hours.source === 'manual' && (
                        <button
                          type="button"
                          onClick={() => dispatch({ type: 'resetHours', date: key })}
                          className="text-[11px] text-gray-400 underline underline-offset-2 hover:text-primary min-h-[28px]"
                        >
                          Reset to auto
                        </button>
                      )}
                    </span>
                  ) : undefined
                }
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

/* ---------------- Counters ---------------- */

function Counter({
  label,
  hint,
  value,
  step,
  max,
  onChange,
  extra,
}: {
  label: string;
  hint: string;
  value: number;
  step: number;
  max: number;
  onChange: (v: number) => void;
  extra?: React.ReactNode;
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
        {extra && <div className="mt-1">{extra}</div>}
      </div>
      <button type="button" className={btn} onClick={() => set(value - step)} disabled={value <= 0} aria-label={`Decrease ${label}`}>
        <Minus className="w-4 h-4 text-primary" />
      </button>
      <motion.span key={value} initial={{ y: -4, opacity: 0.4 }} animate={{ y: 0, opacity: 1 }} className="min-w-[2.5rem] text-center text-xl tabular-nums" style={TEXT}>
        {formatHours(value)}
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
