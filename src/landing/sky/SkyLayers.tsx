import { useEffect, useMemo, useState } from 'react';
import { SKY_CLIPS, clipFor, cssFilter, rgb, type SkyState } from '../../lib/dayCycle';

/** Blend mode for the colour tint (soft-light kept the footage most natural; overlay/multiply were heavier). */
const TINT_BLEND = 'soft-light' as const;

/* ---------------- Stars: fixed pseudo-random positions (seeded) ---------------- */

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STARS = (() => {
  const rand = mulberry32(20261002);
  return Array.from({ length: 120 }, (_, i) => ({
    x: rand() * 100,
    y: rand() * 100, // within the star layer, which covers the top 60% of the hero
    r: 0.5 + rand() * 1.1,
    o: 0.45 + rand() * 0.55,
    twinkle: i % 9 === 0,
    delay: rand() * 6,
  }));
})();

/* ---------------- Video (single clip, or A/B crossfade between phase clips) ---------------- */

const distinctClips = [...new Set(Object.values(SKY_CLIPS).filter(Boolean))];

function SkyVideo({ src, onFail }: { src: string; onFail: () => void }) {
  // Two stacked <video>s: the new clip loads in the hidden slot and fades in once it can play.
  const [slots, setSlots] = useState<[string, string | null]>([src, null]);
  const [active, setActive] = useState<0 | 1>(0);

  useEffect(() => {
    if (slots[active] === src) return;
    const next = active === 0 ? 1 : 0;
    setSlots((s) => {
      const copy: [string, string | null] = [s[0], s[1]];
      copy[next] = src;
      return copy;
    });
  }, [src, slots, active]);

  return (
    <>
      {slots.map((url, i) =>
        url ? (
          <video
            key={i}
            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-[3000ms] ease-linear"
            style={{ opacity: i === active ? 1 : 0, willChange: distinctClips.length > 1 ? 'opacity' : undefined }}
            src={url}
            autoPlay
            loop
            muted
            playsInline
            onCanPlay={() => {
              if (i !== active && url === src) setActive(i as 0 | 1);
            }}
            onError={() => {
              if (i === active) onFail();
            }}
          />
        ) : null,
      )}
    </>
  );
}

/**
 * Everything between the hero video and the text: graded video (or a static fallback),
 * tint, sun glow, moon and stars. All values transition linearly over `transition`.
 */
export function SkyLayers({ sky, transitionMs, twinkle }: { sky: SkyState; transitionMs: number; twinkle: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = useMemo(() => clipFor(sky.phaseLabel), [sky.phaseLabel]);
  const t = (props: string) => (transitionMs > 0 ? props.split(',').map((p) => `${p.trim()} ${transitionMs}ms linear`).join(', ') : 'none');

  return (
    <>
      {/* Colour grade on the footage (or on a static dark sky if the video can't load) */}
      <div className="absolute inset-0" style={{ filter: cssFilter(sky), transition: t('filter'), willChange: 'filter' }}>
        {failed ? (
          <div
            className="absolute inset-0"
            style={{ background: 'radial-gradient(120% 90% at 50% 0%, #3a4660 0%, #1b2233 45%, #0b0d12 100%)' }}
            aria-hidden
          />
        ) : (
          <SkyVideo src={src} onFail={() => setFailed(true)} />
        )}
      </div>

      {/* Tint */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundColor: rgb(sky.tintColor),
          opacity: sky.tintOpacity,
          mixBlendMode: TINT_BLEND,
          transition: t('background-color, opacity'),
          willChange: 'opacity, background-color',
        }}
        aria-hidden
      />

      {/* Sun glow, upper right */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 86% 10%, rgba(255, 206, 140, 0.6) 0%, rgba(255, 158, 80, 0.22) 22%, rgba(255, 140, 60, 0) 52%)',
          mixBlendMode: 'screen',
          opacity: sky.sunGlowOpacity,
          transition: t('opacity'),
          willChange: 'opacity',
        }}
        aria-hidden
      />

      {/* Moon, upper left */}
      <div
        className="absolute left-[9%] top-[13%] w-12 h-12 md:w-20 md:h-20 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 38% 36%, #fbf8ec 0%, #e9e4cf 55%, #cfc8ad 100%)',
          boxShadow: '0 0 40px 12px rgba(235, 230, 205, 0.28), 0 0 120px 40px rgba(170, 185, 230, 0.12)',
          opacity: sky.moonOpacity,
          transition: t('opacity'),
          willChange: 'opacity',
        }}
        aria-hidden
      />

      {/* Stars, top 60% */}
      <svg
        className="absolute left-0 top-0 w-full h-[60%] pointer-events-none"
        style={{ opacity: sky.starsOpacity, transition: t('opacity'), willChange: 'opacity' }}
        aria-hidden
      >
        {STARS.map((s, i) => (
          <circle
            key={i}
            cx={`${s.x}%`}
            cy={`${s.y}%`}
            r={s.r}
            fill="#f4f1e3"
            opacity={s.o}
            className={s.twinkle && twinkle ? 'sky-twinkle' : undefined}
            style={s.twinkle && twinkle ? { animationDelay: `${s.delay}s` } : undefined}
          />
        ))}
      </svg>
    </>
  );
}

