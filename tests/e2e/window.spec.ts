import { test } from "@playwright/test";
import { FAKE_MEDIA, TARGET_TITLE, checkPreviewAndDownloads, openTarget, record } from "./helpers";

const SURFACE = "Window";
test.use({ launchOptions: { args: [...FAKE_MEDIA, `--auto-select-desktop-capture-source=${TARGET_TITLE}`] } });

test("application window with mic", async ({ page }) => {
  await page.goto("/");
  await openTarget(page);
  await record(page, { source: "Window", mic: true, camera: false });
  await checkPreviewAndDownloads(page, { camera: false, mic: true, system: false, screenshots: 1, surface: SURFACE });
});
