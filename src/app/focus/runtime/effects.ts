import type { WarningKind } from '../../../lib/focus/warnings';

let audio: AudioContext | null = null;

/** Create/resume the audio context from a user gesture (turning Focus watch on), so the chime can play later. */
export function primeAudio() {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    /* no audio */
  }
}

/** A short, soft two-note chime. */
export function chime() {
  try {
    audio ??= new AudioContext();
    const ctx = audio;
    const t = ctx.currentTime;
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.12, t + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t + i * 0.18);
      osc.stop(t + i * 0.18 + 0.3);
    });
  } catch {
    /* no audio */
  }
}

/** Ask for notification permission once (when Focus watch is turned on). */
export async function requestNotifications() {
  try {
    if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
  } catch {
    /* ignore */
  }
}

let note: Notification | null = null;

export function notify(kind: WarningKind, text: string) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    note?.close();
    note = new Notification(text, {
      body: kind === 'phone' ? 'Your stopwatch is still running.' : 'Your stopwatch is still running. Back to it?',
      tag: 'persist-focus',
      silent: true,
    });
    note.onclick = () => {
      window.focus();
      note?.close();
    };
  } catch {
    /* ignore */
  }
}

export function clearNotification() {
  note?.close();
  note = null;
}

let savedTitle: string | null = null;

/** Flash the tab title while a warning is active (RunningTitle steps aside via focusStatus.titleAlert). */
export function flashTitle(on: boolean) {
  if (on) {
    if (savedTitle === null) savedTitle = document.title;
    document.title = 'Come back — Persist';
  } else if (savedTitle !== null) {
    document.title = savedTitle;
    savedTitle = null;
  }
}
