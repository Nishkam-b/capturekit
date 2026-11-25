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
export const CLUSTER_GAP_MS = 2500;
/** Zooms whose gaps are shorter than this are merged (no quick out-and-in). */
export const MERGE_GAP_MS = 1200;
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

  // 1. Cluster by time.
  const clusters: Interaction[][] = [];
  for (const p of points) {
    const last = clusters[clusters.length - 1];
    if (last && p.t - last[last.length - 1].t <= CLUSTER_GAP_MS) last.push(p);
    else clusters.push([p]);
  }

  // 2. Segments: fully zoomed by the first interaction, hold after the last.
  let segs = clusters.map((c) => {
    const first = c[0];
    const last = c[c.length - 1];
    return {
      start: Math.max(0, first.t - o.transitionMs),
      end: Math.min(o.durationMs, last.t + o.holdMs),
      x: c.reduce((s, p) => s + p.x, 0) / c.length,
      y: c.reduce((s, p) => s + p.y, 0) / c.length,
      key: `a${Math.round(first.t / 100)}`,
    };
  });

  // 3. Merge zooms with short gaps (gap measured after the zoom-out finishes).
  const merged: typeof segs = [];
  for (const s of segs) {
    const prev = merged[merged.length - 1];
    if (prev && s.start - (prev.end + o.transitionMs) < MERGE_GAP_MS) {
      prev.end = Math.max(prev.end, s.end);
    } else merged.push({ ...s });
  }
  segs = merged.filter((s) => s.end > s.start);

  return segs.map((s) => ({
    id: s.key,
    key: s.key,
    start: Math.round(s.start),
    end: Math.round(s.end),
    level: o.level,
    mode: "follow" as const,
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
