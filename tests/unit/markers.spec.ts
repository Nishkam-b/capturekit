import { expect, test } from "@playwright/test";
import { MARKER_HOLD_MS, markerSegments } from "../../src/engines/zoom/markers";

test.describe("zoom markers", () => {
  test("each mark becomes a manual zoom starting just before it", () => {
    const s = markerSegments([5000, 20000], 60000);
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ start: 4700, end: 5000 + MARKER_HOLD_MS, auto: false, mode: "fixed", level: 2 });
    expect(s[1].start).toBe(19700);
  });

  test("marks close together extend one zoom", () => {
    const s = markerSegments([5000, 6000, 7000], 60000);
    expect(s).toHaveLength(1);
    expect(s[0].end).toBe(7000 + MARKER_HOLD_MS);
  });

  test("ignores marks outside the recording and clamps to its end", () => {
    const s = markerSegments([-5, 9000, 12000, Number.NaN], 10000);
    expect(s).toHaveLength(1);
    expect(s[0].end).toBe(10000);
  });
});
