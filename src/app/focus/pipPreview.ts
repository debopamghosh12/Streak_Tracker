/**
 * Pop-out camera background. Shows the SAME MediaStream Focus watch already samples from — it
 * never opens the camera again and never runs detection; a <video> is just another sink for the
 * track. Kept free of React so it can be tested without a DOM.
 */

/** The bits of an HTMLVideoElement this needs. */
export interface VideoSink {
  srcObject: MediaProvider | null;
  play(): Promise<void> | void;
}

export type PipBackground = 'camera' | 'black';

/** Camera only when the setting is on, a stream exists, motion is allowed and playback hasn't failed. */
export function pipBackground(o: { cameraOn: boolean; stream: MediaStream | null; reducedMotion: boolean; failed: boolean }): PipBackground {
  return o.cameraOn && o.stream && !o.reducedMotion && !o.failed ? 'camera' : 'black';
}

export type PreviewResult = { ok: true } | { ok: false; reason: string };

/**
 * Points the (already attached) video at the stream and calls play() explicitly. Uses the
 * controller's own track — no clone, so there is nothing extra that could keep the camera on.
 * Resolves with the reason when the preview can't start (→ black + "Camera preview unavailable").
 */
export async function attachPreview(video: VideoSink, stream: MediaStream): Promise<PreviewResult> {
  const tracks = stream.getVideoTracks();
  if (!tracks.some((t) => t.readyState === 'live')) return { ok: false, reason: 'the camera track is not live' };
  if (video.srcObject !== stream) video.srcObject = stream;
  try {
    await video.play();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `video.play() was rejected (${(err as { name?: string })?.name ?? String(err)})` };
  }
}

/** Lets go of the stream. Never stops tracks: the Focus watch controller owns them. */
export function detachPreview(video: VideoSink | null | undefined) {
  if (video && video.srcObject) video.srcObject = null;
}
