import { useEffect } from 'react';
import { displayMs, findRunning, formatStopwatch, getDayItems } from '../../lib/dayItems';
import { useStore } from '../../state/store';
import { useStopwatchNow } from './stopwatchClock';

const BASE_TITLE = typeof document !== 'undefined' && document.title ? document.title : 'Persist — daily study streak';

/** While a stopwatch runs, the browser tab shows it: "0:42:10 · DSA block 2 — Persist". Renders nothing. */
export function RunningTitle() {
  const { state } = useStore();
  const running = findRunning(state.days);
  const tick = useStopwatchNow(!!running);

  const title = running
    ? (getDayItems(state, running.date).items.find((i) => i.id === running.id)?.title ??
      state.carried.find((c) => c.id === running.id)?.text ??
      'Timer')
    : null;
  const elapsed = running ? displayMs(running.timer, Math.max(tick, running.timer.runningSince ?? 0)) : 0;
  const text = title ? `${formatStopwatch(elapsed)} · ${title} — Persist` : BASE_TITLE;

  useEffect(() => {
    document.title = text;
  }, [text]);
  useEffect(
    () => () => {
      document.title = BASE_TITLE;
    },
    [],
  );
  return null;
}
