import { format } from 'date-fns';
import type { SkyState, SunAnchors } from '../../lib/dayCycle';
import { SKY_LOCATION } from '../../lib/dayCycle';

/** Dev-only scrubber (lazy-loaded behind import.meta.env.DEV, so it never ships in production). */
export default function SkyDevPanel({
  minutes,
  liveMinutes,
  onChange,
  sky,
  anchors,
}: {
  minutes: number | null;
  liveMinutes: number;
  onChange: (m: number | null) => void;
  sky: SkyState;
  anchors: SunAnchors;
}) {
  const value = minutes ?? liveMinutes;
  const hh = String(Math.floor(value / 60)).padStart(2, '0');
  const mm = String(value % 60).padStart(2, '0');
  const t = (d: Date) => format(d, 'HH:mm');

  return (
    <div className="fixed bottom-4 left-4 z-[70] w-[260px] rounded-xl bg-black/80 backdrop-blur border border-white/10 p-3 text-[11px] text-gray-300 space-y-2 shadow-xl">
      <div className="flex items-center justify-between">
        <span className="text-primary">Sky preview · dev</span>
        <span className="tabular-nums text-sm" style={{ color: '#E1E0CC' }}>
          {hh}:{mm}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={1439}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#DEDBC8]"
        aria-label="Scrub time of day"
      />
      <div className="flex items-center justify-between">
        <span>
          Phase: <span style={{ color: '#E1E0CC' }}>{sky.phaseLabel}</span>
        </span>
        <button type="button" onClick={() => onChange(null)} className="px-2 py-1 rounded-full bg-white/10 hover:bg-white/20" disabled={minutes == null}>
          Live
        </button>
      </div>
      <p className="text-gray-500">
        {SKY_LOCATION.name}: sunrise {t(anchors.sunrise)} · sunset {t(anchors.sunset)} · golden {t(anchors.goldenHour)} · dusk {t(anchors.dusk)}
      </p>
    </div>
  );
}
