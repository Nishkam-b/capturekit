import { CursorKind, type CursorEvent } from "./types";

/** Sample rate of the precomputed cursor path. */
export const PATH_HZ = 60;
const DT = 1000 / PATH_HZ;
/** Click effects stay alive this long (ms). */
export const CLICK_MS = 550;

export interface CursorPath {
  t0: number;
  /** Interleaved smoothed x,y per sample. */
  xy: Float32Array;
  /** 1 = cursor on the surface. */
  visible: Uint8Array;
  /** ms since the last real movement, per sample (for hide-when-still). */
  idle: Float32Array;
  clicks: Array<{ t: number; x: number; y: number }>;
  count: number;
}

export interface CursorState {
  x: number;
  y: number;
  visible: boolean;
  idleMs: number;
  /** Clicks still animating: age in ms (0..CLICK_MS). */
  clicks: Array<{ age: number; x: number; y: number }>;
  pressed: boolean;
}

/**
 * Precomputes a smoothed path so preview and export draw identical cursors.
 * smoothing 0 = raw positions; 1 = very smooth (critically damped spring).
 */
export function buildCursorPath(events: readonly CursorEvent[], smoothing: number): CursorPath | null {
  if (events.length === 0) return null;
  const sorted = [...events].sort((a, b) => a.t - b.t);
  const t0 = Math.floor(sorted[0].t);
  const tEnd = sorted[sorted.length - 1].t + CLICK_MS;
  const count = Math.max(1, Math.ceil((tEnd - t0) / DT) + 1);
  const xy = new Float32Array(count * 2);
  const visible = new Uint8Array(count);
  const idle = new Float32Array(count);

  const s = Math.min(1, Math.max(0, smoothing));
  const omega = 60 - s * 52; // rad/s: 60 ≈ snappy, 8 ≈ floaty
  const useSpring = s > 0.01;

  let ei = 0;
  let rawX = sorted[0].x;
  let rawY = sorted[0].y;
  let shown = sorted[0].kind !== CursorKind.Leave;
  let lastMove = sorted[0].t;
  let x = rawX;
  let y = rawY;
  let vx = 0;
  let vy = 0;
  let prev: CursorEvent | null = null;

  for (let i = 0; i < count; i++) {
    const t = t0 + i * DT;
    while (ei < sorted.length && sorted[ei].t <= t) {
      const e = sorted[ei];
      if (e.kind === CursorKind.Leave) {
        shown = false;
      } else {
        if (!shown) {
          // Re-entering: jump, don't glide in from where it left.
          x = e.x;
          y = e.y;
          vx = vy = 0;
        }
        shown = true;
        if (e.kind === CursorKind.Move && (e.x !== rawX || e.y !== rawY)) lastMove = e.t;
        rawX = e.x;
        rawY = e.y;
      }
      prev = e;
      ei++;
    }
    // Linear interpolation towards the next move if it's close in time (fills gaps between ~16ms samples).
    let tx = rawX;
    let ty = rawY;
    const next = sorted[ei];
    if (shown && prev && next && next.kind !== CursorKind.Leave && next.t - prev.t < 120 && next.t > prev.t) {
      const f = (t - prev.t) / (next.t - prev.t);
      tx = prev.x + (next.x - prev.x) * f;
      ty = prev.y + (next.y - prev.y) * f;
    }
    if (useSpring && i > 0) {
      const h = DT / 1000;
      vx += (omega * omega * (tx - x) - 2 * omega * vx) * h;
      vy += (omega * omega * (ty - y) - 2 * omega * vy) * h;
      x += vx * h;
      y += vy * h;
    } else {
      x = tx;
      y = ty;
    }
    xy[i * 2] = x;
    xy[i * 2 + 1] = y;
    visible[i] = shown ? 1 : 0;
    idle[i] = Math.max(0, t - lastMove);
  }

  const clicks = sorted
    .filter((e) => e.kind === CursorKind.Down)
    .map((e) => {
      const i = Math.min(count - 1, Math.max(0, Math.round((e.t - t0) / DT)));
      return { t: e.t, x: xy[i * 2], y: xy[i * 2 + 1] };
    });

  return { t0, xy, visible, idle, clicks, count };
}

/** Cursor state at active time `t` (ms). */
export function cursorStateAt(path: CursorPath, t: number, pressedRanges?: Array<[number, number]>): CursorState {
  const raw = (t - path.t0) / DT;
  if (raw < 0) return { x: 0, y: 0, visible: false, idleMs: 0, clicks: [], pressed: false };
  const i = Math.min(path.count - 1, Math.round(raw));
  const clicks: CursorState["clicks"] = [];
  for (const c of path.clicks) {
    const age = t - c.t;
    if (age >= 0 && age <= CLICK_MS) clicks.push({ age, x: c.x, y: c.y });
  }
  const pressed = !!pressedRanges?.some(([a, b]) => t >= a && t <= b);
  return { x: path.xy[i * 2], y: path.xy[i * 2 + 1], visible: path.visible[i] === 1 && raw <= path.count, idleMs: path.idle[i], clicks, pressed };
}

/** [down, up] time ranges, for drawing the cursor slightly pressed. */
export function pressedRanges(events: readonly CursorEvent[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let down: number | null = null;
  for (const e of [...events].sort((a, b) => a.t - b.t)) {
    if (e.kind === CursorKind.Down) down = e.t;
    else if (e.kind === CursorKind.Up && down !== null) {
      out.push([down, e.t]);
      down = null;
    }
  }
  return out;
}

/** Everything the renderer needs from cursor telemetry. */
export interface CursorBundle {
  /** Path drawn as the cursor (user smoothing). */
  path: CursorPath;
  pressed: Array<[number, number]>;
  /** Heavily smoothed path the zoom camera follows. */
  follow: CursorPath;
}
