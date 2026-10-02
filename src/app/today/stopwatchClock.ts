import { useSyncExternalStore } from 'react';

/**
 * One shared 1-second clock for every running stopwatch display (and the tab title).
 * The interval exists only while something is subscribed, so nothing ticks when no timer runs,
 * and only the subscribed components re-render each second — not the whole Today page.
 * The value is just "now"; elapsed time is always computed from stored timestamps.
 */
const subscribers = new Set<() => void>();
let intervalId: number | undefined;
let now = 0;

const second = () => Math.floor(Date.now() / 1000) * 1000;

function tick() {
  now = second();
  for (const cb of subscribers) cb();
}

function onVisible() {
  if (document.visibilityState === 'visible') tick(); // catch up at once after a background tab / sleep
}

function subscribe(cb: () => void) {
  subscribers.add(cb);
  if (intervalId === undefined) {
    now = second();
    intervalId = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', onVisible);
  }
  return () => {
    subscribers.delete(cb);
    if (subscribers.size === 0 && intervalId !== undefined) {
      window.clearInterval(intervalId);
      intervalId = undefined;
      document.removeEventListener('visibilitychange', onVisible);
    }
  };
}

/** Stable within a second (required by useSyncExternalStore), fresh even before the first tick. */
function getSnapshot() {
  if (intervalId === undefined) now = second();
  return now;
}

const noopSubscribe = () => () => {};
const getStatic = () => 0;

/** Current time, updating every second while `active`; 0 when inactive (callers then don't need it). */
export function useStopwatchNow(active: boolean): number {
  return useSyncExternalStore(active ? subscribe : noopSubscribe, active ? getSnapshot : getStatic);
}
