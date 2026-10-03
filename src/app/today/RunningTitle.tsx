import { useEffect } from 'react';
import { displayMs, findRunning, formatStopwatch, getDayItems } from '../../lib/dayItems';
import { useStore } from '../../state/store';
import { useStopwatchNow } from './stopwatchClock';
import { useFocusStatus } from '../focus/focusStatus';

const BASE_TITLE = typeof document !== 'undefined' && document.title ? document.title : 'Persist — daily study streak';

/** While a stopwatch runs, the browser tab shows it: "0:42:10 · DSA block 2 — Persist". Renders nothing. */
export function RunningTitle() {
  const { state } = useStore();
  const { titleAlert } = useFocusStatus(); // Focus watch is flashing "Come back — Persist"
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
    if (!titleAlert) document.title = text;
  }, [text, titleAlert]);
  useEffect(
    () => () => {
      document.title = BASE_TITLE;
    },
    [],
  );
  return null;
}
