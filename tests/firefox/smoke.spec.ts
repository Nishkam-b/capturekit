import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { landOnRecording } from "../e2e/helpers";

/**
 * Firefox smoke test (Playwright's Firefox build). Fake camera/mic and the
 * screen-share prompt are bypassed via prefs set in playwright.config.ts.
 */
test.setTimeout(150_000);

test("Firefox: record screen + webcam + mic, preview, download, edit and export", async ({ page }) => {
  await page.goto("/record");
  await expect(page.getByRole("heading", { name: "What would you like to record?" })).toBeVisible();
  // Firefox ignores the source hint and can't capture system audio: the toggle explains that.
  await expect(page.getByRole("switch", { name: "System audio" })).toBeDisabled();

  await page.getByRole("switch", { name: "Countdown" }).click();
  await page.getByRole("switch", { name: "Webcam" }).click();
  await page.getByRole("switch", { name: "Microphone" }).click();
  await expect(page.getByLabel("Microphone level")).toBeVisible();

  await page.getByRole("button", { name: "Start recording" }).click();
  await expect(page.getByTestId("timer").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: "Pause recording" }).first().click();
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Resume recording" }).first().click();
  await page.getByRole("button", { name: "Take screenshot" }).first().click();
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: "Stop recording" }).first().click();
  await landOnRecording(page);

  const video = page.getByTestId("preview-video");
  await page.waitForFunction(() => {
    const v = document.querySelector<HTMLVideoElement>("[data-testid=preview-video]");
    return !!v && v.readyState >= 1;
  });
  const info = await video.evaluate((v: HTMLVideoElement) => ({ d: v.duration, w: v.videoWidth }));
  expect(Number.isFinite(info.d)).toBe(true);
  expect(info.d).toBeGreaterThan(2.5);
  expect(info.w).toBeGreaterThan(0);

  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Screen recording/ }).click()]);
  const bytes = await readFile(await dl.path());
  expect(bytes.subarray(0, 4).toString("hex")).toBe("1a45dfa3");
  await expect(page.getByRole("link", { name: /^Webcam/ })).toBeVisible();
  await expect(page.getByText("Screenshots (1)")).toBeVisible();

  // Editor + export
  await page.getByRole("link", { name: /Edit & export/ }).click();
  await expect(page.getByTestId("clip-0")).toBeVisible();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /^720p/ }).click();
  const formatButton = dialog.getByRole("button", { name: /^Export (WebM|MP4)$/ });
  const label = await formatButton.textContent();
  await formatButton.click();
  await expect(dialog.getByTestId("export-result")).toBeVisible({ timeout: 60_000 });
  const [out] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("link", { name: /^Download/ }).click()]);
  const outBytes = await readFile(await out.path());
  if (label?.includes("WebM")) expect(outBytes.subarray(0, 4).toString("hex")).toBe("1a45dfa3");
  else expect(outBytes.subarray(4, 8).toString()).toBe("ftyp");
  test.info().annotations.push({ type: "firefox-export", description: label ?? "" });
});
