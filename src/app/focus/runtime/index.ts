/** The lazily-loaded Focus watch runtime: real browser dependencies wired into the controller. */
import type { Action } from '../../../state/types';
import { getFocusSettings, updateFocusSettings } from '../focusSettings';
import { setFocusStatus } from '../focusStatus';
import { createFrameSource, openCamera } from './camera';
import { FocusController } from './controller';
import { loadDetector } from './detector';
import { chime, clearNotification, flashTitle, notify } from './effects';

export { primeAudio, requestNotifications } from './effects';
export { openCamera } from './camera';

/** Background-safe ticker: a Web Worker timer, falling back to setInterval. */
function startTicker(everyMs: number, onTick: () => void): () => void {
  try {
    const worker = new Worker(new URL('./tickWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = () => onTick();
    worker.postMessage({ type: 'start', ms: everyMs });
    return () => {
      worker.postMessage({ type: 'stop' });
      worker.terminate();
    };
  } catch {
    const id = window.setInterval(onTick, everyMs);
    return () => window.clearInterval(id);
  }
}

let controller: FocusController | null = null;
let dispatchRef: (a: Action) => void = () => {};

export function getController(dispatch: (a: Action) => void): FocusController {
  dispatchRef = dispatch;
  controller ??= new FocusController({
    openCamera,
    createFrameSource,
    loadDetector,
    startTicker,
    now: () => Date.now(),
    dispatch: (a) => dispatchRef(a),
    getSettings: getFocusSettings,
    saveCalibration: (calibration) => updateFocusSettings({ calibration }),
    setStatus: setFocusStatus,
    ...(import.meta.env.DEV
      ? {
          onSample: (info: { at: number; ok: boolean; phase: string }) => {
            const w = window as Window & { __focusSamples?: unknown[] };
            (w.__focusSamples ??= []).push({ ...info, visible: document.visibilityState });
          },
        }
      : {}),
    effects: {
      warn: (kind, text) => {
        chime();
        notify(kind, text);
      },
      clear: () => {
        clearNotification();
        flashTitle(false);
      },
      flash: (on) => flashTitle(on),
    },
  });
  return controller;
}
