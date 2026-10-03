import { Suspense, lazy, useEffect, useMemo, useRef } from 'react';
import { findRunning, getDayItems } from '../../lib/dayItems';
import { useStore } from '../../state/store';
import { useFocusSettings } from './focusSettings';
import { useFocusStatus } from './focusStatus';
import { focusSupport } from './support';

/** The heavy runtime (camera, MediaPipe, controller) is only loaded once Focus watch is used. */
type Runtime = typeof import('./runtime');
let runtime: Promise<Runtime> | null = null;
export const loadFocusRuntime = () => (runtime ??= import('./runtime'));
export const focusRuntimeLoaded = () => runtime !== null;

/**
 * Starts Focus watch while a stopwatch runs (and the feature is on), stops the camera when it
 * pauses, and frees the models when the feature is turned off. Also hosts the first-run
 * explainer and the optional self-view.
 */
export function FocusHost() {
  const settings = useFocusSettings();
  const status = useFocusStatus();
  const { state, dispatch } = useStore();
  const support = useMemo(focusSupport, []);
  const running = findRunning(state.days);
  const key = running ? `${running.date}|${running.id}` : '';
  const title = running ? (getDayItems(state, running.date).items.find((i) => i.id === running.id)?.title ?? 'Task') : '';
  const titleRef = useRef(title);
  titleRef.current = title;

  useEffect(() => {
    if (!support.ok) return;
    let cancelled = false;
    const [date, id] = key.split('|');
    if (settings.enabled && key) {
      void loadFocusRuntime().then((rt) => {
        if (!cancelled) void rt.getController(dispatch).sync({ date, id, title: titleRef.current });
      });
    } else if (focusRuntimeLoaded()) {
      void loadFocusRuntime().then((rt) => {
        const c = rt.getController(dispatch);
        if (settings.enabled) void c.sync(null); // stopwatch paused: camera off
        else c.dispose(); // feature off: camera off, models freed
      });
    }
    return () => {
      cancelled = true;
    };
  }, [settings.enabled, key, dispatch, support.ok]);

  if (!support.ok) return null;
  // Explainer and self-view are loaded only when needed, to keep the main bundle small.
  const needExtras = status.explainOpen || (settings.preview && !!status.stream);
  return needExtras ? (
    <Suspense fallback={null}>
      <FocusExtras />
    </Suspense>
  ) : null;
}

const FocusExtras = lazy(() => import('./FocusExtras'));
