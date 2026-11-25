import { expect, test } from "@playwright/test";
import { fromOutput, toOutput, type ViewMapping } from "../../src/engines/annotations/render";
import { annotationOpacity, createAnnotation, dragAnnotation, normalizeBox, ANNOTATION_FADE_MS } from "../../src/engines/annotations/types";

test.describe("annotations", () => {
  test("defaults per kind and duration clamped to the source", () => {
    const t = createAnnotation("text", "a", 1000, 10_000);
    expect(t).toMatchObject({ kind: "text", start: 850, end: 3850, text: "Your text", background: "#111827" });
    expect(createAnnotation("blur", "b", 9000, 10_000).end).toBe(10_000);
  });

  test("fades in and out", () => {
    const a = { start: 1000, end: 2000 };
    expect(annotationOpacity(a, 900)).toBe(0);
    expect(annotationOpacity(a, 1000 + ANNOTATION_FADE_MS / 2)).toBeCloseTo(0.5);
    expect(annotationOpacity(a, 1500)).toBe(1);
    expect(annotationOpacity(a, 2100)).toBe(0);
  });

  test("dragging corners resizes; crossing over flips instead of going negative", () => {
    const r = createAnnotation("rect", "r", 0, 10_000); // x .35 y .35 w .3 h .2
    const moved = dragAnnotation(r, "move", 0.1, -0.05);
    expect(moved.x).toBeCloseTo(0.45);
    expect(moved.y).toBeCloseTo(0.3);
    expect(moved.w).toBeCloseTo(0.3);
    const se = dragAnnotation(r, "se", 0.1, 0.1);
    expect(se.w).toBeCloseTo(0.4);
    expect(se.h).toBeCloseTo(0.3);
    const flipped = dragAnnotation(r, "se", -0.5, 0);
    expect(flipped.x).toBeCloseTo(0.15);
    expect(flipped.w).toBeCloseTo(0.2);
    expect(normalizeBox({ ...r, w: 0.001 }).w).toBe(0.01);
  });

  test("arrow endpoints move independently", () => {
    const a = createAnnotation("arrow", "a", 0, 10_000); // tail .3,.3 head .5,.45
    const head = dragAnnotation(a, "to", 0.1, 0);
    expect(head.x + head.w).toBeCloseTo(0.6);
    expect(head.x).toBeCloseTo(0.3);
    const tail = dragAnnotation(a, "from", -0.1, 0);
    expect(tail.x).toBeCloseTo(0.2);
    expect(tail.x + tail.w).toBeCloseTo(0.5); // head unchanged
  });

  test("source ↔ output mapping round-trips through a zoomed view", () => {
    const v: ViewMapping = { source: { w: 1920, h: 1080 }, src: { x: 480, y: 270, w: 960, h: 540 }, dst: { x: 0, y: 0, w: 1280, h: 720 } };
    const p = toOutput(v, 0.5, 0.5);
    expect(p).toEqual({ x: 640, y: 360 });
    const back = fromOutput(v, 100, 50);
    const again = toOutput(v, back.x, back.y);
    expect(again.x).toBeCloseTo(100);
    expect(again.y).toBeCloseTo(50);
  });
});
