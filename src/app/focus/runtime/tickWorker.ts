/// <reference lib="webworker" />
/**
 * A tiny timer in a dedicated Web Worker. Timers in a hidden tab's main thread are throttled
 * (to once a minute after ~5 minutes in Chrome); a worker's timers keep their pace, so Focus watch
 * keeps sampling while you study in another tab.
 */
let id: ReturnType<typeof setInterval> | undefined;

self.onmessage = (e: MessageEvent<{ type: 'start'; ms: number } | { type: 'stop' }>) => {
  if (id !== undefined) clearInterval(id);
  id = undefined;
  if (e.data.type === 'start') id = setInterval(() => self.postMessage('tick'), e.data.ms);
};
