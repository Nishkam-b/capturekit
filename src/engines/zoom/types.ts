/**
 * Manual zoom model. Times are source-recording ms (so cuts don't move zooms);
 * the zoom centre is normalised (0..1) to the full source frame.
 */

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;

export interface ZoomSegment {
  id: string;
  /** Zoom-in begins at `start`; fully zoomed at start + transition. */
  start: number;
  /** Zoom-out begins at `end`; back to 1× at end + transition. */
  end: number;
  /** Zoom factor (1–4). */
  level: number;
  /** Centre of the zoomed view, 0..1 of the source frame. */
  x: number;
  y: number;
}

export interface ZoomSettings {
  /** Level used for new zooms. */
  level: number;
  /** Duration of zoom in / out transitions (ms). */
  transitionMs: number;
  segments: ZoomSegment[];
}

export const DEFAULT_ZOOM: ZoomSettings = {
  level: 2,
  transitionMs: 700,
  segments: [],
};

/** Camera for one frame: zoom `scale` centred on (cx, cy) in normalised source coords. */
export interface ZoomCamera {
  scale: number;
  cx: number;
  cy: number;
}

/**
 * Zoom settings from any older version: automatic zooms are dropped (the feature was
 * removed), manual ones keep their level and centre.
 */
export function normalizeZoom(z: unknown): ZoomSettings {
  const o = (z ?? {}) as Partial<Omit<ZoomSettings, "segments">> & { segments?: Array<Partial<ZoomSegment> & { auto?: boolean }> };
  const segments = (o.segments ?? [])
    .filter((s) => !s.auto && typeof s.start === "number" && typeof s.end === "number")
    .map((s) => ({
      id: String(s.id),
      start: s.start!,
      end: s.end!,
      level: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, s.level ?? 2)),
      x: s.x ?? 0.5,
      y: s.y ?? 0.5,
    }));
  return {
    level: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, o.level ?? DEFAULT_ZOOM.level)),
    transitionMs: o.transitionMs ?? DEFAULT_ZOOM.transitionMs,
    segments,
  };
}
