/**
 * Focus watch controller. Runs only while a stopwatch is running: opens the camera, samples one
 * frame every 2 s, classifies it on-device, keeps numbers (never images), raises warnings and
 * saves focus stats through the normal store/storage path. All browser APIs come in as `deps`
 * so the whole loop can be tested with a mocked camera and mocked models.
 */
import { addTime, calibrate, classify, initialSmoother, smooth, type Smoother } from '../../../lib/focus/classify';
import { LIMITS, emptyStats, type FocusSample, type FocusSettings, type FocusStats } from '../../../lib/focus/types';
import { WARNING_TEXT, initialWarnState, stepWarnings, type WarnState, type WarningKind } from '../../../lib/focus/warnings';
import type { Action } from '../../../state/types';
import type { FocusPhase, FocusStatus } from '../focusStatus';

/** Something MediaPipe can read (VideoFrame / ImageBitmap / canvas), closed after use if closable. */
export type Frame = object & { close?: () => void };

export interface FrameSource {
  /** The newest frame, or null when none is available. */
  grab(): Promise<Frame | null>;
  /** When the last frame arrived (epoch ms). */
  lastFrameAt(): number;
  close(): void;
}

export interface Detector {
  detect(frame: Frame): FocusSample;
  close(): void;
}

export interface Target {
  date: string;
  id: string;
  title: string;
}

export interface FocusDeps {
  openCamera(): Promise<MediaStream>;
  createFrameSource(stream: MediaStream): FrameSource;
  loadDetector(): Promise<Detector>;
  /** Background-safe repeating timer (a Web Worker in the browser). Returns a stop function. */
  startTicker(everyMs: number, onTick: () => void): () => void;
  now(): number;
  dispatch(action: Action): void;
  getSettings(): FocusSettings;
  saveCalibration(c: FocusSettings['calibration']): void;
  setStatus(patch: Partial<FocusStatus>): void;
  effects: {
    warn(kind: WarningKind, text: string, count: number): void;
    clear(): void;
    /** Called every tick while a warning is active (tab title flashing). */
    flash(on: boolean): void;
  };
  /** Dev-only measurement hook (sample timestamps); not wired in production. */
  onSample?(info: { at: number; ok: boolean; phase: FocusPhase }): void;
}

const TICK_MS = 1000;
const FLUSH_MS = 30_000;
const CALIBRATION_MS = 3000;
/** Timer ticks arrive a few ms early or late; without slack a 2 s cadence slips to every 3 s. */
const TICK_SLACK_MS = 250;

export class FocusController {
  private target: Target | null = null;
  private stream: MediaStream | null = null;
  private source: FrameSource | null = null;
  private detector: Detector | null = null;
  private stopTicker: (() => void) | null = null;
  private busy = false;
  private smoother: Smoother = initialSmoother();
  private warn: WarnState = initialWarnState();
  private pending: FocusStats = emptyStats();
  private lastSampleAt: number | null = null;
  private lastFlushAt = 0;
  private nextSampleAt = 0;
  private calibratingUntil: number | null = null;
  private calibrationSamples: FocusSample[] = [];
  private breakUntil: number | null = null;
  private warningActive = false;
  private flashOn = false;
  private phase: FocusPhase = 'off';
  private starting: Promise<void> | null = null;

  constructor(private deps: FocusDeps) {}

  /** Call whenever the running stopwatch (or the enabled setting) changes. null = stop watching. */
  async sync(target: Target | null): Promise<void> {
    const same = target && this.target && target.date === this.target.date && target.id === this.target.id;
    if (same) {
      this.target = target;
      return;
    }
    this.flush();
    if (!target) return this.stop();
    const switching = !!this.target;
    this.target = target;
    this.resetEpisode();
    this.deps.setStatus({ date: target.date, taskId: target.id, pending: emptyStats(), state: null });
    if (switching && this.stream) return; // camera already on: keep it
    this.starting = this.start();
    await this.starting;
  }

  private async start() {
    this.setPhase('loading');
    try {
      this.detector ??= await this.deps.loadDetector();
    } catch {
      this.setPhase('error', 'Focus watch could not load its on-device models. Check your connection and try again.');
      return;
    }
    if (!this.target) return; // stopped while loading
    try {
      this.stream = await this.deps.openCamera();
    } catch (err) {
      const name = (err as { name?: string })?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') this.setPhase('denied', 'Camera permission was denied, so Focus watch is off for now. Your stopwatch keeps running.');
      else this.setPhase('nocamera', 'No camera was found, so Focus watch is off for now. Your stopwatch keeps running.');
      return;
    }
    if (!this.target) return this.stop();
    this.source = this.deps.createFrameSource(this.stream);
    this.deps.setStatus({ stream: this.stream });
    const t = this.deps.now();
    this.lastFlushAt = t;
    this.nextSampleAt = t;
    if (!this.deps.getSettings().calibration) this.startCalibration();
    else this.setPhase('watching');
    this.stopTicker = this.deps.startTicker(TICK_MS, () => void this.tick());
  }

  /** Stops the camera (tracks stop → camera light off). Models stay loaded until dispose(). */
  stop() {
    this.stopTicker?.();
    this.stopTicker = null;
    this.source?.close();
    this.source = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.target = null;
    this.calibratingUntil = null;
    if (this.warningActive) this.deps.effects.clear();
    this.warningActive = false;
    this.deps.effects.flash(false);
    this.resetEpisode();
    this.setPhase('off');
    this.deps.setStatus({ stream: null, state: null, taskId: null, date: null, warning: null, pending: emptyStats(), titleAlert: false });
  }

  /** Feature switched off: stop the camera and free the models. */
  dispose() {
    this.flush();
    this.stop();
    this.detector?.close();
    this.detector = null;
  }

  recalibrate() {
    if (this.stream) this.startCalibration();
    else this.deps.saveCalibration(null); // calibrates on the next start
  }

  takeBreak(minutes: number) {
    this.breakUntil = this.deps.now() + minutes * 60_000;
    this.deps.setStatus({ breakUntil: this.breakUntil });
    if (this.warningActive) {
      this.warningActive = false;
      this.deps.effects.clear();
      this.deps.effects.flash(false);
      this.deps.setStatus({ warning: null, titleAlert: false });
    }
  }

  endBreak() {
    this.breakUntil = null;
    this.deps.setStatus({ breakUntil: null });
  }

  private startCalibration() {
    this.calibratingUntil = this.deps.now() + CALIBRATION_MS;
    this.calibrationSamples = [];
    this.setPhase('calibrating', 'Look at the screen for 3 seconds…');
  }

  private resetEpisode() {
    this.smoother = initialSmoother();
    this.warn = initialWarnState();
    this.pending = emptyStats();
    this.lastSampleAt = null;
  }

  private setPhase(phase: FocusPhase, message: string | null = null) {
    this.phase = phase;
    this.deps.setStatus({ phase, message });
  }

  /** Saves measured numbers to the running session (every 30 s, and before stopping/switching). */
  flush() {
    const p = this.pending;
    if (!this.target || p.focused + p.distracted + p.away + p.pickups === 0) return;
    this.deps.dispatch({ type: 'focusAdd', date: this.target.date, id: this.target.id, delta: p });
    this.pending = emptyStats();
    this.lastFlushAt = this.deps.now();
    this.deps.setStatus({ pending: this.pending });
  }

  /** One timer tick (1 s). Samples every 2 s; also drives the title flashing while warning. */
  async tick(): Promise<void> {
    if (!this.source || !this.detector || !this.target || this.busy) return;
    const now = this.deps.now();
    if (this.warningActive) {
      this.flashOn = !this.flashOn;
      this.deps.effects.flash(this.flashOn);
    }
    const calibrating = this.calibratingUntil !== null;
    if (now + TICK_SLACK_MS < this.nextSampleAt) return;
    this.nextSampleAt = now + (calibrating ? 1000 : LIMITS.sampleMs);
    this.busy = true;
    try {
      await this.sample(now);
    } finally {
      this.busy = false;
    }
  }

  private async sample(now: number) {
    const frame = await this.source!.grab().catch(() => null);
    const stale = !frame || now - this.source!.lastFrameAt() > LIMITS.stallMs;
    let sample: FocusSample | null = null;
    if (!stale) {
      try {
        sample = this.detector!.detect(frame!);
      } catch {
        sample = null;
      }
    }
    frame?.close?.();
    this.deps.onSample?.({ at: now, ok: !!sample, phase: this.phase });

    // Feed stalled or detection stopped: say so, and don't count the time either way.
    if (!sample) {
      this.lastSampleAt = null;
      if (this.phase !== 'paused') this.setPhase('paused', 'Focus watch paused — the camera feed stopped. Time is not being counted as focused.');
      this.deps.setStatus({ state: null });
      return;
    }
    if (this.phase === 'paused') this.setPhase(this.calibratingUntil !== null ? 'calibrating' : 'watching');

    const settings = this.deps.getSettings();

    if (this.calibratingUntil !== null) {
      this.calibrationSamples.push(sample);
      if (now >= this.calibratingUntil) {
        const c = calibrate(this.calibrationSamples);
        this.calibratingUntil = null;
        if (c) {
          this.deps.saveCalibration(c);
          this.setPhase('watching');
        } else {
          this.setPhase('watching', "Couldn't see your face during calibration. Look at the screen and press Recalibrate.");
        }
        this.lastSampleAt = now;
      }
      return;
    }

    const prev = this.smoother.state;
    this.smoother = smooth(this.smoother, classify(sample, settings.calibration, { screenOnly: settings.screenOnly }));
    const state = this.smoother.state;
    const dt = this.lastSampleAt === null ? 0 : Math.min(now - this.lastSampleAt, 10_000);
    this.lastSampleAt = now;
    this.pending = addTime(this.pending, prev, state, dt);

    const breakUntil = this.breakUntil !== null && now < this.breakUntil ? this.breakUntil : null;
    if (this.breakUntil !== null && !breakUntil) this.endBreak();
    const { ws, events } = stepWarnings(this.warn, {
      now,
      state,
      phoneSec: settings.phoneSec,
      awayMin: settings.awayMin,
      autoPause: settings.autoPause,
      breakUntil,
    });
    this.warn = ws;
    for (const e of events) {
      if (e.type === 'warn') {
        this.warningActive = true;
        this.deps.effects.warn(e.kind, WARNING_TEXT[e.kind], e.count);
        this.deps.setStatus({ warning: { kind: e.kind, text: WARNING_TEXT[e.kind], count: e.count }, titleAlert: true });
      } else if (e.type === 'clear') {
        this.warningActive = false;
        this.deps.effects.clear();
        this.deps.effects.flash(false);
        this.deps.setStatus({ warning: null, titleAlert: false });
      } else if (e.type === 'autoPause' && this.target) {
        // Only ever reached when the user turned on "Pause the stopwatch if I'm away for more than 5 minutes".
        const t = this.target;
        this.flush();
        this.deps.dispatch({ type: 'timerPause', date: t.date, id: t.id, at: now });
      }
    }

    this.deps.setStatus({ state, pending: this.pending });
    if (now - this.lastFlushAt >= FLUSH_MS) this.flush();
  }
}
