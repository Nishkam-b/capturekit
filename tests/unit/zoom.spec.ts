import { expect, test } from "@playwright/test";
import { ease, segmentWeight, zoomAt, zoomRect } from "../../src/engines/zoom/camera";
import { normalizeZoom, type ZoomSegment } from "../../src/engines/zoom/types";

test.describe("manual zoom camera", () => {
  const seg: ZoomSegment = { id: "s", start: 1000, end: 3000, level: 2, x: 0.25, y: 0.75 };

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

  test("a zoom holds a steady view on its position; identity outside", () => {
    expect(zoomAt([seg], 700, 500)).toEqual({ scale: 1, cx: 0.5, cy: 0.5 });
    expect(zoomAt([seg], 700, 2000)).toEqual({ scale: 2, cx: 0.25, cy: 0.75 });
    expect(zoomAt([seg], 700, 2900)).toEqual({ scale: 2, cx: 0.25, cy: 0.75 });
  });

  test("amount and position come straight from the sliders' values", () => {
    expect(zoomAt([{ ...seg, level: 3.4, x: 0.6, y: 0.1 }], 700, 2000)).toEqual({ scale: 3.4, cx: 0.6, cy: 0.1 });
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

  test("older projects: automatic zooms are dropped, manual ones kept and clamped", () => {
    const z = normalizeZoom({
      auto: true,
      level: 9,
      transitionMs: 500,
      followSmoothing: 0.7,
      dismissed: ["a1"],
      segments: [
        { id: "a", start: 0, end: 1000, level: 2, mode: "follow", x: 0.2, y: 0.2, auto: true },
        { id: "m", start: 2000, end: 4000, level: 2.5, mode: "fixed", x: 0.4, y: 0.6, auto: false },
      ],
    });
    expect(z).toEqual({ level: 4, transitionMs: 500, segments: [{ id: "m", start: 2000, end: 4000, level: 2.5, x: 0.4, y: 0.6 }] });
  });
});
