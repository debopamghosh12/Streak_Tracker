import type { Frame, FrameSource } from './controller';

/** Low-resolution, low-frame-rate camera: enough for a sample every 2 s. Video never leaves the device. */
export async function openCamera(): Promise<MediaStream> {
  // Dev-only hook used for automated background-tab testing with a synthetic camera.
  const fake = import.meta.env.DEV ? (window as Window & { __persistFakeCamera?: () => MediaStream }).__persistFakeCamera : undefined;
  if (fake) return fake();
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 5, max: 10 }, facingMode: 'user' },
  });
}

type Processor = new (init: { track: MediaStreamTrack }) => { readable: ReadableStream<VideoFrame> };
type ImageCaptureCtor = new (track: MediaStreamTrack) => { grabFrame(): Promise<ImageBitmap> };

/**
 * Reads frames in a way that keeps working while the tab is hidden:
 * 1. MediaStreamTrackProcessor (Chrome/Edge): frames keep arriving regardless of visibility;
 *    we keep only the newest one and close the rest.
 * 2. ImageCapture.grabFrame() as a fallback.
 * 3. A video element + canvas as a last resort (may stall in a hidden tab → "Focus watch paused").
 */
export function createFrameSource(stream: MediaStream): FrameSource {
  const track = stream.getVideoTracks()[0];
  const w = window as unknown as { MediaStreamTrackProcessor?: Processor; ImageCapture?: ImageCaptureCtor };

  if (w.MediaStreamTrackProcessor && track) {
    const reader = new w.MediaStreamTrackProcessor({ track }).readable.getReader();
    let latest: VideoFrame | null = null;
    let lastAt = 0;
    let closed = false;
    void (async () => {
      try {
        while (!closed) {
          const { value, done } = await reader.read();
          if (done || !value) break;
          if (closed) {
            value.close();
            break;
          }
          latest?.close();
          latest = value;
          lastAt = Date.now();
        }
      } catch {
        /* track ended */
      }
    })();
    return {
      // Hand over the newest frame; the controller closes it after detection.
      async grab() {
        const f = latest;
        latest = null;
        return f as Frame | null;
      },
      lastFrameAt: () => lastAt,
      close() {
        closed = true;
        latest?.close();
        latest = null;
        void reader.cancel().catch(() => {});
      },
    };
  }

  if (w.ImageCapture && track) {
    const capture = new w.ImageCapture(track);
    let lastAt = 0;
    return {
      async grab() {
        const bmp = await capture.grabFrame();
        lastAt = Date.now();
        return bmp as Frame;
      },
      lastFrameAt: () => lastAt,
      close() {},
    };
  }

  // Last resort: a muted, unattached video element drawn to a small canvas.
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  void video.play().catch(() => {});
  const canvas = document.createElement('canvas');
  let lastTime = -1;
  let lastAt = 0;
  return {
    async grab() {
      if (video.readyState < 2 || video.currentTime === lastTime) return null;
      lastTime = video.currentTime;
      lastAt = Date.now();
      canvas.width = 320;
      canvas.height = Math.round((320 * (video.videoHeight || 240)) / (video.videoWidth || 320));
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas as unknown as Frame;
    },
    lastFrameAt: () => lastAt,
    close() {
      video.srcObject = null;
    },
  };
}
