import { expect, test } from "@playwright/test";
import { ActiveClock } from "../../src/engines/recorder/clock";
import { detectBrowser } from "../../src/engines/recorder/capabilities";
import { pickMimeType, videoBitrateFor } from "../../src/engines/recorder/mime";
import { extensionForMime, formatBytes, formatDuration, toFileStem } from "../../src/engines/shared/format";

test.describe("format", () => {
  test("formatDuration", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(83_400)).toBe("01:23");
    expect(formatDuration(3_723_000)).toBe("1:02:03");
    expect(formatDuration(-5)).toBe("00:00");
    expect(formatDuration(Number.NaN)).toBe("00:00");
  });

  test("formatBytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(250 * 1024 * 1024)).toBe("250 MB");
  });

  test("extensionForMime", () => {
    expect(extensionForMime("video/webm;codecs=vp9,opus")).toBe("webm");
    expect(extensionForMime("video/mp4;codecs=avc1")).toBe("mp4");
    expect(extensionForMime("video/x-matroska;codecs=avc1")).toBe("mkv");
    expect(extensionForMime("image/png")).toBe("png");
    expect(extensionForMime("application/whatever")).toBe("bin");
  });

  test("toFileStem strips unsafe characters", () => {
    expect(toFileStem("Recording 25 Nov, 10:04")).toBe("Recording-25-Nov-10-04");
    expect(toFileStem("../../etc/passwd")).toBe("etc-passwd");
    expect(toFileStem("   ")).toBe("recording");
  });
});

test.describe("mime negotiation", () => {
  test("prefers VP9 when available", () => {
    expect(pickMimeType(true, () => true)).toBe("video/webm;codecs=vp9,opus");
    expect(pickMimeType(false, () => true)).toBe("video/webm;codecs=vp9");
  });

  test("falls back to MP4 (Safari)", () => {
    const safari = (t: string) => t.startsWith("video/mp4");
    expect(pickMimeType(true, safari)).toBe("video/mp4;codecs=avc1,mp4a.40.2");
    expect(pickMimeType(false, safari)).toBe("video/mp4;codecs=avc1");
  });

  test("returns null when nothing is supported", () => {
    expect(pickMimeType(true, () => false)).toBeNull();
  });

  test("bitrate is clamped", () => {
    expect(videoBitrateFor(640, 360)).toBe(2_500_000);
    expect(videoBitrateFor(1920, 1080)).toBe(6_220_800);
    expect(videoBitrateFor(7680, 4320, 60)).toBe(25_000_000);
  });
});

test.describe("ActiveClock", () => {
  test("excludes paused time", () => {
    let now = 1000;
    const clock = new ActiveClock(() => now);
    clock.start();
    now = 3000; // +2s recording
    clock.pause();
    now = 10_000; // 7s paused
    expect(clock.elapsed()).toBe(2000);
    clock.start();
    now = 10_500;
    expect(clock.elapsed()).toBe(2500);
    clock.start(); // double start is a no-op
    now = 11_000;
    expect(clock.elapsed()).toBe(3000);
  });
});

test("detectBrowser", () => {
  const chrome =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
  const edge = `${chrome} Edg/142.0.0.0`;
  const firefox = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0";
  const safari =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
  expect(detectBrowser(chrome)).toBe("chromium");
  expect(detectBrowser(edge)).toBe("chromium");
  expect(detectBrowser(firefox)).toBe("firefox");
  expect(detectBrowser(safari)).toBe("safari");
});
