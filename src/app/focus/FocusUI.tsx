import { Camera, CameraOff, Coffee, Crosshair, Eye, PictureInPicture2, Pause } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { displayMs, findRunning, formatStopwatch, getDayItems } from '../../lib/dayItems';
import { useStore } from '../../state/store';
import { loadFocusRuntime } from './FocusHost';
import { updateFocusSettings, useFocusSettings } from './focusSettings';
import { FOCUS_COLORS, FOCUS_LABELS, setFocusStatus, useFocusStatus } from './focusStatus';
import { attachPreview, detachPreview, pipBackground } from './pipPreview';
import { focusSupport } from './support';

const TEXT = { color: '#E1E0CC' };
const pill = 'min-h-[36px] px-3 rounded-full text-xs transition-colors';

const withRuntime = (fn: (rt: Awaited<ReturnType<typeof loadFocusRuntime>>) => void) => void loadFocusRuntime().then(fn);

/** Today page banner: calibration, warnings, paused feed, Break, Recalibrate, Pop out. */
export function FocusBanner() {
  const settings = useFocusSettings();
  const status = useFocusStatus();
  const { dispatch } = useStore();
  const support = useMemo(focusSupport, []);
  if (!support.ok || !settings.enabled) return null;
  if (status.phase === 'off' && !status.message) return null;

  const onBreak = status.breakUntil !== null && status.breakUntil > Date.now();
  const tone = status.warning
    ? 'border-amber-300/40 bg-amber-300/10'
    : status.phase === 'paused' || status.phase === 'denied' || status.phase === 'nocamera' || status.phase === 'error'
      ? 'border-white/10 bg-white/[0.03]'
      : 'border-white/5 bg-[#101010]';

  return (
    <div role="status" aria-live="polite" className={`rounded-2xl border px-4 py-3 space-y-2 ${tone}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-2 text-sm" style={TEXT}>
          <Eye className="w-4 h-4 text-primary" />
          {status.warning ? (
            <span className="text-amber-200 text-base">{status.warning.text}</span>
          ) : status.phase === 'calibrating' ? (
            <span>Look at the screen for 3 seconds…</span>
          ) : status.phase === 'loading' ? (
            <span className="text-gray-400">Starting Focus watch…</span>
          ) : status.phase === 'watching' ? (
            <span className="inline-flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: status.state ? FOCUS_COLORS[status.state] : '#444' }} />
              {status.state ? FOCUS_LABELS[status.state] : 'Watching…'}
            </span>
          ) : (
            <span className="text-gray-300">{status.phase === 'paused' ? 'Focus watch paused' : 'Focus watch is off'}</span>
          )}
        </span>
        {onBreak && <span className="text-xs text-gray-400">On break until {format(status.breakUntil!, 'h:mm a')}</span>}
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {(status.phase === 'watching' || status.warning) &&
            (onBreak ? (
              <button type="button" onClick={() => withRuntime((rt) => rt.getController(dispatch).endBreak())} className={`${pill} bg-[#212121] text-gray-300 hover:text-primary`}>
                End break
              </button>
            ) : (
              [5, 10, 15].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => withRuntime((rt) => rt.getController(dispatch).takeBreak(m))}
                  className={`${pill} bg-[#212121] text-gray-300 hover:text-primary inline-flex items-center gap-1`}
                  aria-label={`Break for ${m} minutes`}
                >
                  {m === 5 && <Coffee className="w-3.5 h-3.5" />}
                  Break {m}m
                </button>
              ))
            ))}
          {(status.phase === 'watching' || status.phase === 'calibrating') && (
            <button type="button" onClick={() => withRuntime((rt) => rt.getController(dispatch).recalibrate())} className={`${pill} text-gray-400 hover:text-primary inline-flex items-center gap-1`}>
              <Crosshair className="w-3.5 h-3.5" /> Recalibrate
            </button>
          )}
          {status.phase !== 'off' && <PopOut />}
        </span>
      </div>
      {status.message && !status.warning && <p className="text-xs text-gray-400">{status.message}</p>}
    </div>
  );
}

/* ---------------- Pop out (Document Picture-in-Picture) ---------------- */

type PipApi = { requestWindow(opts: { width: number; height: number }): Promise<Window> };

/**
 * Small always-on-top window with the stopwatch, the focus dot and Pause. It shares this page's
 * JavaScript, so Focus watch keeps running from the same controller while you're in other tabs.
 */
function PopOut() {
  const [win, setWin] = useState<Window | null>(null);
  const api = (window as Window & { documentPictureInPicture?: PipApi }).documentPictureInPicture;
  if (!api) return null;

  const open = async () => {
    try {
      const w = await api.requestWindow({ width: 320, height: 190 });
      // Copy styles so the window looks like Persist.
      for (const node of document.head.querySelectorAll('style, link[rel="stylesheet"]')) w.document.head.appendChild(node.cloneNode(true));
      w.document.body.style.cssText = 'margin:0;background:#000';
      w.addEventListener('pagehide', () => setWin(null));
      setWin(w);
    } catch {
      /* user dismissed or not allowed */
    }
  };

  return (
    <>
      <button type="button" onClick={open} className={`${pill} text-gray-400 hover:text-primary inline-flex items-center gap-1`} title="Small always-on-top window">
        <PictureInPicture2 className="w-3.5 h-3.5" /> Pop out
      </button>
      {win && createPortal(<PipView win={win} />, win.document.body)}
    </>
  );
}

const SHADOW = { textShadow: '0 1px 3px rgba(0,0,0,0.6)' };

function PipView({ win }: { win: Window }) {
  const { state, dispatch } = useStore();
  const status = useFocusStatus();
  const settings = useFocusSettings();
  const [now, setNow] = useState(Date.now());
  const videoRef = useRef<HTMLVideoElement>(null);
  /** The stream whose playback failed (a new stream gets a fresh try). */
  const [failedFor, setFailedFor] = useState<MediaStream | null>(null);
  const reducedMotion = useMemo(() => win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, [win]);
  useEffect(() => {
    // The pop-out window is visible, so its own timer isn't throttled.
    const id = win.setInterval(() => setNow(Date.now()), 1000);
    return () => win.clearInterval(id);
  }, [win]);

  const stream = status.stream;
  const bg = pipBackground({ cameraOn: settings.pipCamera, stream, reducedMotion, failed: !!stream && failedFor === stream });
  useEffect(() => {
    const video = videoRef.current;
    if (!video || bg !== 'camera' || !stream) return;
    let live = true;
    void attachPreview(video, stream).then((ok) => {
      if (!ok && live) setFailedFor(stream);
    });
    // Stopwatch paused / feature off (stream → null), camera toggled off, or pop-out closed.
    return () => {
      live = false;
      detachPreview(video);
    };
  }, [bg, stream]);

  const running = findRunning(state.days);
  const title = running ? (getDayItems(state, running.date).items.find((i) => i.id === running.id)?.title ?? 'Task') : 'No timer running';
  const color = status.state && status.phase === 'watching' ? FOCUS_COLORS[status.state] : '#444';
  return (
    <div className="relative h-screen overflow-hidden border-2 bg-black" style={{ ...TEXT, borderColor: color }}>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        aria-hidden
        onError={() => stream && setFailedFor(stream)}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ transform: 'scaleX(-1)', display: bg === 'camera' ? 'block' : 'none' }}
      />
      {bg === 'camera' && <div className="absolute inset-0 bg-gradient-to-b from-black/55 to-black/75" aria-hidden />}
      <button
        type="button"
        onClick={() => updateFocusSettings({ pipCamera: !settings.pipCamera })}
        aria-pressed={settings.pipCamera}
        aria-label={settings.pipCamera ? 'Plain black background' : 'Camera background'}
        title={settings.pipCamera ? 'Switch to a plain black background' : 'Show the camera as the background'}
        className="absolute top-1 right-1 z-10 w-8 h-8 rounded-full flex items-center justify-center text-gray-300 hover:text-primary bg-black/30"
      >
        {settings.pipCamera ? <Camera className="w-3.5 h-3.5" /> : <CameraOff className="w-3.5 h-3.5" />}
      </button>
      <div className="relative h-full flex flex-col justify-center gap-2 px-4">
        <p className="text-xs text-gray-400 truncate pr-8" style={SHADOW}>{title}</p>
        <p className="text-3xl tabular-nums" style={SHADOW}>{running ? formatStopwatch(displayMs(running.timer, now)) : '—'}</p>
        <div className="flex items-center gap-2 text-xs">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
          <span className="text-gray-300">{status.warning?.text ?? (status.phase === 'paused' ? 'Focus watch paused' : status.state ? FOCUS_LABELS[status.state] : 'Watching…')}</span>
          {running && (
            <button
              type="button"
              onClick={() => dispatch({ type: 'timerPause', date: running.date, id: running.id, at: Date.now() })}
              className="ml-auto min-h-[36px] px-3 rounded-full bg-primary text-black inline-flex items-center gap-1"
            >
              <Pause className="w-3.5 h-3.5" /> Pause
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Settings section ---------------- */

export function FocusSettingsSection() {
  const settings = useFocusSettings();
  const { dispatch } = useStore();
  const support = useMemo(focusSupport, []);
  const row = 'flex items-center justify-between gap-3 min-h-[40px] text-sm';
  const toggle = (on: boolean, label: string, onClick: () => void) => (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick} className={`w-10 h-6 rounded-full relative transition-colors shrink-0 ${on ? 'bg-primary' : 'bg-[#2a2a2a]'}`}>
      <span className={`absolute top-1 w-4 h-4 rounded-full transition-all ${on ? 'left-5 bg-black' : 'left-1 bg-gray-500'}`} />
    </button>
  );

  return (
    <section className="mt-4 pt-4 border-t border-white/5 space-y-2" style={TEXT}>
      <h3 className="text-sm inline-flex items-center gap-2">
        <Eye className="w-4 h-4 text-primary" /> Focus watch
      </h3>
      {!support.ok ? (
        <p className="text-xs text-gray-500">{support.reason}</p>
      ) : (
        <>
          <div className={row}>
            <span>Use the camera while a stopwatch runs</span>
            {toggle(settings.enabled, 'Focus watch', () => {
              if (!settings.explained) setFocusStatus({ explainOpen: true });
              else updateFocusSettings({ enabled: !settings.enabled });
            })}
          </div>
          <p className="text-[11px] text-gray-500">
            Runs on this device only. No frame, image or face data is stored, logged or sent anywhere — only focus numbers are saved and synced.
          </p>
          <div className={row}>
            <span>I only study on screen (head down = looking away)</span>
            {toggle(settings.screenOnly, 'I only study on screen', () => updateFocusSettings({ screenOnly: !settings.screenOnly }))}
          </div>
          <label className={row}>
            <span>Warn when the phone is in view for</span>
            <span className="inline-flex items-center gap-1 text-xs text-gray-400">
              <input type="number" min={10} max={120} value={settings.phoneSec} onChange={(e) => updateFocusSettings({ phoneSec: Math.min(120, Math.max(10, Number(e.target.value) || 20)) })} className="w-16 min-h-[36px] bg-[#212121] rounded-lg px-2 text-sm text-center" />
              s
            </span>
          </label>
          <label className={row}>
            <span>Warn when away or looking away for</span>
            <span className="inline-flex items-center gap-1 text-xs text-gray-400">
              <input type="number" min={1} max={15} value={settings.awayMin} onChange={(e) => updateFocusSettings({ awayMin: Math.min(15, Math.max(1, Number(e.target.value) || 2)) })} className="w-16 min-h-[36px] bg-[#212121] rounded-lg px-2 text-sm text-center" />
              min
            </span>
          </label>
          <div className={row}>
            <span>Pause the stopwatch if I'm away for more than 5 minutes</span>
            {toggle(settings.autoPause, 'Auto-pause when away', () => updateFocusSettings({ autoPause: !settings.autoPause }))}
          </div>
          <div className={row}>
            <span>Camera background in the pop-out window</span>
            {toggle(settings.pipCamera, 'Camera background in the pop-out', () => updateFocusSettings({ pipCamera: !settings.pipCamera }))}
          </div>
          <div className={row}>
            <span>Show a small self-view</span>
            {toggle(settings.preview, 'Self-view', () => updateFocusSettings({ preview: !settings.preview }))}
          </div>
          <div className={row}>
            <span className="text-xs text-gray-400">{settings.calibration ? 'Calibrated to where you look.' : 'Calibrates when it next starts.'}</span>
            <button type="button" onClick={() => withRuntime((rt) => rt.getController(dispatch).recalibrate())} className={`${pill} bg-[#212121] text-gray-300 hover:text-primary inline-flex items-center gap-1`}>
              <Crosshair className="w-3.5 h-3.5" /> Recalibrate
            </button>
          </div>
        </>
      )}
    </section>
  );
}
