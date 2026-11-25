import { expect, test } from "@playwright/test";
import { buildCursorPath } from "../../src/engines/cursor/path";
import { CursorKind, type CursorEvent } from "../../src/engines/cursor/types";
import { ease, segmentWeight, zoomAt, zoomRect } from "../../src/engines/zoom/camera";
import { detectZoomSegments, findInteractions, withAutoSegments } from "../../src/engines/zoom/detect";
import { DEFAULT_ZOOM, type ZoomSegment } from "../../src/engines/zoom/types";

const move = (t: number, x: number, y: number): CursorEvent => ({ t, x, y, kind: CursorKind.Move });
const click = (t: number, x: number, y: number): CursorEvent[] => [
  { t, x, y, kind: CursorKind.Down },
  { t: t + 80, x, y, kind: CursorKind.Up },
];
const opts = { level: 2, transitionMs: 700, holdMs: 1500, onPauses: false, durationMs: 60_000 };

/** Wandering movement every 50ms between t0 and t1, never pausing. */
function wander(t0: number, t1: number): CursorEvent[] {
  const out: CursorEvent[] = [];
  for (let t = t0; t <= t1; t += 50) out.push(move(t, 0.5 + 0.3 * Math.sin(t / 400), 0.5 + 0.3 * Math.cos(t / 500)));
  return out;
}

test.describe("auto zoom detection", () => {
  test("plain movement never creates a zoom", () => {
    expect(detectZoomSegments(wander(0, 20_000), opts)).toEqual([]);
    expect(detectZoomSegments(wander(0, 20_000), { ...opts, onPauses: true })).toEqual([]);
  });

  test("a click zooms in before it and holds after it", () => {
    const segs = detectZoomSegments([...wander(0, 4000), ...click(5000, 0.2, 0.3)], opts);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ start: 4050, end: 6500, level: 2, mode: "follow", auto: true });
    expect(segs[0].x).toBeCloseTo(0.2);
  });

  test("clicks close in time become one zoom; far apart become separate zooms", () => {
    const near = detectZoomSegments([...click(5000, 0.2, 0.2), ...click(6500, 0.8, 0.8), ...click(8000, 0.5, 0.5)], opts);
    expect(near).toHaveLength(1);
    expect(near[0].end).toBe(9500);
    const far = detectZoomSegments([...click(5000, 0.2, 0.2), ...click(20_000, 0.8, 0.8)], opts);
    expect(far).toHaveLength(2);
  });

  test("zooms with a short gap after zoom-out are merged (no quick out-and-in)", () => {
    // 5000 → ends 6500 (+700 out = 7200); next starts 9000-950 = 8050 → gap 850 < 1500 → merge
    const segs = detectZoomSegments([...click(5000, 0.2, 0.2), ...click(9000, 0.3, 0.3)], opts);
    expect(segs).toHaveLength(1);
  });

  test("pauses after real movement count only when enabled", () => {
    const events = [...wander(0, 3000), move(3050, 0.9, 0.9), move(5000, 0.9, 0.9), ...wander(5050, 6000)];
    expect(findInteractions(events, false)).toHaveLength(0);
    const found = findInteractions(events, true);
    expect(found).toHaveLength(1);
    expect(found[0].t).toBe(3050);
  });

  test("withAutoSegments keeps manual zooms and respects dismissed ones", () => {
    const events = [...click(5000, 0.2, 0.2), ...click(30_000, 0.6, 0.6)];
    const manual: ZoomSegment = { id: "m1", start: 15_000, end: 17_000, level: 3, mode: "fixed", x: 0.5, y: 0.5, auto: false };
    const z = withAutoSegments({ ...DEFAULT_ZOOM, auto: true, segments: [manual] }, events, 60_000);
    expect(z.segments.map((s) => s.auto)).toEqual([true, false, true]);
    const dismissedKey = z.segments[0].key!;
    const z2 = withAutoSegments({ ...z, dismissed: [dismissedKey] }, events, 60_000);
    expect(z2.segments).toHaveLength(2);
    expect(withAutoSegments({ ...z, auto: false }, events, 60_000).segments).toEqual([manual]);
  });
});

test.describe("zoom camera", () => {
  const seg: ZoomSegment = { id: "s", start: 1000, end: 3000, level: 2, mode: "fixed", x: 0.25, y: 0.75, auto: false };

  test("eases in and out", () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5);
    expect(segmentWeight(seg, 500, 700)).toBe(0);
    expect(segmentWeight(seg, 1350, 700)).toBeCloseTo(0.5);
    expect(segmentWeight(seg, 2000, 700)).toBe(1);
    expect(segmentWeight(seg, 3350, 700)).toBeCloseTo(0.5);
    expect(segmentWeight(seg, 3800, 700)).toBe(0);
  });

  test("fixed zoom centres on its point; identity outside", () => {
    expect(zoomAt([seg], 700, 500, null)).toEqual({ scale: 1, cx: 0.5, cy: 0.5 });
    expect(zoomAt([seg], 700, 2000, null)).toEqual({ scale: 2, cx: 0.25, cy: 0.75 });
  });

  test("follow zoom tracks the smoothed cursor", () => {
    const path = buildCursorPath([move(0, 0.8, 0.2), move(5000, 0.8, 0.2)], 0)!;
    const cam = zoomAt([{ ...seg, mode: "follow" }], 700, 2000, path);
    expect(cam.cx).toBeCloseTo(0.8);
    expect(cam.cy).toBeCloseTo(0.2);
  });

  test("the zoomed view never leaves the frame", () => {
    const src = { x: 0, y: 0, w: 1920, h: 1080 };
    expect(zoomRect(src, 1920, 1080, { scale: 2, cx: 0.5, cy: 0.5 })).toEqual({ x: 480, y: 270, w: 960, h: 540 });
    expect(zoomRect(src, 1920, 1080, { scale: 2, cx: 0, cy: 1 })).toEqual({ x: 0, y: 540, w: 960, h: 540 });
    expect(zoomRect(src, 1920, 1080, { scale: 1, cx: 0, cy: 0 })).toBe(src);
    // Inside a crop
    const crop = { x: 100, y: 100, w: 800, h: 400 };
    expect(zoomRect(crop, 1920, 1080, { scale: 2, cx: 0.99, cy: 0.99 })).toEqual({ x: 500, y: 300, w: 400, h: 200 });
  });
});
