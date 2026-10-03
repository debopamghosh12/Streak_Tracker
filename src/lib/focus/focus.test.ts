import { describe, expect, it } from 'vitest';
import { initialState, reducer } from '../../state/reducer';
import type { Action, TrackerState } from '../../state/types';
import { addTime, calibrate, classify, focusPct, headPose, initialSmoother, noseRel, smooth } from './classify';
import { dayFocus, timerFocus } from './dayFocus';
import { LIMITS, emptyStats, type FocusSample, type FocusState } from './types';
import { initialWarnState, stepWarnings, type WarnEvent, type WarnState } from './warnings';

// Mocked clock: plain numbers. No camera, no models.
const face = (yaw: number, pitch: number, nose = 0.5): FocusSample => ({ face: { yaw, pitch, noseRel: nose }, phoneScore: 0 });
const calib = { yaw: 0, pitch: 0, noseRel: 0.5 };
const opts = { screenOnly: false };

describe('classification', () => {
  it('phone wins over everything (score ≥ 0.5)', () => {
    expect(classify({ ...face(0, 0), phoneScore: 0.6 }, calib, opts)).toBe('phone');
    expect(classify({ phoneScore: 0.5 }, calib, opts)).toBe('phone'); // even with no face
    expect(classify({ ...face(0, 0), phoneScore: 0.49 }, calib, opts)).toBe('focused');
  });

  it('no face = away; turned beyond 25° yaw = looking away', () => {
    expect(classify({ phoneScore: 0 }, calib, opts)).toBe('away');
    expect(classify(face(20, 0), calib, opts)).toBe('focused');
    expect(classify(face(-26, 0), calib, opts)).toBe('lookingAway');
  });

  it('head down (writing in a notebook) is focused by default; looking away with "I only study on screen"', () => {
    const down = face(0, 30, 0.9); // pitched 30°, nose dropped below the eye line → head down
    const up = face(0, -30, 0.2); // pitched the other way, nose rises → head up
    expect(classify(down, calib, opts)).toBe('focused');
    expect(classify(down, calib, { screenOnly: true })).toBe('lookingAway');
    expect(classify(up, calib, opts)).toBe('lookingAway');
    expect(classify(face(0, 15, 0.7), calib, { screenOnly: true })).toBe('focused'); // within 20°
  });

  it('uses the calibrated neutral pose (e.g. an external monitor off to the side)', () => {
    const side = { yaw: 30, pitch: -10, noseRel: 0.4 };
    expect(classify(face(40, -5), side, opts)).toBe('focused'); // 10° from neutral
    expect(classify(face(0, -10), side, opts)).toBe('lookingAway'); // 30° from neutral, though facing the camera
    expect(classify(face(0, -10), null, opts)).toBe('focused'); // without calibration: camera = neutral
  });

  it('calibration averages the face poses seen; none seen = null', () => {
    expect(calibrate([face(10, 2, 0.4), face(20, 4, 0.6), { phoneScore: 0 }])).toEqual({ yaw: 15, pitch: 3, noseRel: 0.5 });
    expect(calibrate([{ phoneScore: 0 }])).toBeNull();
  });

  it('reads yaw/pitch from the facial transformation matrix and nose drop from landmarks', () => {
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    expect(headPose(identity).yaw).toBeCloseTo(0, 6);
    expect(headPose(identity).pitch).toBeCloseTo(0, 6);
    const a = (30 * Math.PI) / 180; // rotation about Y (column-major)
    const rotY = [Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1];
    expect(Math.abs(headPose(rotY).yaw)).toBeCloseTo(30, 5);
    const lm = Array.from({ length: 300 }, () => ({ x: 0, y: 0 }));
    lm[33] = { x: 0.4, y: 0.4 };
    lm[263] = { x: 0.6, y: 0.4 };
    lm[1] = { x: 0.5, y: 0.5 };
    expect(noseRel(lm)).toBeCloseTo(0.5, 5);
  });
});

describe('smoothing', () => {
  const run = (raws: FocusState[]) => raws.reduce((s, r) => smooth(s, r), initialSmoother()).state;
  it('changes state only after 3 consecutive samples agree', () => {
    expect(run(['focused', 'focused'])).toBeNull();
    expect(run(['focused', 'focused', 'focused'])).toBe('focused');
    expect(run(['focused', 'focused', 'focused', 'phone', 'phone'])).toBe('focused');
    expect(run(['focused', 'focused', 'focused', 'phone', 'phone', 'phone'])).toBe('phone');
    expect(run(['focused', 'focused', 'focused', 'away', 'phone', 'away', 'phone'])).toBe('focused'); // flicker ignored
  });
});

/* ---------------- warnings ---------------- */

const SETTINGS = { phoneSec: 20, awayMin: 2, autoPause: false, breakUntil: null as number | null };

/** Feeds one smoothed state per 2 s sample from t0 to t1 (ms) and collects events. */
function feed(ws: WarnState, state: FocusState | null, t0: number, t1: number, extra: Partial<typeof SETTINGS> = {}) {
  const events: (WarnEvent & { at: number })[] = [];
  for (let t = t0; t <= t1; t += 2000) {
    const r = stepWarnings(ws, { now: t, state, ...SETTINGS, ...extra });
    ws = r.ws;
    events.push(...r.events.map((e) => ({ ...e, at: t })));
  }
  return { ws, events };
}

describe('warning timing', () => {
  it('phone in view 20 s → "Phone down."; looking away / away 2 min → "Still studying?"', () => {
    const phone = feed(initialWarnState(), 'phone', 0, 30_000);
    expect(phone.events[0]).toMatchObject({ type: 'warn', kind: 'phone', at: 20_000 });
    const away = feed(initialWarnState(), 'lookingAway', 0, 60_000);
    expect(away.events).toHaveLength(0);
    const more = feed(away.ws, 'away', 62_000, 130_000); // away and looking away both count, continuously
    expect(more.events[0]).toMatchObject({ type: 'warn', kind: 'away', at: 120_000 });
    // thresholds are settings
    expect(feed(initialWarnState(), 'phone', 0, 30_000, { phoneSec: 10 }).events[0].at).toBe(10_000);
    expect(feed(initialWarnState(), 'away', 0, 400_000, { awayMin: 5 }).events[0].at).toBe(300_000);
  });

  it('repeats every 2 minutes while still distracted, at most 5 warnings, then stops nagging', () => {
    const { events } = feed(initialWarnState(), 'phone', 0, 30 * 60_000);
    const warns = events.filter((e) => e.type === 'warn');
    expect(warns.map((e) => e.at)).toEqual([20_000, 140_000, 260_000, 380_000, 500_000]);
    expect(warns.map((e) => (e.type === 'warn' ? e.count : 0))).toEqual([1, 2, 3, 4, 5]);
  });

  it('clears by itself after 6 s focused, and a new episode can warn again', () => {
    let r = feed(initialWarnState(), 'phone', 0, 22_000);
    const back = feed(r.ws, 'focused', 24_000, 32_000);
    expect(back.events).toEqual([{ type: 'clear', at: 30_000 }]); // focused since 24 s → clear at 30 s
    expect(back.ws.active).toBeNull();
    r = feed(back.ws, 'phone', 34_000, 60_000);
    expect(r.events[0]).toMatchObject({ type: 'warn', kind: 'phone', count: 1, at: 54_000 });
  });

  it('a short focused blip (< 6 s) does not clear the warning', () => {
    const r = feed(initialWarnState(), 'phone', 0, 22_000);
    const blip = feed(r.ws, 'focused', 24_000, 28_000);
    expect(blip.events).toEqual([]);
    expect(blip.ws.active).not.toBeNull();
  });

  it('Break silences warnings until it ends', () => {
    const quiet = feed(initialWarnState(), 'phone', 0, 9 * 60_000, { breakUntil: 10 * 60_000 });
    expect(quiet.events).toEqual([]);
    const after = feed(quiet.ws, 'phone', 10 * 60_000, 10 * 60_000 + 2000, { breakUntil: 10 * 60_000 });
    expect(after.events[0]).toMatchObject({ type: 'warn', kind: 'phone' });
  });

  it('an unknown state (warming up or feed stalled) never warns', () => {
    expect(feed(initialWarnState(), null, 0, 10 * 60_000).events).toEqual([]);
  });
});

describe('the stopwatch is never paused unless auto-pause is on', () => {
  it('away for 10 minutes: no auto-pause by default; with the setting, exactly one after 5 minutes', () => {
    expect(feed(initialWarnState(), 'away', 0, 10 * 60_000).events.some((e) => e.type === 'autoPause')).toBe(false);
    const on = feed(initialWarnState(), 'away', 0, 10 * 60_000, { autoPause: true }).events.filter((e) => e.type === 'autoPause');
    expect(on).toHaveLength(1);
    expect(on[0].at).toBe(LIMITS.autoPauseMs + 2000);
    // looking away (face present) never auto-pauses
    expect(feed(initialWarnState(), 'lookingAway', 0, 10 * 60_000, { autoPause: true }).events.some((e) => e.type === 'autoPause')).toBe(false);
  });
});

describe('focus stats', () => {
  it('adds seconds by state; phone counts as distracted; pickups are separate phone episodes', () => {
    let s = emptyStats();
    let prev: FocusState | null = null;
    const seq: FocusState[] = ['focused', 'focused', 'phone', 'phone', 'focused', 'lookingAway', 'away', 'phone', 'focused'];
    for (const st of seq) {
      s = addTime(s, prev, st, 2000);
      prev = st;
    }
    expect(s).toEqual({ focused: 8, distracted: 8, away: 2, pickups: 2 });
    expect(focusPct(s)).toBe(44);
    expect(focusPct(emptyStats())).toBeNull();
  });

  it('add up correctly across pause and resume, and survive a midnight split and "Edit time"', () => {
    const MON = '2026-10-05';
    const T0 = new Date(2026, 9, 5, 21, 0).getTime();
    const run = (s: TrackerState, ...as: Action[]) => as.reduce(reducer, s);
    let s = run(
      initialState(MON),
      { type: 'timerStart', date: MON, id: 'dsa2', at: T0 },
      { type: 'focusAdd', date: MON, id: 'dsa2', delta: { focused: 600, distracted: 60, away: 0, pickups: 1 } },
      { type: 'timerPause', date: MON, id: 'dsa2', at: T0 + 11 * 60_000 },
      { type: 'focusAdd', date: MON, id: 'dsa2', delta: { focused: 30, distracted: 0, away: 10, pickups: 0 } }, // flushed just after Pause
      { type: 'timerStart', date: MON, id: 'dsa2', at: T0 + 20 * 60_000 },
      { type: 'focusAdd', date: MON, id: 'dsa2', delta: { focused: 300, distracted: 30, away: 20, pickups: 2 } },
    );
    const t = s.days[MON].timers.dsa2;
    expect(t.sessions[0].focus).toEqual({ focused: 630, distracted: 60, away: 10, pickups: 1 });
    expect(t.focusRun).toEqual({ focused: 300, distracted: 30, away: 20, pickups: 2 });
    expect(timerFocus(t)).toEqual({ focused: 930, distracted: 90, away: 30, pickups: 3 });
    expect(dayFocus(s.days[MON])).toMatchObject({ focused: 930, pickups: 3, pct: 89 });

    s = run(s, { type: 'timerSetTime', date: MON, id: 'dsa2', ms: 30 * 60_000, at: T0 + 40 * 60_000 });
    expect(timerFocus(s.days[MON].timers.dsa2)).toEqual({ focused: 930, distracted: 90, away: 30, pickups: 3 }); // kept

    s = run(s, { type: 'rollover', today: '2026-10-06' }); // runs past midnight: running focus closes with Monday's session
    expect(timerFocus(s.days[MON].timers.dsa2)).toEqual({ focused: 930, distracted: 90, away: 30, pickups: 3 });
  });
});
