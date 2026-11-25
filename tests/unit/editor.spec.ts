import { expect, test } from "@playwright/test";
import { frameLayout, outputSize } from "../../src/engines/editor/layout";
import { DEFAULT_WEBCAM, webcamBox, webcamFromLayout } from "../../src/engines/editor/webcam";
import { clampCrop, type Clip, type EditProject } from "../../src/engines/editor/project";
import {
  clipOffsets,
  isUntrimmed,
  locate,
  removeClip,
  splitAt,
  toOutput,
  totalDuration,
  trimClip,
} from "../../src/engines/editor/timeline";

const clips: Clip[] = [
  { id: "a", start: 0, end: 4000 },
  { id: "b", start: 6000, end: 9000 },
];

test.describe("timeline", () => {
  test("durations and offsets", () => {
    expect(totalDuration(clips)).toBe(7000);
    expect(clipOffsets(clips)).toEqual([0, 4000]);
  });

  test("locate maps output → source across a cut", () => {
    expect(locate(clips, 1000)).toMatchObject({ index: 0, sourceMs: 1000 });
    expect(locate(clips, 4000)).toMatchObject({ index: 1, sourceMs: 6000, clipStartOut: 4000 });
    expect(locate(clips, 5500)).toMatchObject({ index: 1, sourceMs: 7500 });
    expect(locate(clips, 99_999)).toMatchObject({ index: 1, sourceMs: 9000 }); // clamped
    expect(locate(clips, -5)).toMatchObject({ index: 0, sourceMs: 0 });
    expect(toOutput(clips, 1, 7500)).toBe(5500);
  });

  test("splitAt splits under the playhead and ignores edges", () => {
    const s = splitAt(clips, 5000, "c");
    expect(s).toEqual([
      { id: "a", start: 0, end: 4000 },
      { id: "b", start: 6000, end: 7000 },
      { id: "c", start: 7000, end: 9000 },
    ]);
    expect(splitAt(clips, 4020, "x")).toEqual(clips); // 20ms into clip b: too close to edge
    expect(totalDuration(s)).toBe(totalDuration(clips));
  });

  test("removeClip keeps at least one clip", () => {
    expect(removeClip(clips, "a")).toEqual([clips[1]]);
    expect(removeClip([clips[0]], "a")).toEqual([clips[0]]);
  });

  test("trimClip clamps to source and minimum length", () => {
    expect(trimClip(clips, "a", "start", 1500, 10_000)[0]).toEqual({ id: "a", start: 1500, end: 4000 });
    expect(trimClip(clips, "a", "start", 3990, 10_000)[0].start).toBe(3900);
    expect(trimClip(clips, "b", "end", 50_000, 10_000)[1].end).toBe(10_000);
    expect(trimClip(clips, "a", "start", -100, 10_000)[0].start).toBe(0);
  });

  test("isUntrimmed", () => {
    expect(isUntrimmed([{ id: "a", start: 0, end: 5000 }], 5000)).toBe(true);
    expect(isUntrimmed(clips, 9000)).toBe(false);
  });
});

const base: Pick<EditProject, "aspect" | "crop" | "fit" | "padding" | "radius" | "webcam"> = {
  aspect: "source",
  crop: { x: 0, y: 0, w: 1, h: 1 },
  fit: "contain",
  padding: 0,
  radius: 0,
  webcam: { ...DEFAULT_WEBCAM },
};

test.describe("layout", () => {
  test("output sizes per aspect and preset", () => {
    expect(outputSize(base, 1920, 1080, "1080p")).toEqual({ w: 1920, h: 1080 });
    expect(outputSize({ ...base, aspect: "9:16" }, 1920, 1080, "1080p")).toEqual({ w: 1080, h: 1920 });
    expect(outputSize({ ...base, aspect: "1:1" }, 1920, 1080, "720p")).toEqual({ w: 720, h: 720 });
    expect(outputSize({ ...base, aspect: "4:5" }, 1920, 1080, "1080p")).toEqual({ w: 1080, h: 1350 });
    // original: cropped source short side, even numbers
    expect(outputSize({ ...base, crop: { x: 0, y: 0, w: 0.5, h: 0.5 } }, 2561, 1441, "original")).toEqual({ w: 1280, h: 720 });
  });

  test("contain letterboxes into the box", () => {
    const l = frameLayout(base, 1920, 1080, 1000, 1000, false);
    expect(l.dst).toEqual({ x: 0, y: 219, w: 1000, h: 563 });
    expect(l.cam).toBeNull();
  });

  test("cover fills the box by trimming the source", () => {
    const l = frameLayout({ ...base, fit: "cover" }, 1920, 1080, 1080, 1920, false);
    expect(l.dst).toEqual({ x: 0, y: 0, w: 1080, h: 1920 });
    expect(l.src.h).toBe(1080);
    expect(Math.round(l.src.w)).toBe(608);
    expect(Math.round(l.src.x)).toBe(656);
  });

  test("padding shrinks the box; webcam sits in the output corner", () => {
    const l = frameLayout({ ...base, padding: 0.1 }, 1920, 1080, 1920, 1080, true);
    expect(l.dst.x).toBeGreaterThanOrEqual(108);
    expect(l.dst.y).toBe(108);
    expect(l.cam).toEqual(webcamBox(base.webcam, 1920, 1080));
    expect(l.cam!.x + l.cam!.w).toBe(1920 - Math.round(1080 * 0.04));
  });

  test("clampCrop keeps the rectangle inside the frame", () => {
    expect(clampCrop({ x: 0.9, y: -0.2, w: 0.3, h: 2 })).toEqual({ x: 0.7, y: 0, w: 0.3, h: 1 });
    expect(clampCrop({ x: 0, y: 0, w: 0.001, h: 0.5 }).w).toBe(0.05);
  });
});

test.describe("webcam box", () => {
  test("hugs corners with a margin and never leaves the frame", () => {
    const tl = webcamBox({ x: 0, y: 0, size: 0.25, shape: "circle" }, 1920, 1080);
    expect(tl).toEqual({ x: 43, y: 43, w: 270, h: 270 });
    const far = webcamBox({ x: 5, y: -3, size: 0.25, shape: "circle" }, 1920, 1080);
    expect(far.x + far.w).toBeLessThanOrEqual(1920 - 43);
    expect(far.y).toBeGreaterThanOrEqual(43);
  });

  test("rectangle shape is 4:3; size is clamped", () => {
    const r = webcamBox({ x: 0.5, y: 0.5, size: 0.3, shape: "rect" }, 1000, 1000);
    expect(r.w / r.h).toBeCloseTo(4 / 3, 1);
    expect(webcamBox({ x: 0.5, y: 0.5, size: 2, shape: "circle" }, 1000, 1000).h).toBe(500);
  });

  test("migrates the recording-time layout", () => {
    expect(webcamFromLayout({ position: "top-left", size: "large", shape: "rounded" }, true)).toMatchObject({
      x: 0,
      y: 0,
      size: 0.36,
      shape: "rounded",
      visible: true,
    });
  });
});
