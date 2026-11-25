import { expect, test } from "@playwright/test";
import { FAKE_MEDIA, checkPreviewAndDownloads, record } from "./helpers";

const SURFACE = "Entire screen";
test.use({ launchOptions: { args: [...FAKE_MEDIA, "--auto-select-desktop-capture-source=Entire screen"] } });

test("entire screen + webcam + mic: records, pauses, saves, previews, downloads, deletes", async ({ page }) => {
  await record(page, { source: "Entire screen", mic: true, camera: true, systemAudio: false });
  await checkPreviewAndDownloads(page, { camera: true, mic: true, system: false, screenshots: 1, surface: SURFACE });

  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Delete Recording/ })).toHaveCount(1);
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: /^Delete Recording/ }).click();
  await expect(page.getByText("No recordings yet")).toBeVisible();
});
