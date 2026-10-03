import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_FOCUS_SETTINGS, type FocusSample, type FocusSettings } from '../../../lib/focus/types';
import type { Action } from '../../../state/types';
import { FocusController, type FocusDeps } from './controller';

// The camera, frames, models and clock are all mocked. No ML runs here.
function setup(opts: { settings?: Partial<FocusSettings>; samples?: (t: number) => FocusSample | null; cameraError?: string } = {}) {
  let now = 1_000_000;
  const tracks = [{ stop: vi.fn() }];
  const stream = { getTracks: () => tracks, getVideoTracks: () => tracks } as unknown as MediaStream;
  const detectorClose = vi.fn();
  const dispatched: Action[] = [];
  const status: Record<string, unknown> = {};
  let settings: FocusSettings = { ...DEFAULT_FOCUS_SETTINGS, enabled: true, explained: true, calibration: { yaw: 0, pitch: 0, noseRel: 0.5 }, ...opts.settings };
  const sampleAt = opts.samples ?? (() => ({ face: { yaw: 0, pitch: 0, noseRel: 0.5 }, phoneScore: 0 }));
  const stopTicker = vi.fn();
  const effects = { warn: vi.fn(), clear: vi.fn(), flash: vi.fn() };

  const deps: FocusDeps = {
    openCamera: vi.fn(async () => {
      if (opts.cameraError) throw Object.assign(new Error('x'), { name: opts.cameraError });
      return stream;
    }),
    createFrameSource: () => ({
      grab: async () => (sampleAt(now) === null ? null : { close: vi.fn() }),
      lastFrameAt: () => (sampleAt(now) === null ? now - 60_000 : now),
      close: vi.fn(),
    }),
    loadDetector: vi.fn(async () => ({ detect: () => sampleAt(now)!, close: detectorClose })),
    startTicker: vi.fn(() => stopTicker),
    now: () => now,
    dispatch: (a) => dispatched.push(a),
    getSettings: () => settings,
    saveCalibration: (c) => {
      settings = { ...settings, calibration: c };
    },
    setStatus: (p) => Object.assign(status, p),
    effects,
  };
  const c = new FocusController(deps);
  /** Advance the mocked clock in 1 s ticks (the controller samples every 2 s). */
  const advance = async (ms: number, jitter: number[] = [0]) => {
    for (let i = 0; i < ms / 1000; i++) {
      now += 1000 + jitter[i % jitter.length];
      await c.tick();
    }
  };
  return { c, deps, tracks, detectorClose, dispatched, status, effects, stopTicker, advance, getSettings: () => settings, now: () => now };
}

const TARGET = { date: '2026-10-05', id: 'dsa1', title: 'DSA block 1' };

describe('camera lifecycle', () => {
  it('opens the camera while a stopwatch runs and stops the tracks when it pauses', async () => {
    const t = setup();
    await t.c.sync(TARGET);
    expect(t.deps.openCamera).toHaveBeenCalledTimes(1);
    expect(t.status.phase).toBe('watching');
    await t.c.sync(null); // stopwatch paused
    expect(t.tracks[0].stop).toHaveBeenCalled();
    expect(t.stopTicker).toHaveBeenCalled();
    expect(t.status).toMatchObject({ phase: 'off', stream: null });
  });

  it('turning the feature off stops the tracks and frees the models', async () => {
    const t = setup();
    await t.c.sync(TARGET);
    t.c.dispose();
    expect(t.tracks[0].stop).toHaveBeenCalled();
    expect(t.detectorClose).toHaveBeenCalled();
  });

  it('denied permission or no camera: a clear message, and nothing else happens', async () => {
    const denied = setup({ cameraError: 'NotAllowedError' });
    await denied.c.sync(TARGET);
    expect(denied.status.phase).toBe('denied');
    expect(String(denied.status.message)).toMatch(/denied/);
    const none = setup({ cameraError: 'NotFoundError' });
    await none.c.sync(TARGET);
    expect(none.status.phase).toBe('nocamera');
    expect(none.dispatched).toEqual([]);
  });
});

describe('calibration', () => {
  it('without a stored neutral pose, calibrates over 3 seconds first', async () => {
    const t = setup({ settings: { calibration: null }, samples: () => ({ face: { yaw: 22, pitch: -8, noseRel: 0.45 }, phoneScore: 0 }) });
    await t.c.sync(TARGET);
    expect(t.status.phase).toBe('calibrating');
    await t.advance(4000);
    expect(t.getSettings().calibration).toEqual({ yaw: 22, pitch: -8, noseRel: 0.45 });
    expect(t.status.phase).toBe('watching');
  });
});

describe('the stopwatch is never paused automatically unless the setting is on', () => {
  const away = () => ({ phoneScore: 0 }); // no face

  it('away for 10 minutes with auto-pause off: no timerPause, only warnings', async () => {
    const t = setup({ samples: away });
    await t.c.sync(TARGET);
    await t.advance(10 * 60_000);
    expect(t.dispatched.some((a) => a.type === 'timerPause')).toBe(false);
    expect(t.effects.warn).toHaveBeenCalled();
  });

  it('with "Pause the stopwatch if I am away for more than 5 minutes" on: one pause', async () => {
    const t = setup({ samples: away, settings: { autoPause: true } });
    await t.c.sync(TARGET);
    await t.advance(10 * 60_000);
    expect(t.dispatched.filter((a) => a.type === 'timerPause')).toHaveLength(1);
  });
});

describe('sampling cadence', () => {
  it('samples every 2 s even when timer ticks arrive a few ms early', async () => {
    const t = setup();
    const onSample = vi.fn();
    t.deps.onSample = onSample;
    await t.c.sync(TARGET);
    await t.advance(60_000, [1, -3]); // ticks 1 ms late, then 3 ms early
    const detects = onSample.mock.calls.length;
    expect(detects).toBeGreaterThanOrEqual(29); // ~60 s / 2 s, not ~60 s / 3 s
  });
});

describe('stats and the stalled feed', () => {
  it('flushes focus numbers to the running task every 30 s and on stop; they add up', async () => {
    const t = setup();
    await t.c.sync(TARGET);
    await t.advance(95_000);
    await t.c.sync(null);
    const adds = t.dispatched.filter((a): a is Extract<Action, { type: 'focusAdd' }> => a.type === 'focusAdd');
    expect(adds.length).toBeGreaterThanOrEqual(3);
    expect(adds.every((a) => a.date === TARGET.date && a.id === TARGET.id)).toBe(true);
    const total = adds.reduce((s, a) => s + a.delta.focused + a.delta.distracted + a.delta.away, 0);
    // 95 s of sampling, minus the first ~2 samples while smoothing warms up (unknown state isn't counted)
    expect(total).toBeGreaterThanOrEqual(85);
    expect(total).toBeLessThanOrEqual(95);
  });

  it('a stalled feed shows "Focus watch paused" and counts nothing as focused', async () => {
    let stalled = false;
    const t = setup({ samples: () => (stalled ? null : { face: { yaw: 0, pitch: 0, noseRel: 0.5 }, phoneScore: 0 }) });
    await t.c.sync(TARGET);
    await t.advance(10_000);
    stalled = true;
    await t.advance(60_000);
    expect(t.status.phase).toBe('paused');
    expect(t.status.state).toBeNull();
    await t.c.sync(null);
    const focused = t.dispatched.filter((a): a is Extract<Action, { type: 'focusAdd' }> => a.type === 'focusAdd').reduce((s, a) => s + a.delta.focused, 0);
    expect(focused).toBeLessThanOrEqual(10); // only the 10 s before the stall
  });
});
