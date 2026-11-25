import { CursorKind, type CursorEvent } from "../cursor/types";

/**
 * Finds the mouse cursor in screen/window recordings (the system draws it into the
 * video) and infers clicks, so automatic zoom works from the video alone.
 *
 * Per sampled frame:
 *  1. Diff against the previous frame; group changed pixels into small blobs.
 *  2. Score cursor-sized blobs with an arrow template (normalised cross-correlation,
 *     both polarities: white arrow/dark edge as on Windows, black arrow/light edge as on macOS).
 *  3. When nothing moves, confirm the cursor is still where it was.
 * Then, over the whole track: a click is the cursor arriving and stopping, followed by
 * the screen reacting next to it (a menu, dialog, highlight or page change).
 */

export interface DetectorOptions {
  width: number;
  height: number;
}

export interface CursorSample {
  t: number;
  /** Tip position, normalised 0..1. */
  x: number;
  y: number;
  /** Cursor-template confidence 0..1 (0 = position carried over / guessed). */
  score: number;
}

export interface Reaction {
  t: number;
  /** Centre of the changed area that isn't the cursor, normalised. */
  x: number;
  y: number;
  /** Share of the frame that changed (excluding the cursor). */
  area: number;
}

/** Arrow outline (tip at 0,0), in units of the arrow height. Matches common OS arrows closely enough. */
const ARROW: Array<[number, number]> = [
  [0, 0],
  [0, 0.8],
  [0.2, 0.62],
  [0.33, 0.92],
  [0.45, 0.86],
  [0.33, 0.58],
  [0.58, 0.58],
];

interface Template {
  h: number;
  w: number;
  /** Offsets (dy * stride + dx computed at use) and template value: +1 inside, -1 ring. */
  dx: Int16Array;
  dy: Int16Array;
  v: Float32Array;
  mean: number;
  norm: number;
}

function inPoly(x: number, y: number, poly: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Template at arrow height h (px): inside pixels +1, a ring around the outline -1. */
export function arrowTemplate(h: number): Template {
  const poly = ARROW.map(([x, y]) => [x * h, y * h] as [number, number]);
  const ring = Math.max(1.5, h / 10);
  const w = Math.ceil(0.6 * h + ring + 1);
  const H = Math.ceil(0.95 * h + ring + 1);
  const dx: number[] = [];
  const dy: number[] = [];
  const v: number[] = [];
  const pad = Math.ceil(ring);
  for (let y = -pad; y < H; y++) {
    for (let x = -pad; x < w; x++) {
      const cx = x + 0.5;
      const cy = y + 0.5;
      if (inPoly(cx, cy, poly)) {
        dx.push(x);
        dy.push(y);
        v.push(1);
        continue;
      }
      // Distance to the polygon (approximate: nearest of 8 directions within the ring).
      let near = false;
      for (let a = 0; a < 8 && !near; a++) {
        const ang = (a * Math.PI) / 4;
        if (inPoly(cx + Math.cos(ang) * ring, cy + Math.sin(ang) * ring, poly)) near = true;
      }
      if (near) {
        dx.push(x);
        dy.push(y);
        v.push(-1);
      }
    }
  }
  const vv = Float32Array.from(v);
  const mean = vv.reduce((s, a) => s + a, 0) / vv.length;
  let norm = 0;
  for (let i = 0; i < vv.length; i++) {
    vv[i] -= mean;
    norm += vv[i] * vv[i];
  }
  return { h, w, dx: Int16Array.from(dx), dy: Int16Array.from(dy), v: vv, mean, norm: Math.sqrt(norm) };
}

/** |NCC| of a template with the image at tip (px, py). Returns 0 when off-frame or flat. */
export function matchAt(img: Uint8Array, W: number, H: number, t: Template, px: number, py: number): number {
  let s = 0;
  let ss = 0;
  const n = t.v.length;
  let dot = 0;
  for (let i = 0; i < n; i++) {
    const x = px + t.dx[i];
    const y = py + t.dy[i];
    if (x < 0 || y < 0 || x >= W || y >= H) return 0;
    const p = img[y * W + x];
    s += p;
    ss += p * p;
    dot += p * t.v[i];
  }
  const varI = ss - (s * s) / n;
  if (varI < n * 40) return 0; // nearly flat patch: no cursor here
  // t.v is zero-mean, so Σ(p - mean_p)·v = Σ p·v
  return Math.abs(dot) / (Math.sqrt(varI) * t.norm);
}

export interface Blob {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cells: number;
}

const CELL = 8;

/** Changed 8×8 cells between two frames, grouped into connected blobs. */
export function changedBlobs(prev: Uint8Array, next: Uint8Array, W: number, H: number, thr = 28): { blobs: Blob[]; changed: number; total: number } {
  const cw = Math.ceil(W / CELL);
  const ch = Math.ceil(H / CELL);
  const counts = new Uint16Array(cw * ch);
  for (let y = 0; y < H; y++) {
    const row = y * W;
    const cy = ((y / CELL) | 0) * cw;
    for (let x = 0; x < W; x++) {
      const d = prev[row + x] - next[row + x];
      if (d > thr || d < -thr) counts[cy + ((x / CELL) | 0)]++;
    }
  }
  const on = new Uint8Array(cw * ch);
  let changed = 0;
  for (let i = 0; i < on.length; i++) if (counts[i] >= 2) {
      on[i] = 1;
      changed++;
    }
  const seen = new Uint8Array(on.length);
  const blobs: Blob[] = [];
  const stack: number[] = [];
  for (let i = 0; i < on.length; i++) {
    if (!on[i] || seen[i]) continue;
    const b: Blob = { x0: cw, y0: ch, x1: -1, y1: -1, cells: 0 };
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      const cx = c % cw;
      const cy = (c / cw) | 0;
      b.cells++;
      b.x0 = Math.min(b.x0, cx);
      b.x1 = Math.max(b.x1, cx);
      b.y0 = Math.min(b.y0, cy);
      b.y1 = Math.max(b.y1, cy);
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const nx = cx + ox;
          const ny = cy + oy;
          if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
          const k = ny * cw + nx;
          if (on[k] && !seen[k]) {
            seen[k] = 1;
            stack.push(k);
          }
        }
      }
    }
    // to pixels
    blobs.push({ x0: b.x0 * CELL, y0: b.y0 * CELL, x1: Math.min(W, (b.x1 + 1) * CELL), y1: Math.min(H, (b.y1 + 1) * CELL), cells: b.cells });
  }
  return { blobs, changed, total: on.length };
}

/** Template confidence needed to accept a cursor. */
export const MATCH_MIN = 0.5;

/** Stateful per-frame detector. Feed frames in time order. */
export class CursorDetector {
  private prev: Uint8Array | null = null;
  private templates: Template[];
  private locked: Template | null = null;
  private lockVotes = new Map<number, number>();
  private last: { x: number; y: number; t: number } | null = null;
  /** Template of the last match (used to confirm a resting cursor before the scale is locked). */
  private lastTemplate: Template | null = null;
  readonly samples: CursorSample[] = [];
  readonly reactions: Reaction[] = [];
  private readonly W: number;
  private readonly H: number;

  constructor(o: DetectorOptions) {
    this.W = o.width;
    this.H = o.height;
    // Cursor heights from ~1.1% to ~4% of the frame height cover 100%–250% display scaling.
    const hs = new Set<number>();
    for (let f = 0.011; f <= 0.042; f *= 1.18) hs.add(Math.max(9, Math.round(f * o.height)));
    this.templates = [...hs].map(arrowTemplate);
  }

  /** Best template match in a box (pixels). */
  private search(img: Uint8Array, x0: number, y0: number, x1: number, y1: number, step = 1): { x: number; y: number; score: number; t: Template } | null {
    const list = this.locked ? [this.locked] : this.templates;
    let best: { x: number; y: number; score: number; t: Template } | null = null;
    for (const t of list) {
      const sx0 = Math.max(0, x0 - t.w);
      const sy0 = Math.max(0, y0 - t.h);
      for (let y = sy0; y <= y1; y += step) {
        for (let x = sx0; x <= x1; x += step) {
          const s = matchAt(img, this.W, this.H, t, x, y);
          if (!best || s > best.score) best = { x, y, score: s, t };
        }
      }
    }
    if (best && step > 1) {
      // refine around the coarse best
      const r = this.searchFine(img, best.t, best.x, best.y, step);
      if (r.score > best.score) best = { ...r, t: best.t };
    }
    return best;
  }

  private searchFine(img: Uint8Array, t: Template, cx: number, cy: number, r: number) {
    let best = { x: cx, y: cy, score: 0 };
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        const s = matchAt(img, this.W, this.H, t, x, y);
        if (s > best.score) best = { x, y, score: s };
      }
    }
    return best;
  }

  /** Adds a grayscale frame (W×H) at source time t (ms). */
  push(gray: Uint8Array, t: number): void {
    const prev = this.prev;
    this.prev = gray;
    if (!prev) return;
    const { blobs, changed, total } = changedBlobs(prev, gray, this.W, this.H);
    const maxCursor = Math.max(...this.templates.map((tp) => tp.h)) * 2.2;
    const small = blobs.filter((b) => b.x1 - b.x0 <= maxCursor * 1.6 && b.y1 - b.y0 <= maxCursor * 1.6).sort((a, b) => b.cells - a.cells);

    let found: { x: number; y: number; score: number; t: Template } | null = null;
    // Moving cursor: check small blobs, nearest to the last position first.
    const ordered = this.last
      ? [...small].sort((a, b) => dist2(center(a), this.last!, this.W, this.H) - dist2(center(b), this.last!, this.W, this.H))
      : small;
    for (const b of ordered.slice(0, 4)) {
      const m = this.search(gray, b.x0, b.y0, b.x1, b.y1, this.locked ? 1 : 2);
      if (m && m.score >= MATCH_MIN && (!found || m.score > found.score)) found = m;
      if (found && found.score > 0.75) break;
    }
    // Still cursor: confirm it hasn't moved.
    const confirmT = this.locked ?? this.lastTemplate;
    if (!found && this.last && confirmT) {
      const px = Math.round(this.last.x * this.W);
      const py = Math.round(this.last.y * this.H);
      const m = this.searchFine(gray, confirmT, px, py, 2);
      if (m.score >= MATCH_MIN * 0.85) found = { ...m, t: confirmT };
    }

    let cursorBox: Blob | null = null;
    if (found) {
      // Lock the scale once a few confident matches agree (faster, fewer false hits).
      if (!this.locked && found.score > 0.6) {
        const votes = (this.lockVotes.get(found.t.h) ?? 0) + 1;
        this.lockVotes.set(found.t.h, votes);
        if (votes >= 3) this.locked = found.t;
      }
      this.lastTemplate = found.t;
      const x = found.x / this.W;
      const y = found.y / this.H;
      this.samples.push({ t, x, y, score: found.score });
      this.last = { x, y, t };
      cursorBox = { x0: found.x - 4, y0: found.y - 4, x1: found.x + found.t.w + 4, y1: found.y + found.t.h + 4, cells: 0 };
    }

    // Reactions: changes that aren't the cursor (its old or new spot).
    const lastBox = this.lastBox;
    this.lastBox = cursorBox;
    let area = 0;
    let sx = 0;
    let sy = 0;
    for (const b of blobs) {
      if ((cursorBox && overlap(b, cursorBox)) || (lastBox && overlap(b, lastBox))) continue;
      const a = (b.x1 - b.x0) * (b.y1 - b.y0);
      area += a;
      sx += ((b.x0 + b.x1) / 2) * a;
      sy += ((b.y0 + b.y1) / 2) * a;
    }
    const share = area / (this.W * this.H);
    if (share > 0.0015 && changed / total < 0.6) this.reactions.push({ t, x: sx / area / this.W, y: sy / area / this.H, area: share });
  }
  private lastBox: Blob | null = null;

  /** True when the cursor was reliably seen in this recording. */
  get foundCursor(): boolean {
    return this.samples.filter((s) => s.score >= 0.6).length >= 5;
  }
}

function center(b: Blob) {
  return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
}
function dist2(p: { x: number; y: number }, q: { x: number; y: number }, W: number, H: number) {
  return (p.x / W - q.x) ** 2 + (p.y / H - q.y) ** 2;
}
function overlap(a: Blob, b: Blob) {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/** Cursor considered stopped when it moves less than this between samples (normalised). */
const STILL = 0.006;
/** Movement before a stop that makes it an "arrival" (normalised path length within 2 s). */
const ARRIVAL_TRAVEL = 0.04;
/** How soon after stopping the screen must react for a click (ms). */
const REACTION_WINDOW = 1500;
/** Reactions this far from the cursor still count when they're small (normalised). */
const NEAR = 0.22;

/**
 * Turns a cursor track and screen reactions into cursor events: a Move per sample and
 * Down/Up where a click is inferred (cursor arrives, stops, and the screen reacts).
 */
export function inferClicks(samples: readonly CursorSample[], reactions: readonly Reaction[]): CursorEvent[] {
  const ev: CursorEvent[] = samples.map((s) => ({ t: s.t, x: s.x, y: s.y, kind: CursorKind.Move }));
  let lastClick = -Infinity;
  /** Set by movement (or the cursor first appearing); the first stop after it is checked once for a click. */
  let armed = true;
  let travel = 0;
  let stillSince = -Infinity;
  for (let i = 1; i < samples.length; i++) {
    const s = samples[i];
    const p = samples[i - 1];
    const step = Math.hypot(s.x - p.x, s.y - p.y);
    if (step >= STILL || s.t - p.t > 1500) {
      // moved, or reappeared after being out of sight
      travel += step;
      if (travel >= ARRIVAL_TRAVEL || s.t - p.t > 1500) armed = true;
      stillSince = -Infinity;
      continue;
    }
    if (stillSince === -Infinity) stillSince = p.t;
    // An arrival (first stop after real movement), or a fresh click in place after a long quiet spell.
    const arrival = armed;
    const inPlace = !armed && s.t - stillSince > 2500 && s.t - lastClick > 2500;
    if (!arrival && !inPlace) continue;
    if (arrival) {
      armed = false;
      travel = 0;
    }
    const from = arrival ? stillSince : s.t - 200;
    const r = reactions.find(
      (r) =>
        r.t > from &&
        r.t <= from + REACTION_WINDOW &&
        ((Math.hypot(r.x - s.x, r.y - s.y) < NEAR && r.area >= 0.003) || (arrival && r.area > 0.02 && r.area < 0.5)),
    );
    if (!r) continue;
    if (inPlace) stillSince = r.t; // next in-place click needs another quiet spell
    // The click happened just before the screen reacted, while the cursor was stopped.
    const t = Math.max(from, r.t - 120);
    ev.push({ t, x: s.x, y: s.y, kind: CursorKind.Down }, { t: t + 80, x: s.x, y: s.y, kind: CursorKind.Up });
    lastClick = t;
  }
  return ev.sort((a, b) => a.t - b.t || a.kind - b.kind);
}
