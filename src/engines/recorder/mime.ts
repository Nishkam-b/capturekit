/**
 * MediaRecorder container/codec negotiation.
 * Order matters: VP9 gives the sharpest text for screen content; VP8 is the
 * broad fallback; MP4 is what Safari supports.
 */
export const AV_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4",
] as const;

export const VIDEO_ONLY_CANDIDATES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4;codecs=avc1",
  "video/mp4",
] as const;

export type IsTypeSupported = (mimeType: string) => boolean;

export function pickMimeType(
  withAudio: boolean,
  isTypeSupported: IsTypeSupported = (t) =>
    typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t),
): string | null {
  const list = withAudio ? AV_CANDIDATES : VIDEO_ONLY_CANDIDATES;
  return list.find((t) => isTypeSupported(t)) ?? null;
}

/**
 * Video bitrate heuristic: ~0.1 bits per pixel per frame, clamped.
 * 1920×1080@30 → ~6.2 Mbps, 2560×1440@30 → ~11 Mbps.
 */
export function videoBitrateFor(width: number, height: number, fps = 30): number {
  const raw = width * height * fps * 0.1;
  return Math.round(Math.min(25_000_000, Math.max(2_500_000, raw)));
}
