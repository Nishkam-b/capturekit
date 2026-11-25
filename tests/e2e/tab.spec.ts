import { test } from "@playwright/test";
import { FAKE_MEDIA, TARGET_TITLE, checkPreviewAndDownloads, openTarget, record } from "./helpers";

const SURFACE = "Browser tab";
test.use({ launchOptions: { args: [...FAKE_MEDIA, `--auto-select-tab-capture-source-by-title=${TARGET_TITLE}`] } });

test("browser tab with tab audio, no mic/camera", async ({ page }) => {
  await page.goto("/");
  await openTarget(page);
  await record(page, { source: "Browser tab", mic: false, camera: false });
  await checkPreviewAndDownloads(page, { camera: false, mic: false, system: true, screenshots: 1, surface: SURFACE });
});
