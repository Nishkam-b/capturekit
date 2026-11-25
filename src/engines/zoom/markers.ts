import type { ZoomSegment } from "./types";

/** How long a "zoom here" mark stays zoomed in (ms). */
export const MARKER_HOLD_MS = 2500;

/**
 * Turns "zoom here" marks pressed while recording into manual zoom segments.
 * Marks closer together than a zoom's length extend the same zoom instead of
 * starting a new one. Segments follow the action when activity data exists and
 * otherwise stay centred (the camera falls back to x/y without a follow path).
 */
export function markerSegments(marks: readonly number[], durationMs: number, level = 2): ZoomSegment[] {
  const sorted = marks.filter((m) => Number.isFinite(m) && m >= 0 && m < durationMs).sort((a, b) => a - b);
  const out: ZoomSegment[] = [];
  for (const m of sorted) {
    const start = Math.max(0, Math.round(m - 300));
    const end = Math.min(durationMs, Math.round(m + MARKER_HOLD_MS));
    const last = out[out.length - 1];
    if (last && start <= last.end) {
      last.end = Math.max(last.end, end);
      continue;
    }
    out.push({ id: `marker-${out.length + 1}-${start}`, start, end, level, mode: "follow", x: 0.5, y: 0.5, auto: false });
  }
  return out;
}
