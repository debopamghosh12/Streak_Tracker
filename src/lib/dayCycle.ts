/**
 * Day–night cycle for the landing hero. Pure: no DOM, no clock reads — pass the Date in.
 * Sun events (via suncalc) anchor the keyframes, so golden hour follows the real sunset
 * through the year; values are linearly interpolated between neighbouring keyframes.
 */
import { getTimes } from 'suncalc';

/** Where the sun is computed for. Change here to move the sky. */
export const SKY_LOCATION = { lat: 22.5726, lng: 88.3639, name: 'Kolkata' } as const;

/**
 * Optional per-phase clips. If more than one distinct URL is set, the hero crossfades between
 * them by phase (colour grade stays on top). With a single URL it's used for every phase.
 */
export const HERO_VIDEO =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260405_170732_8a9ccda6-5cff-4628-b164-059c500a2b41.mp4';
export type ClipKey = 'night' | 'dawn' | 'day' | 'sunset';
export const SKY_CLIPS: Partial<Record<ClipKey, string>> = { day: HERO_VIDEO };

export type RGB = [number, number, number];

export interface SkyState {
  brightness: number;
  saturate: number;
  contrast: number;
  sepia: number;
  /** degrees */
  hueRotate: number;
  tintColor: RGB;
  tintOpacity: number;
  /** Opacity of the bottom readability gradient (≈0.75 midday, ≈0.5 night). */
  bottomShade: number;
  starsOpacity: number;
  moonOpacity: number;
  sunGlowOpacity: number;
  phaseLabel: PhaseLabel;
}

export type PhaseLabel = 'Night' | 'Dawn' | 'Sunrise' | 'Morning' | 'Midday' | 'Afternoon' | 'Golden hour' | 'Sunset' | 'Dusk';

type Look = Omit<SkyState, 'phaseLabel'>;

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/* ---------------- Keyframe looks (tuned by eye) ---------------- */

export const LOOKS = {
  night: {
    brightness: 0.5, saturate: 0.6, contrast: 1.06, sepia: 0, hueRotate: 8,
    tintColor: hex('#1c2f6e'), tintOpacity: 0.6, bottomShade: 0.5,
    starsOpacity: 1, moonOpacity: 1, sunGlowOpacity: 0,
  },
  dawn: {
    brightness: 0.68, saturate: 0.8, contrast: 1.04, sepia: 0.05, hueRotate: 0,
    tintColor: hex('#7a5f9e'), tintOpacity: 0.42, bottomShade: 0.55,
    starsOpacity: 0.35, moonOpacity: 0.45, sunGlowOpacity: 0.12,
  },
  sunrise: {
    brightness: 0.86, saturate: 1, contrast: 1.03, sepia: 0.12, hueRotate: -4,
    tintColor: hex('#f29a7a'), tintOpacity: 0.34, bottomShade: 0.65,
    starsOpacity: 0, moonOpacity: 0.1, sunGlowOpacity: 0.45,
  },
  morning: {
    brightness: 1, saturate: 1.05, contrast: 1.02, sepia: 0.06, hueRotate: 0,
    tintColor: hex('#ffd9a8'), tintOpacity: 0.2, bottomShade: 0.72,
    starsOpacity: 0, moonOpacity: 0, sunGlowOpacity: 0.2,
  },
  midday: {
    brightness: 1.08, saturate: 1.05, contrast: 1.02, sepia: 0, hueRotate: 0,
    tintColor: hex('#fff6e6'), tintOpacity: 0, bottomShade: 0.75,
    starsOpacity: 0, moonOpacity: 0, sunGlowOpacity: 0,
  },
  golden: {
    brightness: 1, saturate: 1.2, contrast: 1.04, sepia: 0.25, hueRotate: -8,
    tintColor: hex('#ffad4a'), tintOpacity: 0.38, bottomShade: 0.72,
    starsOpacity: 0, moonOpacity: 0, sunGlowOpacity: 0.75,
  },
  sunset: {
    brightness: 0.82, saturate: 1.25, contrast: 1.05, sepia: 0.3, hueRotate: -12,
    tintColor: hex('#ff7442'), tintOpacity: 0.42, bottomShade: 0.65,
    starsOpacity: 0, moonOpacity: 0, sunGlowOpacity: 0.55,
  },
  dusk: {
    brightness: 0.62, saturate: 0.85, contrast: 1.05, sepia: 0.08, hueRotate: 10,
    tintColor: hex('#5b4b94'), tintOpacity: 0.48, bottomShade: 0.55,
    starsOpacity: 0.4, moonOpacity: 0, sunGlowOpacity: 0.08,
  },
} satisfies Record<string, Look>;

/* ---------------- Sun anchors ---------------- */

export interface SunAnchors {
  nightEnd: Date;
  dawn: Date;
  sunrise: Date;
  goldenHourEnd: Date;
  solarNoon: Date;
  goldenHour: Date;
  sunset: Date;
  dusk: Date;
  night: Date;
}

const ANCHOR_KEYS: (keyof SunAnchors)[] = ['nightEnd', 'dawn', 'sunrise', 'goldenHourEnd', 'solarNoon', 'goldenHour', 'sunset', 'dusk', 'night'];

/** Fallback (local clock hours) if suncalc can't resolve an event, e.g. near the poles. */
const FALLBACK_HOURS: Record<keyof SunAnchors, number> = {
  nightEnd: 4.2, dawn: 5.1, sunrise: 5.5, goldenHourEnd: 6, solarNoon: 11.75, goldenHour: 16.9, sunset: 17.4, dusk: 17.8, night: 18.6,
};

/** Today's sun events for SKY_LOCATION, as instants (shown in the browser's local time). */
export function getSunAnchors(date: Date, loc: { lat: number; lng: number } = SKY_LOCATION): SunAnchors {
  const noon = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const t = getTimes(noon, loc.lat, loc.lng);
  const out = {} as SunAnchors;
  let prev = -Infinity;
  for (const k of ANCHOR_KEYS) {
    const v = t[k] as Date | undefined;
    const fallback = new Date(noon.getFullYear(), noon.getMonth(), noon.getDate(), 0, Math.round(FALLBACK_HOURS[k] * 60));
    let d = v && Number.isFinite(v.getTime()) ? v : fallback;
    if (d.getTime() <= prev) d = new Date(prev + 60_000); // keep anchors strictly increasing
    out[k] = d;
    prev = d.getTime();
  }
  return out;
}

/* ---------------- Interpolation ---------------- */

interface Keyframe {
  at: number;
  look: Look;
  /** Label for the segment starting at this keyframe. */
  label: PhaseLabel;
}

function keyframes(a: SunAnchors): Keyframe[] {
  const ms = (d: Date) => d.getTime();
  const noon = ms(a.solarNoon);
  // Midday holds until an hour before golden hour, then warms up.
  const middayEnd = Math.max(noon + 60_000, ms(a.goldenHour) - 60 * 60_000);
  return [
    { at: ms(a.nightEnd), look: LOOKS.night, label: 'Night' },
    { at: ms(a.dawn), look: LOOKS.dawn, label: 'Dawn' },
    { at: ms(a.sunrise), look: LOOKS.sunrise, label: 'Sunrise' },
    { at: ms(a.goldenHourEnd), look: LOOKS.morning, label: 'Morning' },
    { at: noon, look: LOOKS.midday, label: 'Midday' },
    { at: middayEnd, look: LOOKS.midday, label: 'Afternoon' },
    { at: ms(a.goldenHour), look: LOOKS.golden, label: 'Golden hour' },
    { at: ms(a.sunset), look: LOOKS.sunset, label: 'Sunset' },
    { at: ms(a.dusk), look: LOOKS.dusk, label: 'Dusk' },
    { at: ms(a.night), look: LOOKS.night, label: 'Night' },
  ];
}

const lerp = (x: number, y: number, t: number) => x + (y - x) * t;

function mix(a: Look, b: Look, t: number): Look {
  return {
    brightness: lerp(a.brightness, b.brightness, t),
    saturate: lerp(a.saturate, b.saturate, t),
    contrast: lerp(a.contrast, b.contrast, t),
    sepia: lerp(a.sepia, b.sepia, t),
    hueRotate: lerp(a.hueRotate, b.hueRotate, t),
    tintColor: [0, 1, 2].map((i) => Math.round(lerp(a.tintColor[i], b.tintColor[i], t))) as RGB,
    tintOpacity: lerp(a.tintOpacity, b.tintOpacity, t),
    bottomShade: lerp(a.bottomShade, b.bottomShade, t),
    starsOpacity: lerp(a.starsOpacity, b.starsOpacity, t),
    moonOpacity: lerp(a.moonOpacity, b.moonOpacity, t),
    sunGlowOpacity: lerp(a.sunGlowOpacity, b.sunGlowOpacity, t),
  };
}

/** The sky at a given moment. Before nightEnd and after night it's deep night. */
export function getSkyState(date: Date, loc: { lat: number; lng: number } = SKY_LOCATION): SkyState {
  const frames = keyframes(getSunAnchors(date, loc));
  const t = date.getTime();
  if (t < frames[0].at || t >= frames[frames.length - 1].at) return { ...LOOKS.night, phaseLabel: 'Night' };
  let i = 0;
  while (t >= frames[i + 1].at) i++;
  const a = frames[i];
  const b = frames[i + 1];
  const look = mix(a.look, b.look, (t - a.at) / (b.at - a.at));
  return { ...look, phaseLabel: a.label };
}

/* ---------------- Rendering helpers ---------------- */

export const cssFilter = (s: SkyState) =>
  `brightness(${s.brightness.toFixed(3)}) saturate(${s.saturate.toFixed(3)}) contrast(${s.contrast.toFixed(3)}) sepia(${s.sepia.toFixed(3)}) hue-rotate(${s.hueRotate.toFixed(1)}deg)`;

export const rgb = ([r, g, b]: RGB) => `rgb(${r}, ${g}, ${b})`;

/** 0..1 — how much the description/stats need a soft text shadow (bright phases only). */
export const textShadowStrength = (s: SkyState) => Math.min(1, Math.max(0, (s.brightness - 0.85) / 0.2));

export const CLIP_FOR_PHASE: Record<PhaseLabel, ClipKey> = {
  Night: 'night',
  Dusk: 'night',
  Dawn: 'dawn',
  Sunrise: 'dawn',
  Morning: 'day',
  Midday: 'day',
  Afternoon: 'day',
  'Golden hour': 'sunset',
  Sunset: 'sunset',
};

/** Clip URL for a phase: its own clip if set, else the nearest configured one, else the default video. */
export function clipFor(phase: PhaseLabel, clips: Partial<Record<ClipKey, string>> = SKY_CLIPS): string {
  const order: ClipKey[] = [CLIP_FOR_PHASE[phase], 'day', 'sunset', 'dawn', 'night'];
  for (const k of order) if (clips[k]) return clips[k]!;
  return HERO_VIDEO;
}

/* ---------------- ?time= / ?date= override ---------------- */

export interface SkyOverride {
  time?: { h: number; m: number };
  date?: { y: number; m: number; d: number };
}

/** Parses `?time=HH:mm` and `?date=YYYY-MM-DD`. Invalid values are ignored. */
export function parseSkyOverride(search: string): SkyOverride {
  const p = new URLSearchParams(search);
  const out: SkyOverride = {};
  const time = /^(\d{1,2}):(\d{2})$/.exec(p.get('time')?.trim() ?? '');
  if (time) {
    const h = Number(time[1]);
    const m = Number(time[2]);
    if (h <= 23 && m <= 59) out.time = { h, m };
  }
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p.get('date')?.trim() ?? '');
  if (date) {
    const [y, mo, d] = [Number(date[1]), Number(date[2]), Number(date[3])];
    const probe = new Date(y, mo - 1, d);
    if (probe.getFullYear() === y && probe.getMonth() === mo - 1 && probe.getDate() === d) out.date = { y, m: mo, d };
  }
  return out;
}

/** The moment the sky should show: `now`, with the override's date and/or time (or minutes-of-day) applied. */
export function resolveSkyDate(now: Date, o: SkyOverride, minutesOfDay?: number | null): Date {
  const y = o.date?.y ?? now.getFullYear();
  const mo = o.date ? o.date.m - 1 : now.getMonth();
  const d = o.date?.d ?? now.getDate();
  if (minutesOfDay != null) return new Date(y, mo, d, Math.floor(minutesOfDay / 60), minutesOfDay % 60);
  if (o.time) return new Date(y, mo, d, o.time.h, o.time.m);
  return new Date(y, mo, d, now.getHours(), now.getMinutes(), now.getSeconds());
}
