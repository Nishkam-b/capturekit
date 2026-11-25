import { expect, test } from "@playwright/test";
import { CursorKind } from "../../src/engines/cursor/types";
import { CursorDetector, inferClicks } from "../../src/engines/zoom/cursor-detect";
import { detectZoomSegments } from "../../src/engines/zoom/detect";

const W = 960;
const H = 540;

/** Arrow like the OS draws it (tip at x,y), height h, white fill + dark outline, or the macOS inverse. */
const ARROW: Array<[number, number]> = [
  [0, 0],
  [0, 0.8],
  [0.2, 0.62],
  [0.33, 0.92],
  [0.45, 0.86],
  [0.33, 0.58],
  [0.58, 0.58],
];
function inPoly(x: number, y: number, poly: Array<[number, number]>) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function drawCursor(img: Float32Array, cx: number, cy: number, h: number, mac = false) {
  const poly = ARROW.map(([x, y]) => [cx + x * h, cy + y * h] as [number, number]);
  for (let y = Math.floor(cy - 3); y < cy + h + 3; y++) {
    for (let x = Math.floor(cx - 3); x < cx + h; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const inside = inPoly(x + 0.5, y + 0.5, poly);
      let edge = false;
      if (!inside) for (const [ox, oy] of [[1.3, 0], [-1.3, 0], [0, 1.3], [0, -1.3], [1, 1], [-1, -1], [1, -1], [-1, 1]]) if (inPoly(x + 0.5 + ox, y + 0.5 + oy, poly)) edge = true;
      if (inside) img[y * W + x] = mac ? 10 : 250;
      else if (edge) img[y * W + x] = mac ? 250 : 10;
    }
  }
}
function rect(img: Float32Array, x: number, y: number, w: number, h: number, v: number) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < W && j < H) img[j * W + i] = v;
}
/** UI-ish background: light page, a sidebar, some text-like lines; then blur + noise (video compression). */
function frame(draw: (img: Float32Array) => void, seed: number): Uint8Array {
  const img = new Float32Array(W * H).fill(236);
  rect(img, 0, 0, 180, H, 210);
  for (let k = 0; k < 14; k++) rect(img, 220, 40 + k * 32, 300 + ((k * 97) % 300), 8, 120);
  draw(img);
  const out = new Uint8Array(W * H);
  let r = seed * 9301 + 49297;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // 3-tap horizontal blur + small noise
      const a = img[y * W + Math.max(0, x - 1)];
      const b = img[y * W + x];
      const c = img[y * W + Math.min(W - 1, x + 1)];
      r = (r * 9301 + 49297) % 233280;
      out[y * W + x] = Math.max(0, Math.min(255, Math.round((a + 2 * b + c) / 4 + (r / 233280 - 0.5) * 6)));
    }
  }
  return out;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * Math.min(1, Math.max(0, k));

function run(mac = false) {
  const det = new CursorDetector({ width: W, height: H });
  // 10 samples per second for 7 s.
  for (let i = 0; i <= 70; i++) {
    const t = i * 100;
    const [x, y] =
      t < 1500
        ? [lerp(100, 600, t / 1500), lerp(100, 300, t / 1500)]
        : t < 3500
          ? [600, 300]
          : t < 4500
            ? [lerp(600, 250, (t - 3500) / 1000), lerp(300, 420, (t - 3500) / 1000)]
            : [250, 420];
    const g = frame((img) => {
      // menu opens next to the click at 1.9 s
      if (t >= 1900 && t < 3600) rect(img, 610, 320, 170, 140, 252);
      // blinking text caret far away the whole time
      if (Math.floor(t / 500) % 2 === 0) rect(img, 860, 60, 2, 16, 20);
      drawCursor(img, x, y, 20, mac);
    }, i);
    det.push(g, t);
  }
  return det;
}

test.describe("cursor detection from video", () => {
  test("follows a Windows-style cursor and infers the click that opened a menu", () => {
    const det = run();
    expect(det.foundCursor).toBe(true);
    // Tracks the cursor where it rests.
    const atRest = det.samples.filter((s) => s.t >= 1700 && s.t <= 3400);
    expect(atRest.length).toBeGreaterThan(10);
    for (const s of atRest) {
      expect(Math.abs(s.x * W - 600)).toBeLessThan(4);
      expect(Math.abs(s.y * H - 300)).toBeLessThan(4);
    }
    const ev = inferClicks(det.samples, det.reactions);
    const downs = ev.filter((e) => e.kind === CursorKind.Down);
    // One click (menu opened); the second stop had no reaction, and the blinking caret is ignored.
    expect(downs).toHaveLength(1);
    expect(downs[0].t).toBeGreaterThanOrEqual(1500);
    expect(downs[0].t).toBeLessThanOrEqual(1900);
    expect(Math.abs(downs[0].x * W - 600)).toBeLessThan(6);
  });

  test("works with a macOS-style (black) cursor too", () => {
    const det = run(true);
    expect(det.foundCursor).toBe(true);
    const downs = inferClicks(det.samples, det.reactions).filter((e) => e.kind === CursorKind.Down);
    expect(downs).toHaveLength(1);
  });

  test("the zoom is fully in before the click and follows the cursor's approach", () => {
    const det = run();
    const ev = inferClicks(det.samples, det.reactions);
    const click = ev.find((e) => e.kind === CursorKind.Down)!;
    const segs = detectZoomSegments(ev, { level: 2, transitionMs: 700, holdMs: 1500, onPauses: false, durationMs: 7000 });
    expect(segs).toHaveLength(1);
    // zoom-in transition finishes before the click
    expect(segs[0].start + 700).toBeLessThanOrEqual(click.t);
    // and starts while the cursor is still travelling toward it (not seconds earlier)
    expect(segs[0].start).toBeGreaterThan(click.t - 1800);
  });
});
