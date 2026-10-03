import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FOCUS_SETTINGS, type FocusSettings } from '../../lib/focus/types';
import type { FocusStatus } from './focusStatus';
import { attachPreview, detachPreview, pipBackground, type VideoSink } from './pipPreview';
import { FocusController, type FocusDeps } from './runtime/controller';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

// No DOM and no camera: a fake <video>, a fake stream and a mocked controller environment.
const fakeVideo = (fail = false) => {
  const v: VideoSink & { plays: number } = {
    srcObject: null,
    plays: 0,
    play: vi.fn(async () => {
      v.plays++;
      if (fail) throw new Error('NotAllowedError');
    }),
  };
  return v;
};

function setup(settings: Partial<FocusSettings> = {}) {
  let now = 1_000_000;
  const tracks = [{ stop: vi.fn(), clone: vi.fn(), readyState: 'live' }];
  const stream = { getTracks: () => tracks, getVideoTracks: () => tracks } as unknown as MediaStream;
  const status: Partial<FocusStatus> = {};
  const detect = vi.fn(() => ({ face: { yaw: 0, pitch: 0, noseRel: 0.5 }, phoneScore: 0 }));
  const deps: FocusDeps = {
    openCamera: vi.fn(async () => stream),
    createFrameSource: () => ({ grab: async () => ({ close: vi.fn() }), lastFrameAt: () => now, close: vi.fn() }),
    loadDetector: async () => ({ detect, close: vi.fn() }),
    startTicker: () => () => {},
    now: () => now,
    dispatch: () => {},
    getSettings: () => ({ ...DEFAULT_FOCUS_SETTINGS, enabled: true, explained: true, calibration: { yaw: 0, pitch: 0, noseRel: 0.5 }, ...settings }),
    saveCalibration: () => {},
    setStatus: (p) => Object.assign(status, p),
    effects: { warn: vi.fn(), clear: vi.fn(), flash: vi.fn() },
  };
  const c = new FocusController(deps);
  const advance = async (ms: number) => {
    for (let i = 0; i < ms / 1000; i++) {
      now += 1000;
      await c.tick();
    }
  };
  /** What the pop-out does whenever the status stream changes (PipView's effect). */
  const syncPreview = async (video: VideoSink) => {
    if (pipBackground({ cameraOn: true, stream: status.stream ?? null, reducedMotion: false, failed: false }) === 'camera') await attachPreview(video, status.stream!);
    else detachPreview(video);
  };
  return { c, deps, stream, tracks, status, detect, advance, syncPreview };
}

const TARGET = { date: '2026-10-05', id: 'dsa1', title: 'DSA block 1' };

describe('pop-out camera background', () => {
  it('reuses the stream Focus watch already opened (getUserMedia is not called again)', async () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const t = setup();
    await t.c.sync(TARGET);
    const video = fakeVideo();
    await t.syncPreview(video);
    expect(video.srcObject).toBe(t.stream);
    expect(t.deps.openCamera).toHaveBeenCalledTimes(1); // only the controller's own open
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('does not change the sampling rate or add a detection loop', async () => {
    const without = setup();
    await without.c.sync(TARGET);
    await without.advance(60_000);
    const withPreview = setup();
    await withPreview.c.sync(TARGET);
    await withPreview.syncPreview(fakeVideo());
    await withPreview.advance(60_000);
    expect(withPreview.detect).toHaveBeenCalledTimes(without.detect.mock.calls.length);
  });

  it('black until the stream is ready, then the camera', async () => {
    const t = setup();
    const video = fakeVideo();
    await t.syncPreview(video); // pop-out opened before the stopwatch started
    expect(video.srcObject).toBeNull();
    await t.c.sync(TARGET);
    await t.syncPreview(video);
    expect(video.srcObject).toBe(t.stream);
  });

  it('falls back to black with reduced motion, when turned off, or when the video fails to play', async () => {
    const stream = { getVideoTracks: () => [{ readyState: 'live' }] } as unknown as MediaStream;
    expect(pipBackground({ cameraOn: true, stream, reducedMotion: false, failed: false })).toBe('camera');
    expect(pipBackground({ cameraOn: true, stream, reducedMotion: true, failed: false })).toBe('black');
    expect(pipBackground({ cameraOn: false, stream, reducedMotion: false, failed: false })).toBe('black');
    expect(pipBackground({ cameraOn: true, stream, reducedMotion: false, failed: true })).toBe('black');
    expect(pipBackground({ cameraOn: true, stream: null, reducedMotion: false, failed: false })).toBe('black');
    expect(await attachPreview(fakeVideo(true), stream)).toEqual({ ok: false, reason: 'video.play() was rejected (Error)' });
  });
});

describe('the preview uses the live camera track', () => {
  it("plays the controller's own live track and never clones it, so nothing extra can keep the camera on", async () => {
    const t = setup();
    await t.c.sync(TARGET);
    const video = fakeVideo();
    await expect(attachPreview(video, t.stream)).resolves.toEqual({ ok: true });
    expect(video.srcObject).toBe(t.stream);
    expect(video.plays).toBe(1); // play() called explicitly
    expect(t.tracks[0].clone).not.toHaveBeenCalled();
    await t.c.sync(null); // stopwatch paused
    await t.syncPreview(video);
    expect(video.srcObject).toBeNull();
    expect(t.tracks.every((tr) => tr.stop.mock.calls.length > 0)).toBe(true); // every track (no clones exist) stopped
  });

  it('an ended track is not attached; the reason is reported', async () => {
    const ended = { getVideoTracks: () => [{ readyState: 'ended' }] } as unknown as MediaStream;
    const video = fakeVideo();
    await expect(attachPreview(video, ended)).resolves.toEqual({ ok: false, reason: 'the camera track is not live' });
    expect(video.srcObject).toBeNull();
    expect(video.plays).toBe(0);
  });
});

describe('clean-up: srcObject cleared, camera tracks stop exactly as before', () => {
  it('stopwatch pauses: srcObject cleared and tracks stopped', async () => {
    const t = setup();
    await t.c.sync(TARGET);
    const video = fakeVideo();
    await t.syncPreview(video);
    await t.c.sync(null); // paused
    await t.syncPreview(video);
    expect(video.srcObject).toBeNull();
    expect(t.tracks[0].stop).toHaveBeenCalled();
  });

  it('feature turned off: srcObject cleared and tracks stopped', async () => {
    const t = setup();
    await t.c.sync(TARGET);
    const video = fakeVideo();
    await t.syncPreview(video);
    t.c.dispose();
    await t.syncPreview(video);
    expect(video.srcObject).toBeNull();
    expect(t.tracks[0].stop).toHaveBeenCalled();
  });

  it('pop-out closed: srcObject cleared; tracks stop when the stopwatch pauses, as before', async () => {
    const t = setup();
    await t.c.sync(TARGET);
    const video = fakeVideo();
    await t.syncPreview(video);
    detachPreview(video); // the pop-out's unmount clean-up
    expect(video.srcObject).toBeNull();
    // Closing the pop-out doesn't touch the camera: detection still uses it while the stopwatch runs…
    expect(t.tracks[0].stop).not.toHaveBeenCalled();
    await t.advance(4000);
    expect(t.detect).toHaveBeenCalled();
    // …and the tracks stop exactly as they always did.
    await t.c.sync(null);
    expect(t.tracks[0].stop).toHaveBeenCalled();
  });
});

describe('the background choice is saved', () => {
  it('defaults to camera on; toggling is saved and restored on the next load', async () => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
    });
    vi.resetModules();
    let mod = await import('./focusSettings');
    expect(mod.getFocusSettings().pipCamera).toBe(true);
    mod.updateFocusSettings({ pipCamera: false });
    vi.resetModules(); // a fresh page load
    mod = await import('./focusSettings');
    expect(mod.getFocusSettings().pipCamera).toBe(false);
    mod.updateFocusSettings({ pipCamera: true });
    vi.resetModules();
    mod = await import('./focusSettings');
    expect(mod.getFocusSettings().pipCamera).toBe(true);
  });
});
