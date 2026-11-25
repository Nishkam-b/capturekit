import { expect, test } from "@playwright/test";
import { buildCursorPath, CLICK_MS, cursorStateAt, pressedRanges } from "../../src/engines/cursor/path";
import { CursorKind, packEvents, unpackEvents, type CursorEvent } from "../../src/engines/cursor/types";
import { ActiveClock } from "../../src/engines/recorder/clock";

const ev = (t: number, x: number, y: number, kind: CursorKind = CursorKind.Move): CursorEvent => ({ t, x, y, kind });

test.describe("cursor path", () => {
  const events = [ev(0, 0.1, 0.1), ev(500, 0.1, 0.1), ev(1000, 0.9, 0.9), ev(1200, 0.9, 0.9, CursorKind.Down), ev(1300, 0.9, 0.9, CursorKind.Up), ev(3000, 0.5, 0.5, CursorKind.Leave)];

  test("raw path (no smoothing) follows events exactly", () => {
    const p = buildCursorPath(events, 0)!;
    expect(cursorStateAt(p, 400)).toMatchObject({ x: expect.closeTo(0.1, 3), y: expect.closeTo(0.1, 3), visible: true });
    expect(cursorStateAt(p, 1100).x).toBeCloseTo(0.9, 3);
  });

  test("smoothing lags behind a jump but converges", () => {
    const p = buildCursorPath(events, 0.8)!;
    const justAfter = cursorStateAt(p, 1030).x;
    expect(justAfter).toBeGreaterThan(0.1);
    expect(justAfter).toBeLessThan(0.85);
    expect(cursorStateAt(p, 1900).x).toBeCloseTo(0.9, 1);
  });

  test("clicks animate for CLICK_MS and the cursor is pressed between down and up", () => {
    const p = buildCursorPath(events, 0)!;
    const pr = pressedRanges(events);
    expect(pr).toEqual([[1200, 1300]]);
    expect(cursorStateAt(p, 1250, pr)).toMatchObject({ pressed: true, clicks: [{ age: 50 }] });
    expect(cursorStateAt(p, 1200 + CLICK_MS + 10, pr).clicks).toHaveLength(0);
  });

  test("leave hides the cursor; before the first event it's hidden", () => {
    const p = buildCursorPath(events, 0)!;
    expect(cursorStateAt(p, 3100).visible).toBe(false);
    expect(cursorStateAt(p, -50).visible).toBe(false);
  });

  test("idle time grows when the cursor is still", () => {
    const p = buildCursorPath(events, 0)!;
    expect(cursorStateAt(p, 1050).idleMs).toBeLessThan(80);
    expect(cursorStateAt(p, 2900).idleMs).toBeGreaterThan(1800);
  });

  test("pack / unpack round-trips", () => {
    expect(unpackEvents(packEvents(events))).toEqual(events);
    expect(buildCursorPath([], 0.5)).toBeNull();
  });
});

test("ActiveClock.toActive maps clock time to active time across pauses", () => {
  let now = 1000;
  const c = new ActiveClock(() => now);
  c.start(); // active 0 at 1000
  now = 3000;
  c.pause(); // active 2000
  now = 5000;
  c.start(); // resumes at 5000 with active 2000
  now = 6000;
  expect(c.toActive(500)).toBeNull(); // before start
  expect(c.toActive(1500)).toBe(500);
  expect(c.toActive(4000)).toBeNull(); // paused
  expect(c.toActive(5500)).toBe(2500);
});
