import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getSkyState, getSunAnchors, parseSkyOverride, resolveSkyDate } from '../../lib/dayCycle';

/**
 * The hero's sky, synced to the visitor's clock (or ?time= / ?date= / the dev scrubber).
 * Re-evaluated on mount, every 60 s and when the tab becomes visible — never per frame;
 * the visual change itself is a 60 s CSS transition.
 */
export function useSkyState(scrubMinutes: number | null) {
  const { search } = useLocation();
  const override = useMemo(() => parseSkyOverride(search), [search]);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    const id = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const at = resolveSkyDate(now, override, scrubMinutes);
  return { sky: getSkyState(at), anchors: getSunAnchors(at), at, overridden: !!(override.time || override.date) };
}
