import { CursorKind, type CursorEvent } from "../cursor/types";

/**
 * Screen-activity analysis: estimates where the "action" is in a recording by
 * comparing low-resolution frames, so automatic zoom works without any cursor
 * telemetry (screen, window or tab recordings; no extension needed).
 *
 * Output is a list of pseudo cursor events: Move events trace where activity is
 * (for the follow camera) and Down/Up pairs mark interactions (zoom triggers).
 * It is an estimate and is labelled as such in the UI.
 */

export interface GrayFrame {
  /** Source time (ms). */
  t: number;
  /** Grayscale pixels, row-major, width × height. */
  data: Uint8Array;
}

export interface ActivityOptions {
  width: number;
  height: number;
  cellsX?: number;
  cellsY?: number;
  /** Per-pixel brightness change that counts as "changed" (0..255). */
  pixelThreshold?: number;
  /** Fraction of a cell's pixels that must change for the cell to count. */
  cellFraction?: number;
}

export interface ActivityPoint {
  t: number;
  x: number;
  y: number;
  /** Changed cells in this step (after masking). */
  cells: number;
  /** Bounding box of the changed cells, in cells. */
  spanX: number;
  spanY: number;
}

/** Cells changing in more than this share of steps are constant animation (clocks, spinners) and ignored. */
export const NOISY_CELL_SHARE = 0.4;
/** A step changing more than this share of cells is a scroll/page change, not a point of interest. */
export const GLOBAL_CHANGE_SHARE = 0.35;

/** Changed cells between two grayscale frames (1 = changed). */
export function diffGrid(prev: Uint8Array, next: Uint8Array, o: ActivityOptions): Uint8Array {
  const cx = o.cellsX ?? 32;
  const cy = o.cellsY ?? 18;
  const thr = o.pixelThreshold ?? 24;
  const frac = o.cellFraction ?? 0.03;
  const cw = o.width / cx;
  const ch = o.height / cy;
  const counts = new Uint32Array(cx * cy);
  for (let y = 0; y < o.height; y++) {
    const gy = Math.min(cy - 1, Math.floor(y / ch));
    const row = y * o.width;
    for (let x = 0; x < o.width; x++) {
      const p = row + x;
      const d = prev[p] - next[p];
      if (d > thr || d < -thr) counts[gy * cx + Math.min(cx - 1, Math.floor(x / cw))]++;
    }
  }
  const grid = new Uint8Array(cx * cy);
  const need = cw * ch * frac;
  for (let c = 0; c < grid.length; c++) grid[c] = counts[c] > need ? 1 : 0;
  return grid;
}

/** Changed-cell grids for each consecutive pair of frames. */
export function changeGrids(frames: readonly GrayFrame[], o: ActivityOptions): Array<{ t: number; grid: Uint8Array }> {
  const out: Array<{ t: number; grid: Uint8Array }> = [];
  for (let i = 1; i < frames.length; i++) out.push({ t: frames[i].t, grid: diffGrid(frames[i - 1].data, frames[i].data, o) });
  return out;
}

/** Points of localised activity over time (constant animations and full-screen changes removed). */
export function activityPoints(grids: ReadonlyArray<{ t: number; grid: Uint8Array }>, cellsX = 32, cellsY = 18): ActivityPoint[] {
  if (grids.length === 0) return [];
  const n = cellsX * cellsY;
  const freq = new Uint32Array(n);
  for (const g of grids) for (let c = 0; c < n; c++) freq[c] += g.grid[c];
  const noisy = new Uint8Array(n);
  if (grids.length >= 10) for (let c = 0; c < n; c++) noisy[c] = freq[c] / grids.length > NOISY_CELL_SHARE ? 1 : 0;

  const points: ActivityPoint[] = [];
  for (const g of grids) {
    let count = 0;
    let sx = 0;
    let sy = 0;
    let minX = cellsX;
    let maxX = -1;
    let minY = cellsY;
    let maxY = -1;
    for (let c = 0; c < n; c++) {
      if (!g.grid[c] || noisy[c]) continue;
      const x = c % cellsX;
      const y = Math.floor(c / cellsX);
      count++;
      sx += x + 0.5;
      sy += y + 0.5;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    if (count === 0 || count / n > GLOBAL_CHANGE_SHARE) continue;
    points.push({ t: g.t, x: sx / count / cellsX, y: sy / count / cellsY, cells: count, spanX: maxX - minX + 1, spanY: maxY - minY + 1 });
  }
  return points;
}

/** How far (normalised) a change may wander and still be "the same spot". */
const SAME_SPOT = 0.08;
/** Max spread of three consecutive changes for them to count as staying put (typing, not a moving cursor). */
const STAY_PUT = 0.025;
/** Activity in a new spot after this much quiet there counts as a new interaction. */
const QUIET_MS = 1200;

/**
 * Turns activity points into pseudo cursor events.
 * An interaction (Down/Up) is a change that is either sizeable (spans ≥ 3×3 cells,
 * e.g. a dialog or menu appearing) or that stays in one spot for three consecutive
 * steps (typing). A small blob that keeps moving (the cursor itself) never is.
 */
export function activityToEvents(points: readonly ActivityPoint[]): CursorEvent[] {
  const events: CursorEvent[] = [];
  let lastInteraction: { t: number; x: number; y: number } | null = null;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    events.push({ t: p.t, x: p.x, y: p.y, kind: CursorKind.Move });
    const a = points[i - 2];
    const b = points[i - 1];
    const stationary =
      !!a &&
      !!b &&
      p.t - a.t < 900 &&
      Math.max(Math.hypot(p.x - a.x, p.y - a.y), Math.hypot(p.x - b.x, p.y - b.y), Math.hypot(a.x - b.x, a.y - b.y)) < STAY_PUT;
    // A panel, menu or dialog: the change covers an area, not a cursor-sized blob.
    const sizeable = p.spanX >= 3 && p.spanY >= 3;
    if (!stationary && !sizeable) continue;
    const sameAsLast =
      lastInteraction && p.t - lastInteraction.t < QUIET_MS && Math.hypot(p.x - lastInteraction.x, p.y - lastInteraction.y) < SAME_SPOT * 2;
    lastInteraction = { t: p.t, x: p.x, y: p.y };
    if (sameAsLast) continue;
    events.push({ t: p.t, x: p.x, y: p.y, kind: CursorKind.Down });
    events.push({ t: p.t + 60, x: p.x, y: p.y, kind: CursorKind.Up });
  }
  return events.sort((a, b) => a.t - b.t);
}

/** Full pipeline on in-memory frames (unit-testable). */
export function analyzeFrames(frames: readonly GrayFrame[], o: ActivityOptions): CursorEvent[] {
  const cx = o.cellsX ?? 32;
  const cy = o.cellsY ?? 18;
  return activityToEvents(activityPoints(changeGrids(frames, o), cx, cy));
}
