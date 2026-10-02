import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { differenceInCalendarDays, format } from 'date-fns';
import { PageTitle } from '../../components/PageTitle';
import { Card, RoundCheck, SectionLabel, SubjectDot, listItem, useToast } from '../../components/ui';
import { BASE_WEEKS, DSA_GOALS, SUBJECTS, type SubjectId } from '../../data/plan';
import { fromKey, planStatus, toKey, weekNumberFor, weekRangeLabel } from '../../lib/dates';
import { useNow } from '../../lib/hooks';
import { totalDsa } from '../../lib/dayDetails';
import {
  emptyUserWeek,
  lastPlannedWeek,
  lastShownWeek,
  listWeeks,
  phaseFor,
  phasesOf,
  type EffectivePhase,
  type EffectiveWeek,
} from '../../lib/planModel';
import { useStore } from '../../state/store';
import type { UserWeek, WeekTopics } from '../../state/types';

const TEXT = { color: '#E1E0CC' };

type Filter = 'all' | SubjectId;

const fieldCls =
  'w-full min-h-[40px] bg-black/50 rounded-lg px-3 text-sm placeholder:text-gray-500 outline-none focus:ring-1 focus:ring-primary/40 [color-scheme:dark]';
const smallBtn = 'min-h-[40px] px-4 rounded-full text-xs transition-colors';
const addBtn =
  'min-h-[44px] px-4 rounded-xl border border-dashed border-white/10 text-sm text-gray-400 hover:text-primary hover:border-primary/30 inline-flex items-center justify-center gap-2 transition-colors';

export default function Syllabus() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const now = useNow();
  const status = planStatus(now);
  const currentWeek = weekNumberFor(now);
  const plan = state.plan;

  const phases = useMemo(() => phasesOf(plan), [plan]);
  const planned = lastPlannedWeek(plan);
  const lastShown = lastShownWeek(plan, now);
  const weeks = useMemo(() => listWeeks(plan, lastShown), [plan, lastShown]);
  const currentPhase = phaseFor(plan, currentWeek, phases);

  const [filter, setFilter] = useState<Filter>('all');
  const [pendingOnly, setPendingOnly] = useState(false);
  const [openPhases, setOpenPhases] = useState<Record<string, boolean>>(() => ({ [currentPhase.id]: true }));
  const [editing, setEditing] = useState<number | null>(null);
  const [phaseFormOpen, setPhaseFormOpen] = useState(false);

  const done = (id: string) => !!state.topicsDone[id];
  const plannedWeeks = weeks.filter((w) => w.n <= planned);

  // Overall progress over every set topic in the planned weeks.
  const plannedTopics = plannedWeeks.flatMap((w) => SUBJECTS.map((s) => w.topics[s.id]).filter((t) => t.title));
  const overallDone = plannedTopics.filter((t) => done(t.id)).length;
  const overallPct = plannedTopics.length ? Math.round((overallDone / plannedTopics.length) * 100) : 0;

  // DSA goal: base phases keep ~110 / ~250 / ~350; a user phase may set its own; otherwise running total only.
  const dsaTotal = totalDsa(state);
  const dsaGoals: { label: string; count: number; active: boolean }[] =
    currentPhase.kind === 'base'
      ? (() => {
          const active = DSA_GOALS.find((g) => differenceInCalendarDays(g.by, now) >= 0) ?? DSA_GOALS[DSA_GOALS.length - 1];
          return DSA_GOALS.map((g) => ({ label: `~${g.count} by ${g.label}`, count: g.count, active: g === active }));
        })()
      : currentPhase.dsaGoal
        ? [{ label: `~${currentPhase.dsaGoal} by end of ${currentPhase.name}`, count: currentPhase.dsaGoal, active: true }]
        : [];
  const activeGoal = dsaGoals.find((g) => g.active);

  const openPhaseOf = (n: number) => setOpenPhases((o) => ({ ...o, [phaseFor(state.plan, n).id]: true }));

  const addWeeks = (count: number) => {
    const first = planned + 1;
    for (let i = 0; i < count; i++) dispatch({ type: 'upsertPlanWeek', week: emptyUserWeek(first + i) });
    setEditing(first);
    openPhaseOf(first);
    toast(count === 1 ? `Week ${first} added` : `Weeks ${first}–${first + count - 1} added`);
  };

  const chips: { id: Filter; label: string }[] = [{ id: 'all', label: 'All' }, ...SUBJECTS.map((s) => ({ id: s.id as Filter, label: s.short }))];
  const phaseWeeks = (p: EffectivePhase) => weeks.filter((w) => w.phase.id === p.id);
  const shownPhases = phases.filter((p) => phaseWeeks(p).length > 0);

  return (
    <div>
      <PageTitle first="Syllabus," second="week after week." />

      {/* Subject progress (effective plan, compared with what's scheduled up to the current week) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2 mb-4">
        {SUBJECTS.map((s, i) => {
          const topics = plannedWeeks.map((w) => w.topics[s.id]).filter((t) => t.title);
          const n = topics.filter((t) => done(t.id)).length;
          const pct = topics.length ? Math.round((n / topics.length) * 100) : 0;
          // Weeks before the current one should be done; the current week may still be in progress.
          const expectedMin = status === 'before' ? 0 : topics.filter((t) => t.week < currentWeek).length;
          const expectedMax = topics.filter((t) => t.week <= currentWeek).length;
          let badge = 'On track';
          let tone = 'text-primary bg-primary/10';
          if (n < expectedMin) {
            badge = `Behind by ${expectedMin - n}`;
            tone = 'text-red-400/80 bg-red-400/10';
          } else if (n > expectedMax) {
            badge = `Ahead by ${n - expectedMax}`;
            tone = 'text-amber-300/80 bg-amber-300/10';
          }
          return (
            <motion.div key={s.id} custom={i} variants={listItem} initial="hidden" animate="show" className="bg-[#212121] rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <SubjectDot color={s.color} />
                <span className="text-sm truncate" style={TEXT}>
                  {s.name}
                </span>
              </div>
              <p className="text-3xl tracking-tight" style={TEXT}>
                {pct}%
              </p>
              <p className="text-xs text-gray-500 mb-3">
                {n} / {topics.length} topics
              </p>
              <div className="h-1 rounded-full bg-black/60 overflow-hidden mb-3">
                <motion.div className="h-full rounded-full" style={{ background: s.color }} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} />
              </div>
              <span className={`text-[11px] px-2 py-1 rounded-full ${tone}`}>{badge}</span>
            </motion.div>
          );
        })}
      </div>

      {/* Overall */}
      <Card className="mb-4">
        <SectionLabel right={<span className="text-xs text-gray-400 tabular-nums">{overallDone} / {plannedTopics.length} · {overallPct}%</span>}>
          Overall progress
        </SectionLabel>
        <div className="relative h-2 rounded-full bg-[#212121] overflow-hidden">
          <motion.div className="h-full bg-primary rounded-full" initial={{ width: 0 }} animate={{ width: `${overallPct}%` }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} />
          {shownPhases.slice(1).map((p) => (
            <span key={p.id} className="absolute top-0 bottom-0 w-px bg-black" style={{ left: `${((phaseWeeks(p)[0].n - 1) / lastShown) * 100}%` }} />
          ))}
        </div>
        <div className="relative h-5 mt-1.5 text-[10px] sm:text-[11px] text-gray-500">
          {shownPhases.map((p) => {
            const ws = phaseWeeks(p);
            return (
              <span
                key={p.id}
                className="absolute truncate"
                style={{ left: `${((ws[0].n - 1) / lastShown) * 100}%`, maxWidth: `${(ws.length / lastShown) * 100}%` }}
              >
                {p.number}. {p.name}
              </span>
            );
          })}
        </div>

        <div className="mt-4 pt-4 border-t border-white/5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-2" style={TEXT}>
            <SubjectDot color={SUBJECTS[0].color} /> DSA problems: <span className="tabular-nums">{dsaTotal}</span>
          </span>
          {dsaGoals.map((g) => (
            <span key={g.label} className={`text-xs ${g.active ? 'text-primary' : dsaTotal >= g.count ? 'text-gray-500 line-through' : 'text-gray-500'}`}>
              {g.label}
            </span>
          ))}
          {activeGoal && (
            <div className="w-full h-1 rounded-full bg-[#212121] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, (dsaTotal / activeGoal.count) * 100)}%`, background: SUBJECTS[0].color }}
              />
            </div>
          )}
        </div>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setFilter(c.id)}
            className={`min-h-[40px] px-4 rounded-full text-xs sm:text-sm transition-colors ${
              filter === c.id ? 'bg-primary text-black' : 'bg-[#101010] text-gray-400 hover:text-primary'
            }`}
          >
            {c.label}
          </button>
        ))}
        <button
          type="button"
          role="switch"
          aria-checked={pendingOnly}
          onClick={() => setPendingOnly((p) => !p)}
          className="ml-auto min-h-[40px] inline-flex items-center gap-2 text-xs sm:text-sm text-gray-400"
        >
          Show only pending
          <span className={`w-9 h-5 rounded-full relative transition-colors ${pendingOnly ? 'bg-primary' : 'bg-[#212121]'}`}>
            <motion.span
              className={`absolute top-0.5 w-4 h-4 rounded-full ${pendingOnly ? 'bg-black' : 'bg-gray-500'}`}
              animate={{ left: pendingOnly ? 18 : 2 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          </span>
        </button>
      </div>

      {/* Phases */}
      <div className="space-y-3">
        {shownPhases.map((p) => {
          const open = !!openPhases[p.id];
          const ws = phaseWeeks(p);
          const topics = ws.flatMap((w) => SUBJECTS.map((s) => w.topics[s.id]).filter((t) => t.title));
          const phaseDone = topics.filter((t) => done(t.id)).length;
          const first = ws[0].n;
          const last = ws[ws.length - 1].n;
          return (
            <Card key={p.id} className="!p-0 overflow-hidden">
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => setOpenPhases((o) => ({ ...o, [p.id]: !o[p.id] }))}
                  className="flex-1 min-w-0 flex items-center gap-3 px-4 sm:px-5 py-4 text-left min-h-[56px]"
                  aria-expanded={open}
                >
                  <ChevronRight className={`w-4 h-4 shrink-0 text-primary transition-transform ${open ? 'rotate-90' : ''}`} />
                  <span className="flex-1 min-w-0">
                    <span className="text-base sm:text-lg" style={TEXT}>
                      Phase {p.number} — <span className="italic font-serif">{p.name}</span>
                    </span>
                    <span className="block text-xs text-gray-500">
                      {first === last ? `Week ${first}` : `Weeks ${first}–${last}`}
                      {p.endWeek == null && p.kind !== 'base' ? ' and on' : ''} · {weekRangeLabel(first).split(' – ')[0]} – {weekRangeLabel(last).split(' – ')[1]}
                    </span>
                    {p.goal && <span className="block text-xs text-gray-400 mt-0.5 truncate">Goal: {p.goal}</span>}
                  </span>
                  <span className="text-xs text-gray-400 tabular-nums">
                    {phaseDone}/{topics.length}
                  </span>
                </button>
                {p.kind === 'user' && (
                  <button
                    type="button"
                    aria-label={`Delete phase ${p.name}`}
                    onClick={() => {
                      dispatch({ type: 'deletePlanPhase', id: p.id });
                      toast(`Phase "${p.name}" removed — its weeks stay`);
                    }}
                    className="w-10 h-10 mr-2 shrink-0 rounded-full flex items-center justify-center text-gray-500 hover:text-red-400/80"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 px-3 sm:px-4 pb-4">
                      {ws.map((w) =>
                        editing === w.n ? (
                          <WeekEditor key={w.n} week={w} phases={phases} now={now} topicsDone={state.topicsDone} onClose={() => setEditing(null)} />
                        ) : (
                          <WeekCard
                            key={w.n}
                            week={w}
                            now={now}
                            isCurrent={status === 'during' && w.n === currentWeek}
                            filter={filter}
                            pendingOnly={pendingOnly}
                            onEdit={() => setEditing(w.n)}
                          />
                        ),
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          );
        })}
      </div>

      {/* Plan editor actions */}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button type="button" className={addBtn} onClick={() => addWeeks(1)}>
          <Plus className="w-4 h-4" /> Add week
        </button>
        <button type="button" className={addBtn} onClick={() => addWeeks(4)}>
          <Plus className="w-4 h-4" /> Add 4 weeks
        </button>
        <button type="button" className={addBtn} onClick={() => setPhaseFormOpen((o) => !o)} aria-expanded={phaseFormOpen}>
          <Plus className="w-4 h-4" /> New phase
        </button>
      </div>
      <AnimatePresence initial={false}>
        {phaseFormOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <PhaseForm
              defaultStart={Math.max(planned + 1, currentWeek)}
              onClose={() => setPhaseFormOpen(false)}
              onCreated={(startWeek) => setOpenPhases((o) => ({ ...o, [phaseFor(state.plan, startWeek).id]: true }))}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------- Week card ---------------- */

function WeekCard({
  week: w,
  now,
  isCurrent,
  filter,
  pendingOnly,
  onEdit,
}: {
  week: EffectiveWeek;
  now: Date;
  isCurrent: boolean;
  filter: Filter;
  pendingOnly: boolean;
  onEdit: () => void;
}) {
  const { state, dispatch } = useStore();
  const isPast = differenceInCalendarDays(w.end, now) < 0;
  const rows = SUBJECTS.filter((s) => filter === 'all' || s.id === filter)
    .map((s) => w.topics[s.id])
    .filter((t) => !pendingOnly || !state.topicsDone[t.id]);
  if (pendingOnly && w.anySet && rows.every((t) => !t.title)) return null;

  return (
    <div className={`bg-[#212121] rounded-xl p-3 sm:p-4 border ${isCurrent ? 'border-primary/50' : 'border-transparent'}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-sm min-w-0" style={TEXT}>
          Week {w.n}
          <span className="text-gray-500 text-xs ml-2">{weekRangeLabel(w.n)}</span>
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          {isCurrent && <span className="text-[10px] bg-primary text-black px-2 py-0.5 rounded-full">Current week</span>}
          {(w.source === 'override' || w.source === 'user') && w.anySet && (
            <span className="text-[10px] text-gray-400 border border-white/10 px-1.5 py-0.5 rounded-full">{w.source === 'override' ? 'edited' : 'added'}</span>
          )}
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit week ${w.n}`}
            className="w-10 h-10 -my-2 -mr-2 rounded-full flex items-center justify-center text-gray-500 hover:text-primary transition-colors"
          >
            <Pencil className="w-4 h-4" />
          </button>
        </span>
      </div>
      {!w.anySet ? (
        <button
          type="button"
          onClick={onEdit}
          className="w-full min-h-[44px] rounded-lg border border-dashed border-white/10 text-xs text-gray-400 hover:text-primary hover:border-primary/30"
        >
          Topics not set — set this week's topics
        </button>
      ) : (
        <ul className="divide-y divide-white/5">
          {rows.map((t) => {
            const s = SUBJECTS.find((x) => x.id === t.subject)!;
            if (!t.title) {
              return (
                <li key={t.id} className="flex items-center gap-3 py-2 min-h-[48px]">
                  <SubjectDot color={s.color} className="opacity-40" />
                  <p className="flex-1 text-xs text-gray-500">
                    {s.short} · <span className="italic">not set</span>
                  </p>
                </li>
              );
            }
            const doneOn = state.topicsDone[t.id];
            return (
              <li key={t.id} className="flex items-center gap-3 py-2">
                <SubjectDot color={s.color} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm transition-opacity ${doneOn ? 'line-through opacity-50' : ''}`} style={TEXT}>
                    {t.title}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {s.short}
                    {doneOn && ` · done ${format(fromKey(doneOn), 'd MMM')}`}
                    {!doneOn && isPast && <span className="text-red-400/70"> · Overdue</span>}
                  </p>
                </div>
                <RoundCheck
                  size="sm"
                  checked={!!doneOn}
                  onChange={() => dispatch({ type: 'toggleTopic', topicId: t.id, date: toKey(now) })}
                  label={`Mark ${t.title} done`}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ---------------- Week editor ---------------- */

function WeekEditor({
  week: w,
  phases,
  now,
  topicsDone,
  onClose,
}: {
  week: EffectiveWeek;
  phases: EffectivePhase[];
  now: Date;
  topicsDone: Record<string, string>;
  onClose: () => void;
}) {
  const { dispatch } = useStore();
  const toast = useToast();
  const [topics, setTopics] = useState<Record<SubjectId, string>>(
    () => Object.fromEntries(SUBJECTS.map((s) => [s.id, w.texts[s.id] ?? ''])) as Record<SubjectId, string>,
  );
  const [phaseId, setPhaseId] = useState<string>(w.userWeek?.phaseId ?? '');
  const [showTargets, setShowTargets] = useState(!!w.userWeek?.targets);
  const [targets, setTargets] = useState<Record<SubjectId, string>>(
    () => Object.fromEntries(SUBJECTS.map((s) => [s.id, w.userWeek?.targets?.[s.id] ?? ''])) as Record<SubjectId, string>,
  );

  const hasChecked = SUBJECTS.some((s) => topicsDone[w.topics[s.id].id]);
  const isFuture = differenceInCalendarDays(w.start, now) > 0;
  const canDelete = w.source === 'user' && !hasChecked && isFuture;
  const isOverride = w.source === 'override';

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const week: UserWeek = {
      weekNumber: w.n,
      phaseId: phaseId || null,
      topics: Object.fromEntries(SUBJECTS.map((s) => [s.id, topics[s.id].trim() || null])) as WeekTopics,
    };
    const t = Object.fromEntries(SUBJECTS.filter((s) => targets[s.id].trim()).map((s) => [s.id, targets[s.id].trim()]));
    if (Object.keys(t).length) week.targets = t;
    dispatch({ type: 'upsertPlanWeek', week });
    toast(`Week ${w.n} saved`);
    onClose();
  };

  return (
    <motion.form
      onSubmit={save}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[#212121] rounded-xl p-3 sm:p-4 border border-primary/40 space-y-2 lg:col-span-2"
    >
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-sm" style={TEXT}>
          Edit week {w.n}
        </span>
        <span className="text-xs text-gray-500">{weekRangeLabel(w.n)} · dates follow the plan start</span>
      </div>
      {SUBJECTS.map((s) => (
        <label key={s.id} className="flex items-center gap-2">
          <SubjectDot color={s.color} />
          <span className="w-16 shrink-0 text-xs text-gray-400">{s.short}</span>
          <input
            value={topics[s.id]}
            onChange={(e) => setTopics({ ...topics, [s.id]: e.target.value })}
            placeholder={`This week's ${s.short} topic`}
            className={fieldCls}
          />
        </label>
      ))}
      <label className="flex items-center gap-2 pt-1">
        <span className="w-[4.5rem] shrink-0 text-xs text-gray-400 pl-4">Phase</span>
        <select value={phaseId} onChange={(e) => setPhaseId(e.target.value)} className={fieldCls}>
          <option value="">Auto (by week range)</option>
          {phases
            .filter((p) => p.kind !== 'default')
            .map((p) => (
              <option key={p.id} value={p.id}>
                Phase {p.number} — {p.name}
              </option>
            ))}
        </select>
      </label>
      <button type="button" onClick={() => setShowTargets((v) => !v)} className="text-xs text-gray-400 hover:text-primary min-h-[40px] inline-flex items-center gap-1">
        <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showTargets ? 'rotate-90' : ''}`} /> Custom weekly targets (optional)
      </button>
      {showTargets &&
        SUBJECTS.map((s) => (
          <label key={s.id} className="flex items-center gap-2">
            <span className="w-[4.5rem] shrink-0 text-xs text-gray-500 pl-4">{s.short}</span>
            <input
              value={targets[s.id]}
              onChange={(e) => setTargets({ ...targets, [s.id]: e.target.value })}
              placeholder={w.targets[s.id]}
              className={fieldCls}
            />
          </label>
        ))}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button type="submit" className={`${smallBtn} bg-primary text-black hover:opacity-90`}>
          Save
        </button>
        <button type="button" onClick={onClose} className={`${smallBtn} bg-black/50 text-gray-300 hover:text-primary`}>
          Cancel
        </button>
        {isOverride && (
          <button
            type="button"
            onClick={() => {
              dispatch({ type: 'deletePlanWeek', weekNumber: w.n });
              toast(`Week ${w.n} reset to the base plan`);
              onClose();
            }}
            className="text-xs text-gray-400 underline underline-offset-4 hover:text-primary min-h-[40px]"
          >
            Reset to base plan
          </button>
        )}
        {w.source === 'user' && (
          <button
            type="button"
            disabled={!canDelete}
            title={canDelete ? undefined : hasChecked ? 'Has checked topics — edit it instead' : 'Only future weeks can be deleted'}
            onClick={() => {
              dispatch({ type: 'deletePlanWeek', weekNumber: w.n });
              toast(`Week ${w.n} deleted`);
              onClose();
            }}
            className={`${smallBtn} ml-auto text-red-400/80 hover:bg-red-400/10 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent`}
          >
            Delete week
          </button>
        )}
      </div>
      {w.source === 'user' && !canDelete && (
        <p className="text-[11px] text-gray-500">
          {hasChecked ? 'This week has checked topics, so it can be edited but not deleted.' : 'Only empty future weeks can be deleted.'}
        </p>
      )}
      {w.n <= BASE_WEEKS && !isOverride && <p className="text-[11px] text-gray-500">Saving creates your own version of this base week. Checked topics stay checked.</p>}
    </motion.form>
  );
}

/* ---------------- New phase ---------------- */

function PhaseForm({ defaultStart, onClose, onCreated }: { defaultStart: number; onClose: () => void; onCreated: (startWeek: number) => void }) {
  const { dispatch } = useStore();
  const toast = useToast();
  const [name, setName] = useState('');
  const [start, setStart] = useState(String(defaultStart));
  const [end, setEnd] = useState('');
  const [goal, setGoal] = useState('');
  const [dsaGoal, setDsaGoal] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const s = Number(start);
    const en = end.trim() ? Number(end) : null;
    if (!name.trim()) return setError('Give the phase a name.');
    if (!Number.isInteger(s) || s < 1) return setError('Start week must be 1 or more.');
    if (en != null && (!Number.isInteger(en) || en < s)) return setError('End week must be on or after the start week.');
    const dsa = dsaGoal.trim() ? Number(dsaGoal) : undefined;
    if (dsa != null && (!Number.isInteger(dsa) || dsa <= 0)) return setError('DSA goal must be a positive number.');
    dispatch({
      type: 'upsertPlanPhase',
      phase: { id: `p-${Date.now().toString(36)}`, name: name.trim(), startWeek: s, endWeek: en, goal: goal.trim() || undefined, dsaGoal: dsa },
    });
    toast(`Phase "${name.trim()}" created`);
    onCreated(s);
    onClose();
  };

  return (
    <form onSubmit={submit} className="mt-2 bg-[#101010] rounded-2xl p-4 space-y-2">
      <SectionLabel>New phase</SectionLabel>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Offers and revision" className={fieldCls} autoFocus />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <label className="text-xs text-gray-400 space-y-1">
          <span>Start week</span>
          <input type="number" min={1} value={start} onChange={(e) => setStart(e.target.value)} className={fieldCls} />
        </label>
        <label className="text-xs text-gray-400 space-y-1">
          <span>End week (optional)</span>
          <input type="number" min={1} value={end} onChange={(e) => setEnd(e.target.value)} placeholder="open-ended" className={fieldCls} />
        </label>
        <label className="text-xs text-gray-400 space-y-1 col-span-2 sm:col-span-1">
          <span>DSA goal (optional)</span>
          <input type="number" min={1} value={dsaGoal} onChange={(e) => setDsaGoal(e.target.value)} placeholder="e.g. 450" className={fieldCls} />
        </label>
      </div>
      <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Goal line (optional)" className={fieldCls} />
      {error && <p className="text-xs text-red-400/70">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className={`${smallBtn} bg-primary text-black hover:opacity-90`}>
          Create phase
        </button>
        <button type="button" onClick={onClose} className={`${smallBtn} bg-black/50 text-gray-300 hover:text-primary`}>
          Cancel
        </button>
      </div>
    </form>
  );
}
