import { AnimatePresence, motion } from 'framer-motion';
import { Flame, Snowflake } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { addDays, differenceInCalendarDays, format } from 'date-fns';
import { PageTitle } from '../../components/PageTitle';
import { Card, SectionLabel, useToast } from '../../components/ui';
import { WordsPullUp } from '../../components/WordsPullUp';
import { HOURS_TARGET } from '../../data/plan';
import { isSunday, toKey, weekDays, weekNumberFor, weekStart } from '../../lib/dates';
import { heatmapRange } from '../../lib/planModel';
import { useNow } from '../../lib/hooks';
import { canFreezeYesterday, currentStreak, daysCounted, daysSoFar, freezeUsedInWeek, longestStreak, statsFor } from '../../lib/streak';
import { useStore } from '../../state/store';
import { effectiveHours, formatHours } from '../../lib/hours';

const TEXT = { color: '#E1E0CC' };
const ROWS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// JS getDay(): Sun=0..Sat=6. Plan weeks start on Friday (5).
const DOW = [1, 2, 3, 4, 5, 6, 0];

function cellFill(pct: number) {
  if (pct <= 0) return '#1a1a1a';
  if (pct < 40) return 'rgba(222, 219, 200, 0.2)';
  if (pct < 70) return 'rgba(222, 219, 200, 0.45)';
  if (pct < 100) return 'rgba(222, 219, 200, 0.75)';
  return '#DEDBC8';
}

interface Tip {
  date: Date;
  x: number;
  y: number;
}

export default function Streak() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const now = useNow();
  const streak = currentStreak(state, now);
  const longest = longestStreak(state, now);
  const counted = daysCounted(state, now);
  const [tip, setTip] = useState<Tip | null>(null);

  const yesterday = addDays(now, -1);
  const freeze = canFreezeYesterday(state, now);
  const week = weekNumberFor(now);
  const freezeUsed = freezeUsedInWeek(state, weekNumberFor(yesterday));
  const range = heatmapRange(state.plan, now);
  const heatWeeks = Array.from({ length: range.weeks }, (_, i) => ({ n: i + 1, start: weekStart(i + 1) }));
  const freezesUsedTotal = heatWeeks.filter((w) => w.n <= week && freezeUsedInWeek(state, w.n)).length;

  // Keep the current week in view once the heatmap is wider than its card.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = scrollRef.current;
    const cell = box?.querySelector<HTMLElement>('[data-current-week]');
    if (!box || !cell) return;
    box.scrollLeft = Math.max(0, cell.offsetLeft - box.clientWidth / 2 + cell.offsetWidth / 2);
  }, [week, range.weeks]);

  const showTip = (date: Date, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setTip({ date, x: r.left + r.width / 2, y: r.top });
  };

  const tipDay = tip ? state.days[toKey(tip.date)] : undefined;
  const tipStats = tip ? statsFor(state, tip.date) : null;
  const tipHours = tip ? effectiveHours(state, tip.date) : null;

  return (
    <div>
      <PageTitle first="Streak," second="don't break the chain." />

      {/* Big number */}
      <Card className="mb-4 flex flex-col md:flex-row md:items-end gap-4 md:gap-10">
        <div className="flex items-end gap-3">
          <span className="text-[18vw] md:text-[10vw] leading-[0.8] tracking-[-0.06em]" style={TEXT}>
            <WordsPullUp key={streak} text={String(streak)} />
          </span>
          <Flame className="w-10 h-10 md:w-14 md:h-14 text-amber-300 mb-2" />
        </div>
        <div className="flex flex-wrap gap-2 md:pb-3">
          <Stat label="Current" value={`${streak} day${streak === 1 ? '' : 's'}`} />
          <Stat label="Longest" value={`${longest} day${longest === 1 ? '' : 's'}`} />
          <Stat label="Days counted" value={`${counted} / ${daysSoFar(now)}`} />
        </div>
      </Card>

      {/* Heatmap */}
      <Card className="mb-4">
        <SectionLabel right={<Legend />}>
          {format(range.from, 'd MMM yyyy')} – {format(range.to, 'd MMM yyyy')}
        </SectionLabel>
        <div ref={scrollRef} className="overflow-x-auto scrollbar-thin -mx-1 px-1 pb-2" onScroll={() => setTip(null)}>
          <div
            className="grid gap-1.5 w-full"
            style={{ gridTemplateColumns: `32px repeat(${range.weeks}, minmax(30px, 1fr))`, minWidth: 32 + range.weeks * 36 }}
          >
            <span />
            {heatWeeks.map((w) => (
              <span
                key={w.n}
                data-current-week={w.n === week ? '' : undefined}
                className={`text-[10px] text-center ${w.n === week ? 'text-primary' : 'text-gray-500'}`}
              >
                W{w.n}
              </span>
            ))}
            {ROWS.map((label, r) => (
              <Row key={label} label={label}>
                {heatWeeks.map((w) => {
                  const offset = (DOW[r] - 5 + 7) % 7;
                  const date = addDays(w.start, offset);
                  const future = differenceInCalendarDays(date, now) > 0;
                  const isToday = differenceInCalendarDays(date, now) === 0;
                  const s = statsFor(state, date);
                  const frozen = !!state.days[toKey(date)]?.frozen;
                  return (
                    <button
                      key={w.n}
                      type="button"
                      aria-label={`${format(date, 'EEE d MMM')}: ${s.pct}%`}
                      onMouseEnter={(e) => showTip(date, e.currentTarget)}
                      onMouseLeave={() => setTip(null)}
                      onFocus={(e) => showTip(date, e.currentTarget)}
                      onBlur={() => setTip(null)}
                      onClick={(e) => showTip(date, e.currentTarget)}
                      className={`h-8 sm:h-9 min-w-[30px] rounded-md flex items-center justify-center transition-transform hover:scale-110 ${
                        isToday ? 'ring-1 ring-primary ring-offset-2 ring-offset-[#101010]' : ''
                      }`}
                      style={future ? { border: '1px solid #2a2a2a', background: 'transparent' } : { background: cellFill(s.pct) }}
                    >
                      {frozen && <Snowflake className="w-3 h-3 text-sky-200/80" />}
                    </button>
                  );
                })}
              </Row>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-gray-500 mt-2">Columns are plan weeks (Fri–Thu), from week 1 on. Tap a day for details.</p>
      </Card>

      <AnimatePresence>
        {tip && tipStats && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-full bg-black border border-white/10 rounded-lg px-3 py-2 text-xs whitespace-nowrap shadow-xl"
            style={{ left: tip.x, top: tip.y - 8 }}
          >
            <p style={TEXT}>{format(tip.date, 'EEE d MMM')}</p>
            <p className="text-gray-400">
              {tipStats.pct}% {isSunday(tip.date) ? 'tasks' : 'blocks'} done{tipStats.counts ? ' · counted' : ''}
              {tipDay?.frozen ? ' · frozen' : ''}
            </p>
            <p className="text-gray-400">
              DSA {tipDay?.dsa ?? 0} · {formatHours(tipHours?.hours ?? 0)} hrs{tipHours?.source === 'manual' ? ' (manual)' : ''}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Freeze */}
        <Card>
          <SectionLabel right={<Snowflake className="w-4 h-4 text-sky-200/70" />}>1 freeze per week</SectionLabel>
          <p className="text-2xl" style={TEXT}>
            {freezeUsed ? '0' : '1'} <span className="text-sm text-gray-500">available this week</span>
          </p>
          <p className="text-xs text-gray-500 mt-1">{freezesUsedTotal} used across the plan. A frozen day keeps the streak alive but doesn't add to it.</p>
          <p className="text-sm text-gray-400 mt-4">{freeze.reason}</p>
          {freeze.ok && (
            <button
              type="button"
              onClick={() => {
                dispatch({ type: 'freeze', date: toKey(yesterday) });
                toast('Yesterday frozen');
              }}
              className="mt-3 min-h-[44px] px-5 rounded-full bg-primary text-black text-sm inline-flex items-center gap-2 hover:opacity-90"
            >
              <Snowflake className="w-4 h-4" /> Use freeze for yesterday
            </button>
          )}
        </Card>

        {/* Hours chart */}
        <Card>
          <SectionLabel right={<span className="text-xs text-gray-500">Week {week} · target {HOURS_TARGET} hrs</span>}>Hours studied</SectionLabel>
          <HoursChart days={weekDays(week)} now={now} />
        </Card>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="text-[10px] text-gray-500 flex items-center">{label}</span>
      {children}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#212121] rounded-xl px-4 py-3 min-w-[120px]">
      <p className="text-lg" style={TEXT}>
        {value}
      </p>
      <p className="text-[11px] text-gray-500">{label}</p>
    </div>
  );
}

function Legend() {
  return (
    <span className="hidden sm:flex items-center gap-1 text-[10px] text-gray-500">
      Less
      {[0, 20, 50, 80, 100].map((p) => (
        <span key={p} className="w-3 h-3 rounded-sm" style={{ background: cellFill(p) }} />
      ))}
      More
    </span>
  );
}

function HoursChart({ days, now }: { days: Date[]; now: Date }) {
  const { state } = useStore();
  const W = 320;
  const H = 170;
  const pad = { l: 24, r: 8, t: 10, b: 24 };
  const values = days.map((d) => effectiveHours(state, d));
  // 0–12 scale, growing in steps of 4 if a day goes beyond it.
  const max = Math.max(12, Math.ceil(Math.max(...values.map((v) => v.hours)) / 4) * 4);
  const ticks = Array.from({ length: max / 4 + 1 }, (_, i) => i * 4);
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const bw = innerW / days.length;
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Hours studied this week">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="#1f1f1f" />
          <text x={pad.l - 6} y={y(v) + 3} textAnchor="end" fontSize="9" fill="#6b7280">
            {v}
          </text>
        </g>
      ))}
      {days.map((d, i) => {
        const hrs = values[i].hours;
        const isToday = differenceInCalendarDays(d, now) === 0;
        const future = differenceInCalendarDays(d, now) > 0;
        const h = (hrs / max) * innerH;
        const x = pad.l + i * bw + bw * 0.2;
        return (
          <g key={i}>
            <motion.rect
              x={x}
              width={bw * 0.6}
              rx={3}
              initial={{ height: 0, y: y(0) }}
              animate={{ height: h, y: y(0) - h }}
              transition={{ duration: 0.6, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
              fill={hrs >= HOURS_TARGET ? '#DEDBC8' : isToday ? 'rgba(222,219,200,0.75)' : 'rgba(222,219,200,0.4)'}
            />
            {future && <rect x={x} y={y(0) - 2} width={bw * 0.6} height={2} fill="#2a2a2a" />}
            <text x={x + bw * 0.3} y={H - 8} textAnchor="middle" fontSize="9" fill={isToday ? '#DEDBC8' : '#6b7280'}>
              {format(d, 'EEEEE')}
            </text>
          </g>
        );
      })}
      <line x1={pad.l} x2={W - pad.r} y1={y(HOURS_TARGET)} y2={y(HOURS_TARGET)} stroke="#FCD34D" strokeOpacity={0.6} strokeDasharray="4 3" />
      <text x={W - pad.r} y={y(HOURS_TARGET) - 4} textAnchor="end" fontSize="9" fill="#FCD34D" fillOpacity={0.8}>
        {HOURS_TARGET} hr target
      </text>
    </svg>
  );
}
