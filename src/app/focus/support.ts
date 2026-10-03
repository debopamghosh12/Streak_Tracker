/** Focus watch targets desktop Chrome and Edge; elsewhere the feature is hidden with a note. */
export function focusSupport(): { ok: boolean; reason: string } {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return { ok: false, reason: '' };
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  const mobile = uaData?.mobile ?? /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if (mobile) return { ok: false, reason: 'Focus watch works on desktop Chrome or Edge only.' };
  if (!navigator.mediaDevices?.getUserMedia) return { ok: false, reason: 'This browser has no camera access, so Focus watch is unavailable.' };
  if (!('MediaStreamTrackProcessor' in window) && !('ImageCapture' in window)) {
    return { ok: false, reason: 'Focus watch needs desktop Chrome or Edge.' };
  }
  return { ok: true, reason: '' };
}
