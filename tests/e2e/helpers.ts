import { readFile } from "node:fs/promises";
import { expect, type Page } from "@playwright/test";

/**
 * Real end-to-end recordings in headed Chrome.
 * - Camera & mic: Chrome's fake devices (moving test pattern + beep).
 * - Screen picker: auto-selected by Chrome command-line flags, so the real
 *   getDisplayMedia → MediaRecorder → IndexedDB → preview → download path runs.
 */
export const TARGET_TITLE = "CK E2E Target";
export const FAKE_MEDIA = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"];
const WEBM_MAGIC = "1a45dfa3"; // EBML header

export async function timerMs(page: Page): Promise<number> {
  const text = (await page.getByTestId("timer").first().textContent()) ?? "00:00";
  const [m, s] = text.split(":").map(Number);
  return (m * 60 + s) * 1000;
}

export async function openTarget(page: Page) {
  const target = await page.context().newPage();
  await target.goto("/help");
  await target.evaluate((t) => (document.title = t), TARGET_TITLE);
  await page.bringToFront();
  return target;
}

export async function record(
  page: Page,
  opts: { source: "Entire screen" | "Window" | "Browser tab"; mic: boolean; camera: boolean; systemAudio?: boolean },
) {
  await page.goto("/record");
  await expect(page.getByRole("heading", { name: "What would you like to record?" })).toBeVisible();
  await page.getByRole("radio", { name: new RegExp(opts.source) }).click();
  await page.getByRole("switch", { name: "Countdown" }).click(); // off: faster test
  if (opts.camera) {
    await page.getByRole("switch", { name: "Webcam" }).click();
    await expect(page.locator("video").first()).toBeVisible();
  }
  if (opts.mic) {
    await page.getByRole("switch", { name: "Microphone" }).click();
    await expect(page.getByLabel("Microphone level")).toBeVisible();
  }
  if (opts.systemAudio === false) {
    const sys = page.getByRole("switch", { name: "System audio" });
    if ((await sys.getAttribute("aria-checked")) === "true") await sys.click();
  }

  await page.getByRole("button", { name: "Start recording" }).click();
  await expect(page.getByTestId("timer").first()).toBeVisible({ timeout: 15_000 });

  // Record ~2s, pause ~2s (must not count), resume, screenshot, record ~2s.
  await page.waitForTimeout(2200);
  await page.getByRole("button", { name: "Pause recording" }).first().click();
  const pausedAt = await timerMs(page);
  await page.waitForTimeout(2000);
  expect(await timerMs(page)).toBe(pausedAt);
  await page.getByRole("button", { name: "Resume recording" }).first().click();
  await page.getByRole("button", { name: "Take screenshot" }).first().click();
  await page.waitForTimeout(2200);
  await page.getByRole("button", { name: "Stop recording" }).first().click();

  await page.waitForURL(/\/recordings\/view\?id=/, { timeout: 30_000 });
}

export async function checkPreviewAndDownloads(
  page: Page,
  expect_: { camera: boolean; mic: boolean; system: boolean; screenshots: number; surface: string },
) {
  await expect(page.getByTestId("surface")).toHaveText(expect_.surface);
  const video = page.getByTestId("preview-video");
  await expect(video).toBeVisible();
  await page.waitForFunction(() => {
    const v = document.querySelector<HTMLVideoElement>("[data-testid=preview-video]");
    return !!v && v.readyState >= 1;
  });
  const info = await video.evaluate((v: HTMLVideoElement) => ({ duration: v.duration, w: v.videoWidth, h: v.videoHeight }));
  // Duration header must be fixed (raw MediaRecorder WebM reports Infinity) and exclude the pause.
  expect(Number.isFinite(info.duration)).toBe(true);
  expect(info.duration).toBeGreaterThan(3);
  expect(info.duration).toBeLessThan(6.5);
  expect(info.w).toBeGreaterThan(0);

  // Seeking works
  await video.evaluate(async (v: HTMLVideoElement) => {
    v.currentTime = 1.5;
    await new Promise((r) => v.addEventListener("seeked", r, { once: true }));
  });

  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Screen recording/ }).click()]);
  expect(dl.suggestedFilename()).toMatch(/\.webm$/);
  const bytes = await readFile(await dl.path());
  expect(bytes.length).toBeGreaterThan(10_000);
  expect(bytes.subarray(0, 4).toString("hex")).toBe(WEBM_MAGIC);

  const webcamLink = page.getByRole("link", { name: /^Webcam/ });
  if (expect_.camera) {
    const [camDl] = await Promise.all([page.waitForEvent("download"), webcamLink.click()]);
    expect(camDl.suggestedFilename()).toMatch(/-webcam\.webm$/);
    const camBytes = await readFile(await camDl.path());
    expect(camBytes.subarray(0, 4).toString("hex")).toBe(WEBM_MAGIC);
  } else {
    await expect(webcamLink).toHaveCount(0);
  }

  // Audio track presence in the saved file matches the metadata
  const hasAudio = await video.evaluate(async (v: HTMLVideoElement) => {
    const stream = (v as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
    await v.play().catch(() => undefined);
    await new Promise((r) => setTimeout(r, 300));
    const n = stream?.getAudioTracks().length ?? -1;
    v.pause();
    return n;
  });
  expect(hasAudio > 0).toBe(expect_.mic || expect_.system);

  await expect(page.getByText("Microphone", { exact: true })).toHaveCount(expect_.mic ? 1 : 0);
  await expect(page.getByText("System audio", { exact: true })).toHaveCount(expect_.system ? 1 : 0);
  if (expect_.screenshots > 0) {
    await expect(page.getByText(`Screenshots (${expect_.screenshots})`)).toBeVisible();
    const [shot] = await Promise.all([page.waitForEvent("download"), page.getByTitle(/Download screenshot/).first().click()]);
    const png = await readFile(await shot.path());
    expect(png.subarray(1, 4).toString()).toBe("PNG");
  }
}

