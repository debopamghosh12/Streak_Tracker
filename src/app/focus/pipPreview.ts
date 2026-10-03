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

/** Points the video at the stream and plays it. Resolves false if playback fails (→ black). */
export async function attachPreview(video: VideoSink, stream: MediaStream): Promise<boolean> {
  if (video.srcObject !== stream) video.srcObject = stream;
  try {
    await video.play();
    return true;
  } catch {
    return false;
  }
}

/** Lets go of the stream. Never stops tracks: the Focus watch controller owns them. */
export function detachPreview(video: VideoSink | null | undefined) {
  if (video && video.srcObject) video.srcObject = null;
}
