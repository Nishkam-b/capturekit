import type { ZoomCamera, ZoomSegment } from "./types";

const IDENTITY: ZoomCamera = { scale: 1, cx: 0.5, cy: 0.5 };

/** Smooth start and stop (ease-in-out cubic). */
export function ease(k: number): number {
  const x = Math.min(1, Math.max(0, k));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** 0..1 influence of a segment at time t (ramps in after start, out after end). */
export function segmentWeight(s: ZoomSegment, t: number, transitionMs: number): number {
  const T = Math.max(1, transitionMs);
  if (t < s.start || t > s.end + T) return 0;
  const inK = ease((t - s.start) / T);
  const outK = t > s.end ? 1 - ease((t - s.end) / T) : 1;
  return Math.min(inK, outK);
}

/**
 * Camera at source time t. Each zoom holds a steady view on its centre; overlapping
 * zooms blend continuously (scale = max, centre = weighted).
 */
export function zoomAt(segments: readonly ZoomSegment[], transitionMs: number, t: number): ZoomCamera {
  let scale = 1;
  let wsum = 0;
  let cx = 0;
  let cy = 0;
  for (const s of segments) {
    const w = segmentWeight(s, t, transitionMs);
    if (w <= 0) continue;
    const segScale = 1 + (s.level - 1) * w;
    scale = Math.max(scale, segScale);
    const k = segScale - 1;
    cx += s.x * k;
    cy += s.y * k;
    wsum += k;
  }
  if (scale <= 1.0001 || wsum === 0) return IDENTITY;
  return { scale, cx: cx / wsum, cy: cy / wsum };
}

export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Zoomed view of `src` (pixels in the source frame): 1/scale of its size,
 * centred on the camera point but never leaving `src`.
 */
export function zoomRect(src: PixelRect, sourceW: number, sourceH: number, cam: ZoomCamera): PixelRect {
  if (cam.scale <= 1.0001) return src;
  const w = src.w / cam.scale;
  const h = src.h / cam.scale;
  const px = cam.cx * sourceW;
  const py = cam.cy * sourceH;
  const x = Math.min(src.x + src.w - w, Math.max(src.x, px - w / 2));
  const y = Math.min(src.y + src.h - h, Math.max(src.y, py - h / 2));
  return { x, y, w, h };
}
