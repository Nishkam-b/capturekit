import { expect, test } from "@playwright/test";
import { checkImageFile } from "../../src/engines/screenshot/io";
import { MAX_SIDE, screenshotLayout } from "../../src/engines/screenshot/layout";
import { createScreenshotProject } from "../../src/engines/screenshot/project";

const base = { ...createScreenshotProject("s", "Shot", 1000, 600, { kind: "import" }), padding: 0, radius: 0 };

test.describe("screenshot layout", () => {
  test("no padding, no frame: output equals the image", () => {
    const L = screenshotLayout(base);
    expect(L.out).toEqual({ w: 1000, h: 600 });
    expect(L.content).toEqual({ x: 0, y: 0, w: 1000, h: 600 });
  });

  test("padding is a fraction of the longer side; transparent background drops it", () => {
    const L = screenshotLayout({ ...base, padding: 0.1 });
    expect(L.out).toEqual({ w: 1200, h: 800 });
    expect(L.frame).toEqual({ x: 100, y: 100, w: 1000, h: 600 });
    expect(screenshotLayout({ ...base, padding: 0.1, background: "none" }).out).toEqual({ w: 1000, h: 600 });
  });

  test("browser frame adds a title bar above the image", () => {
    const L = screenshotLayout({ ...base, frame: "browser" });
    expect(L.chrome).toBe(45);
    expect(L.out).toEqual({ w: 1000, h: 645 });
    expect(L.content).toEqual({ x: 0, y: 45, w: 1000, h: 600 });
  });

  test("phone frame surrounds the image with a bezel", () => {
    const L = screenshotLayout({ ...base, frame: "phone", imageW: 400, imageH: 800 });
    expect(L.content.x).toBe(L.chrome);
    expect(L.out.w).toBe(400 + 2 * L.chrome);
  });

  test("canvas aspect expands the background around the frame", () => {
    const square = screenshotLayout({ ...base, aspect: "1:1" });
    expect(square.out).toEqual({ w: 1000, h: 1000 });
    expect(square.frame.y).toBe(200);
    const tall = screenshotLayout({ ...base, aspect: "9:16" });
    expect(tall.out.w / tall.out.h).toBeCloseTo(9 / 16, 2);
  });

  test("crop, scale and the size cap", () => {
    const L = screenshotLayout({ ...base, crop: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 } }, 2);
    expect(L.src).toEqual({ x: 500, y: 300, w: 500, h: 300 });
    expect(L.out).toEqual({ w: 1000, h: 600 });
    const huge = screenshotLayout({ ...base, imageW: 8000, imageH: 4000 }, 2);
    expect(Math.max(huge.out.w, huge.out.h)).toBe(MAX_SIDE);
  });
});

test("checkImageFile", () => {
  expect(checkImageFile({ type: "image/png", size: 100 })).toBeNull();
  expect(checkImageFile({ type: "text/plain", size: 100 })).toMatch(/isn't a supported image/);
  expect(checkImageFile({ type: "image/png", size: 0 })).toMatch(/empty/);
  expect(checkImageFile({ type: "image/jpeg", size: 60 * 1024 * 1024 })).toMatch(/50 MB/);
});

test("a square canvas stays exactly square at every scale, even with a fractional crop", () => {
  const p = { ...base, padding: 0.07, aspect: "1:1" as const, crop: { x: 0.0123, y: 0.05, w: 0.8333, h: 0.777 } };
  for (const s of [0.5, 1, 2, 3]) {
    const L = screenshotLayout(p, s);
    expect(L.out.w).toBe(L.out.h);
  }
});
