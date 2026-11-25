import { expect, test } from "@playwright/test";
import { CursorKind } from "../../src/engines/cursor/types";
import { analyzeFrames, type GrayFrame } from "../../src/engines/zoom/activity";
import { detectZoomSegments } from "../../src/engines/zoom/detect";

const W = 320;
const H = 180;
const opts = { width: W, height: H };

/** A frame of flat grey with optional bright rectangles (normalised coords). */
function frame(t: number, boxes: Array<[number, number, number, number]> = []): GrayFrame {
  const data = new Uint8Array(W * H).fill(60);
  for (const [bx, by, bw, bh] of boxes) {
    for (let y = Math.floor(by * H); y < Math.min(H, Math.floor((by + bh) * H)); y++) {
      for (let x = Math.floor(bx * W); x < Math.min(W, Math.floor((bx + bw) * W)); x++) data[y * W + x] = 220;
    }
  }
  return { t, data };
}

/** 8 samples per second for `seconds`, with a per-step box generator. */
function video(seconds: number, boxesAt: (t: number) => Array<[number, number, number, number]>): GrayFrame[] {
  const out: GrayFrame[] = [];
  for (let t = 0; t <= seconds * 1000; t += 125) out.push(frame(t, boxesAt(t)));
  return out;
}

const downs = (ev: ReturnType<typeof analyzeFrames>) => ev.filter((e) => e.kind === CursorKind.Down);

test.describe("screen activity analysis", () => {
  test("a static screen produces nothing", () => {
    expect(analyzeFrames(video(5, () => []), opts)).toEqual([]);
  });

  test("a dialog appearing in one spot is an interaction there", () => {
    // At 2s a 20%×20% panel appears at (0.65, 0.2) and stays.
    const ev = analyzeFrames(video(6, (t) => (t >= 2000 ? [[0.65, 0.2, 0.2, 0.2]] : [])), opts);
    const d = downs(ev);
    expect(d).toHaveLength(1);
    expect(d[0].t).toBe(2000);
    expect(d[0].x).toBeCloseTo(0.75, 1);
    expect(d[0].y).toBeCloseTo(0.3, 1);
  });

  test("typing (small changes staying in one spot) is an interaction", () => {
    // A caret-sized block that grows to the right every step from 1s to 3s, like text being typed.
    const ev = analyzeFrames(
      video(5, (t) => (t >= 1000 && t <= 3000 ? [[0.3, 0.5, 0.02 + ((t - 1000) / 2000) * 0.15, 0.03]] : t > 3000 ? [[0.3, 0.5, 0.17, 0.03]] : [])),
      opts,
    );
    const d = downs(ev);
    expect(d.length).toBeGreaterThanOrEqual(1);
    expect(d[0].x).toBeGreaterThan(0.25);
    expect(d[0].x).toBeLessThan(0.5);
  });

  test("a small moving blob (the cursor gliding around) is followed but never triggers a zoom", () => {
    const ev = analyzeFrames(
      video(6, (t) => {
        const k = t / 6000;
        return [[0.1 + 0.8 * k, 0.2 + 0.5 * Math.sin(k * 6), 0.015, 0.025]];
      }),
      opts,
    );
    expect(downs(ev)).toHaveLength(0);
    expect(ev.filter((e) => e.kind === CursorKind.Move).length).toBeGreaterThan(10);
    expect(detectZoomSegments(ev, { level: 2, transitionMs: 700, holdMs: 1500, onPauses: false, durationMs: 6000 })).toEqual([]);
  });

  test("constant animation (a spinner or clock) is ignored", () => {
    // A blinking box every other step for the whole video, plus one real change at 3s elsewhere.
    const ev = analyzeFrames(
      video(6, (t) => {
        const boxes: Array<[number, number, number, number]> = [];
        if (Math.round(t / 125) % 2 === 0) boxes.push([0.02, 0.02, 0.08, 0.06]);
        if (t >= 3000) boxes.push([0.6, 0.6, 0.2, 0.2]);
        return boxes;
      }),
      opts,
    );
    const d = downs(ev);
    expect(d).toHaveLength(1);
    expect(d[0].x).toBeGreaterThan(0.5);
  });

  test("a full-screen change (page navigation / scroll) is not a point of interest", () => {
    const ev = analyzeFrames(video(4, (t) => (t >= 2000 ? [[0, 0, 1, 1]] : [])), opts);
    expect(downs(ev)).toHaveLength(0);
  });
});
