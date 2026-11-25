import type { ZoomSegment } from "./types";

/** How long a "zoom here" mark stays zoomed in (ms). */
export const MARKER_HOLD_MS = 2500;

/**
 * Turns "zoom here" marks pressed while recording into manual zoom segments.
 * Marks closer together than a zoom's length extend the same zoom instead of
 * starting a new one. They hold a steady view; once the cursor is known they are moved
 * onto its spot (see placeMarkers).
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
    out.push({ id: `marker-${out.length + 1}-${start}`, start, end, level, mode: "fixed", x: 0.5, y: 0.5, auto: false });
  }
  return out;
}

/** Where the cursor was at source time t (nearest Move sample within 1.5 s), or null. */
export function pointerAt(events: readonly { t: number; x: number; y: number; kind: number }[], t: number): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestD = 1500;
  for (const e of events) {
    if (e.kind !== 0) continue;
    const d = Math.abs(e.t - t);
    if (d < bestD) {
      bestD = d;
      best = { x: e.x, y: e.y };
    }
  }
  return best;
}

/** Puts marker zooms on the cursor's spot (steady view), when cursor data is available. */
export function placeMarkers(segments: readonly ZoomSegment[], events: Parameters<typeof pointerAt>[0]): ZoomSegment[] {
  return segments.map((s) => {
    if (!s.id.startsWith("marker-")) return s;
    const p = pointerAt(events, s.start + 300);
    return p ? { ...s, mode: "fixed", x: p.x, y: p.y } : s;
  });
}
