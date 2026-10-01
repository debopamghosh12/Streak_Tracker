import { describe, expect, it } from 'vitest';
import { HERO_VIDEO, LOOKS, clipFor, getSkyState, getSunAnchors, parseSkyOverride, resolveSkyDate, textShadowStrength } from './dayCycle';

// Fixed local times only (vitest runs with TZ=Asia/Kolkata), never the real clock.
const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi);
const DAY = [2026, 10, 2] as const;
const on = (h: number, mi = 0) => at(...DAY, h, mi);

describe('getSkyState through a day', () => {
  it('02:00 is deep night: dark, cool, stars and moon out', () => {
    const s = getSkyState(on(2));
    expect(s.phaseLabel).toBe('Night');
    expect(s).toMatchObject({ brightness: LOOKS.night.brightness, starsOpacity: 1, moonOpacity: 1, sunGlowOpacity: 0 });
    expect(s.tintColor[2]).toBeGreaterThan(s.tintColor[0]); // blue tint
    expect(s.bottomShade).toBeCloseTo(0.5);
  });

  it('08:00 is morning: bright, soft warm tint, no stars', () => {
    const s = getSkyState(on(8));
    expect(s.phaseLabel).toBe('Morning');
    expect(s.brightness).toBeGreaterThanOrEqual(1);
    expect(s.starsOpacity).toBe(0);
    expect(s.tintOpacity).toBeGreaterThan(0);
    expect(s.tintOpacity).toBeLessThan(0.2);
    expect(s.tintColor[0]).toBeGreaterThan(s.tintColor[2]); // warm
  });

  it('12:30 is midday: brightest, neutral', () => {
    const s = getSkyState(on(12, 30));
    expect(s.phaseLabel).toBe('Midday');
    expect(s.brightness).toBeCloseTo(LOOKS.midday.brightness);
    expect(s.tintOpacity).toBe(0);
    expect(s.bottomShade).toBeCloseTo(0.75);
    expect(textShadowStrength(s)).toBeGreaterThan(0.9);
  });

  it('near sunset it is golden: warm, saturated, sun glow — then the sunset look', () => {
    const { sunset } = getSunAnchors(on(12));
    const golden = getSkyState(new Date(sunset.getTime() - 10 * 60_000));
    expect(golden.phaseLabel).toBe('Golden hour');
    expect(golden.saturate).toBeGreaterThan(1.15);
    expect(golden.sunGlowOpacity).toBeGreaterThan(0.5);
    expect(golden.tintColor[0]).toBeGreaterThan(golden.tintColor[2] + 80);
    expect(getSkyState(new Date(sunset.getTime() + 5 * 60_000)).phaseLabel).toBe('Sunset');
  });

  it('21:00 is night again, with no text shadow', () => {
    const s = getSkyState(on(21));
    expect(s.phaseLabel).toBe('Night');
    expect(s.starsOpacity).toBe(1);
    expect(textShadowStrength(s)).toBe(0);
  });
});

describe('continuity', () => {
  const dates: [number, number, number][] = [[...DAY], [2027, 6, 21], [2026, 12, 21]];
  for (const date of dates) {
    it(`no jumps between consecutive minutes on ${date.join('-')}`, () => {
      let prev = getSkyState(at(...date, 0, 0));
      for (let m = 1; m < 24 * 60; m++) {
        const s = getSkyState(at(...date, Math.floor(m / 60), m % 60));
        expect(Math.abs(s.brightness - prev.brightness)).toBeLessThan(0.02);
        expect(Math.abs(s.saturate - prev.saturate)).toBeLessThan(0.02);
        expect(Math.abs(s.tintOpacity - prev.tintOpacity)).toBeLessThan(0.03);
        expect(Math.abs(s.starsOpacity - prev.starsOpacity)).toBeLessThan(0.05);
        expect(Math.abs(s.bottomShade - prev.bottomShade)).toBeLessThan(0.02);
        for (let c = 0; c < 3; c++) expect(Math.abs(s.tintColor[c] - prev.tintColor[c])).toBeLessThanOrEqual(10);
        prev = s;
      }
    });
  }
});

describe('seasons', () => {
  it('sunset keyframes shift between 21 June and 21 December', () => {
    const june = getSunAnchors(at(2027, 6, 21, 12));
    const dec = getSunAnchors(at(2026, 12, 21, 12));
    const minutes = (d: Date) => d.getHours() * 60 + d.getMinutes();
    expect(minutes(june.sunset) - minutes(dec.sunset)).toBeGreaterThan(60);
    expect(getSkyState(at(2027, 6, 21, 18)).phaseLabel).toBe('Golden hour');
    expect(['Dusk', 'Night']).toContain(getSkyState(at(2026, 12, 21, 18)).phaseLabel);
  });
});

describe('?time= / ?date= override', () => {
  it('parses valid values and ignores invalid ones', () => {
    expect(parseSkyOverride('?time=18:10')).toEqual({ time: { h: 18, m: 10 } });
    expect(parseSkyOverride('?time=7:05')).toEqual({ time: { h: 7, m: 5 } });
    expect(parseSkyOverride('?date=2027-06-21&time=06:00')).toEqual({ time: { h: 6, m: 0 }, date: { y: 2027, m: 6, d: 21 } });
    expect(parseSkyOverride('?time=24:00&date=2027-02-30')).toEqual({});
    expect(parseSkyOverride('?time=noon&date=21-06-2027')).toEqual({});
    expect(parseSkyOverride('')).toEqual({});
  });

  it('resolves the moment to show', () => {
    const now = at(2026, 10, 2, 9, 41);
    expect(resolveSkyDate(now, {})).toEqual(now);
    expect(resolveSkyDate(now, { time: { h: 18, m: 10 } })).toEqual(at(2026, 10, 2, 18, 10));
    expect(resolveSkyDate(now, { date: { y: 2027, m: 6, d: 21 }, time: { h: 6, m: 0 } })).toEqual(at(2027, 6, 21, 6, 0));
    expect(resolveSkyDate(now, { time: { h: 18, m: 10 } }, 125)).toEqual(at(2026, 10, 2, 2, 5)); // dev scrubber wins
  });
});

describe('clips', () => {
  it('uses the single configured video for every phase, and per-phase clips when set', () => {
    expect(clipFor('Night')).toBe(HERO_VIDEO);
    expect(clipFor('Golden hour')).toBe(HERO_VIDEO);
    const clips = { day: 'day.mp4', sunset: 'sunset.mp4', night: 'night.mp4' };
    expect(clipFor('Golden hour', clips)).toBe('sunset.mp4');
    expect(clipFor('Dusk', clips)).toBe('night.mp4');
    expect(clipFor('Dawn', clips)).toBe('day.mp4'); // no dawn clip → nearest configured
  });
});
