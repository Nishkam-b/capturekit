import { CursorKind, type CursorEvent } from "../cursor/types";
import type { ZoomSegment, ZoomSettings } from "./types";

export interface DetectOptions {
  level: number;
  transitionMs: number;
  holdMs: number;
  onPauses: boolean;
  durationMs: number;
}

/** Interactions closer than this (ms) belong to one zoom. */
export const CLUSTER_GAP_MS = 3000;
/** Zooms whose gaps are shorter than this are merged (no quick out-and-in). */
export const MERGE_GAP_MS = 1500;
/** Clicks within this distance (normalised) share one zoom: they fit in the same zoomed view. */
export const SAME_AREA = 0.2;
/** Fully zoomed in this long before the first click of a zoom (ms). */
export const LEAD_MS = 250;
/** The zoom never starts more than this before the click (ms). */
const MAX_APPROACH_MS = 1600;
/** "Approaching" = within this distance of the click point (normalised). */
const APPROACH_RADIUS = 0.2;

/**
 * When the zoom-in should start for a click at (t, x, y): as the cursor makes its final
 * approach (enters the area around the click), but always early enough to be fully
 * zoomed in LEAD_MS before the click.
 */
export function approachStart(moves: readonly CursorEvent[], t: number, x: number, y: number, transitionMs: number): number {
  const latest = t - transitionMs - LEAD_MS;
  let start = latest;
  for (let i = moves.length - 1; i >= 0; i--) {
    const m = moves[i];
    if (m.t > t) continue;
    if (m.t < t - MAX_APPROACH_MS) break;
    if (Math.hypot(m.x - x, m.y - y) > APPROACH_RADIUS) break;
    start = Math.min(start, m.t);
  }
  return Math.max(t - MAX_APPROACH_MS, Math.min(start, latest));
}
/** A pause after movement counts as an interaction when it lasts this long. */
export const DWELL_MS = 1000;
/** Movement needed before a pause counts (normalised distance). */
const DWELL_TRAVEL = 0.08;

interface Interaction {
  t: number;
  x: number;
  y: number;
}

/** Clicks, plus (optionally) pauses that follow real movement. Plain movement never counts. */
export function findInteractions(events: readonly CursorEvent[], onPauses: boolean): Interaction[] {
  const sorted = [...events].sort((a, b) => a.t - b.t);
  const out: Interaction[] = sorted.filter((e) => e.kind === CursorKind.Down).map((e) => ({ t: e.t, x: e.x, y: e.y }));
  if (onPauses) {
    let travel = 0;
    let prev: CursorEvent | null = null;
    for (let i = 0; i < sorted.length; i++) {
      const e = sorted[i];
      if (e.kind === CursorKind.Leave) {
        travel = 0;
        prev = null;
        continue;
      }
      if (prev) travel += Math.hypot(e.x - prev.x, e.y - prev.y);
      // A pause only counts when a later event proves the cursor stopped there (not the end of the data).
      const next = sorted[i + 1];
      const pause = next ? next.t - e.t : 0;
      if (e.kind === CursorKind.Move && pause >= DWELL_MS && travel >= DWELL_TRAVEL) {
        out.push({ t: e.t, x: e.x, y: e.y });
        travel = 0;
      }
      prev = e;
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Groups interactions into zoom segments. */
export function detectZoomSegments(events: readonly CursorEvent[], o: DetectOptions): ZoomSegment[] {
  const points = findInteractions(events, o.onPauses);
  if (points.length === 0) return [];

  // 1. Cluster by time AND place: clicks close together in the same area share one steady zoom.
  const clusters: Interaction[][] = [];
  const centre = (c: Interaction[]) => ({ x: c.reduce((a, p) => a + p.x, 0) / c.length, y: c.reduce((a, p) => a + p.y, 0) / c.length });
  for (const p of points) {
    const last = clusters[clusters.length - 1];
    const near = last && Math.hypot(p.x - centre(last).x, p.y - centre(last).y) <= SAME_AREA;
    if (last && near && p.t - last[last.length - 1].t <= CLUSTER_GAP_MS) last.push(p);
    else clusters.push([p]);
  }

  // 2. Segments: zoom in during the approach (fully in just before the first click), hold after the last.
  const moves = [...events].filter((e) => e.kind === CursorKind.Move).sort((a, b) => a.t - b.t);
  let segs = clusters.map((c) => {
    const first = c[0];
    const last = c[c.length - 1];
    return {
      start: Math.max(0, approachStart(moves, first.t, first.x, first.y, o.transitionMs)),
      end: Math.min(o.durationMs, last.t + o.holdMs),
      x: c.reduce((s, p) => s + p.x, 0) / c.length,
      y: c.reduce((s, p) => s + p.y, 0) / c.length,
      key: `a${Math.round(first.t / 100)}`,
    };
  });

  // 3. Merge zooms on the same area with short gaps (no quick out-and-in). Zooms on different areas stay
  //    separate; if they'd overlap, the first one ends where the next begins (a smooth move between them).
  const merged: typeof segs = [];
  for (const s of segs) {
    const prev = merged[merged.length - 1];
    const sameArea = prev && Math.hypot(s.x - prev.x, s.y - prev.y) <= SAME_AREA;
    if (prev && sameArea && s.start - (prev.end + o.transitionMs) < MERGE_GAP_MS) {
      prev.end = Math.max(prev.end, s.end);
    } else {
      if (prev && s.start < prev.end) prev.end = Math.max(prev.start + o.transitionMs, s.start);
      merged.push({ ...s });
    }
  }
  segs = merged.filter((s) => s.end > s.start);

  return segs.map((s) => ({
    id: s.key,
    key: s.key,
    start: Math.round(s.start),
    end: Math.round(s.end),
    level: o.level,
    // Steady on the click area: the view doesn't chase the cursor.
    mode: "fixed" as const,
    x: s.x,
    y: s.y,
    auto: true,
  }));
}

/**
 * Replaces auto segments with freshly detected ones (keeping manual/edited
 * segments and skipping dismissed ones). With auto off, removes auto segments.
 */
export function withAutoSegments(zoom: ZoomSettings, events: readonly CursorEvent[], durationMs: number): ZoomSettings {
  const manual = zoom.segments.filter((s) => !s.auto);
  if (!zoom.auto || events.length === 0) return { ...zoom, segments: manual };
  const auto = detectZoomSegments(events, {
    level: zoom.level,
    transitionMs: zoom.transitionMs,
    holdMs: zoom.holdMs,
    onPauses: zoom.onPauses,
    durationMs,
  }).filter((s) => !zoom.dismissed.includes(s.key!) && !manual.some((m) => overlaps(m, s)));
  return { ...zoom, segments: [...manual, ...auto].sort((a, b) => a.start - b.start) };
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }) {
  return a.start < b.end && b.start < a.end;
}
