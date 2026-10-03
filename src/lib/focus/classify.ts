import { LIMITS, emptyStats, type Calibration, type FocusSample, type FocusState, type FocusStats } from './types';

const DEG = 180 / Math.PI;

/**
 * Yaw / pitch (degrees) from MediaPipe's 4×4 facial transformation matrix (flattened).
 * Only differences from the calibrated pose are used, so the storage order (row/column-major)
 * only flips signs and doesn't matter.
 */
export function headPose(m: number[]): { yaw: number; pitch: number } {
  // Rotation part, read as column-major: R[r][c] = m[c * 4 + r]
  const r20 = m[2];
  const r21 = m[6];
  const r22 = m[10];
  const yaw = Math.asin(Math.max(-1, Math.min(1, -r20))) * DEG;
  const pitch = Math.atan2(r21, r22) * DEG;
  return { yaw, pitch };
}

interface Pt {
  x: number;
  y: number;
}

/** Nose tip height below the eye line, divided by eye distance. Grows when the head tilts down. */
export function noseRel(landmarks: Pt[]): number {
  const nose = landmarks[1];
  const l = landmarks[33];
  const r = landmarks[263];
  if (!nose || !l || !r) return 0;
  const eyeY = (l.y + r.y) / 2;
  const eyeDist = Math.hypot(l.x - r.x, l.y - r.y) || 1;
  return (nose.y - eyeY) / eyeDist;
}

/** Average of the face poses seen during calibration; null if no face was seen. */
export function calibrate(samples: FocusSample[]): Calibration | null {
  const faces = samples.map((s) => s.face).filter((f): f is NonNullable<FocusSample['face']> => !!f);
  if (faces.length === 0) return null;
  const avg = (k: 'yaw' | 'pitch' | 'noseRel') => faces.reduce((s, f) => s + f[k], 0) / faces.length;
  return { yaw: avg('yaw'), pitch: avg('pitch'), noseRel: avg('noseRel') };
}

/** Smallest difference between two angles in degrees (handles wrap-around at ±180°). */
const angleDiff = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

/**
 * One raw classification. Phone wins over everything; no face = away; a face turned beyond
 * the limits = looking away, except head-down (writing in a notebook) which counts as focused
 * unless "I only study on screen" is on.
 */
export function classify(sample: FocusSample, calib: Calibration | null, opts: { screenOnly: boolean }): FocusState {
  if (sample.phoneScore >= LIMITS.phoneScore) return 'phone';
  if (!sample.face) return 'away';
  const c = calib ?? { yaw: 0, pitch: 0, noseRel: sample.face.noseRel };
  if (angleDiff(sample.face.yaw, c.yaw) > LIMITS.yawDeg) return 'lookingAway';
  if (angleDiff(sample.face.pitch, c.pitch) > LIMITS.pitchDeg) {
    const headDown = sample.face.noseRel > c.noseRel;
    return headDown && !opts.screenOnly ? 'focused' : 'lookingAway';
  }
  return 'focused';
}

/* ---------------- Smoothing ---------------- */

export interface Smoother {
  /** Smoothed state (null until the first 3 samples agree). */
  state: FocusState | null;
  candidate: FocusState | null;
  count: number;
}

export const initialSmoother = (): Smoother => ({ state: null, candidate: null, count: 0 });

/** The smoothed state only changes after 3 consecutive raw samples agree. */
export function smooth(s: Smoother, raw: FocusState): Smoother {
  const count = s.candidate === raw ? s.count + 1 : 1;
  const state = count >= LIMITS.smoothing ? raw : s.state;
  return { state, candidate: raw, count };
}

/* ---------------- Stats ---------------- */

/**
 * Adds `dtMs` to the category of the smoothed state. Phone time counts as distracted; a phone
 * pickup is counted when the smoothed state enters "phone" from anything else.
 */
export function addTime(stats: FocusStats, prev: FocusState | null, state: FocusState | null, dtMs: number): FocusStats {
  const next = { ...stats };
  const sec = Math.max(0, dtMs) / 1000;
  if (state === 'focused') next.focused += sec;
  else if (state === 'lookingAway' || state === 'phone') next.distracted += sec;
  else if (state === 'away') next.away += sec;
  if (state === 'phone' && prev !== 'phone') next.pickups += 1;
  return next;
}

export function sumStats(...all: (FocusStats | undefined)[]): FocusStats {
  const out = emptyStats();
  for (const s of all) {
    if (!s) continue;
    out.focused += s.focused;
    out.distracted += s.distracted;
    out.away += s.away;
    out.pickups += s.pickups;
  }
  return out;
}

/** Focused share of watched time, 0–100 (null when nothing was watched). */
export function focusPct(s: FocusStats): number | null {
  const total = s.focused + s.distracted + s.away;
  return total > 0 ? Math.round((s.focused / total) * 100) : null;
}
