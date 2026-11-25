import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { FAKE_MEDIA, record } from "./helpers";

test.use({ launchOptions: { args: [...FAKE_MEDIA, "--auto-select-desktop-capture-source=Entire screen"] } });
test.setTimeout(150_000);

interface StoredProject {
  clips: { id: string; start: number; end: number }[];
  aspect: string;
  crop: { x: number; y: number; w: number; h: number };
  sourceDurationMs: number;
}

/** Reads the saved edit project straight from IndexedDB. */
async function storedProject(page: Page): Promise<StoredProject | null> {
  const id = new URL(page.url()).searchParams.get("id");
  return page.evaluate(
    (rid) =>
      new Promise<StoredProject | null>((resolve, reject) => {
        const req = indexedDB.open("capturekit");
        req.onsuccess = () => {
          const db = req.result;
          const get = db.transaction("projects").objectStore("projects").get(rid!);
          get.onsuccess = () => {
            resolve(get.result ?? null);
            db.close();
          };
          get.onerror = () => reject(get.error);
        };
        req.onerror = () => reject(req.error);
      }),
    id,
  );
}

const editedMs = (p: StoredProject) => p.clips.reduce((s, c) => s + c.end - c.start, 0);

async function waitSaved(page: Page) {
  await expect(page.getByText("All changes saved on this device")).toBeVisible();
  await page.waitForTimeout(600); // debounce
  await expect(page.getByText("All changes saved on this device")).toBeVisible();
}

async function exportAndCheck(page: Page, format: "WebM" | "MP4", expect_: { w: number; h: number; durationMs: number }) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: format }).click();
  await dialog.getByRole("radio", { name: /^720p/ }).click();
  await dialog.getByRole("button", { name: `Export ${format}` }).click();
  await expect(dialog.getByRole("progressbar")).toBeVisible();
  const result = dialog.getByTestId("export-result");
  await expect(result).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => {
    const v = document.querySelector<HTMLVideoElement>("[data-testid=export-result]");
    return !!v && v.readyState >= 1 && Number.isFinite(v.duration) && v.duration > 0;
  });
  const info = await result.evaluate((v: HTMLVideoElement) => ({ w: v.videoWidth, h: v.videoHeight, d: v.duration }));
  expect(info.w).toBe(expect_.w);
  expect(info.h).toBe(expect_.h);
  expect(Math.abs(info.d * 1000 - expect_.durationMs)).toBeLessThan(800);

  const [dl] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("link", { name: /^Download/ }).click()]);
  const bytes = await readFile(await dl.path());
  if (format === "WebM") {
    expect(dl.suggestedFilename()).toMatch(/-edit\.webm$/);
    expect(bytes.subarray(0, 4).toString("hex")).toBe("1a45dfa3");
  } else {
    expect(dl.suggestedFilename()).toMatch(/-edit\.mp4$/);
    expect(bytes.subarray(4, 8).toString()).toBe("ftyp");
  }
  await dialog.getByRole("button", { name: "Close" }).click();
}

test("editor: split, delete, undo, trim, crop, aspect, export WebM + MP4, persists", async ({ page }) => {
  await record(page, { source: "Entire screen", mic: true, camera: true, systemAudio: false });
  await page.getByRole("link", { name: /Edit & export/ }).click();
  await page.waitForURL(/\/editor\?id=/);
  const canvas = page.getByTestId("editor-canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByTestId("clip-0")).toBeVisible();

  // Canvas actually renders frames (not blank).
  await page.waitForFunction(() => {
    const c = document.querySelector<HTMLCanvasElement>("[data-testid=editor-canvas]");
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return false;
    const d = ctx.getImageData(c.width / 2, c.height / 2, 1, 1).data;
    return d[3] > 0 && d[0] + d[1] + d[2] > 0;
  });

  // Playback advances.
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByTestId("edit-duration")).not.toHaveText(/^00:00 \//);

  const source = (await storedProject(page)) ?? null; // not saved until first edit
  expect(source).toBeNull();

  // Seek to the middle via the ruler and split.
  const ruler = page.getByTestId("timeline-ruler");
  const box = (await page.getByTestId("clip-0").boundingBox())!;
  await ruler.click({ position: { x: box.width / 2, y: 10 } });
  await page.keyboard.press("s");
  await expect(page.getByTestId("clip-1")).toBeVisible();
  await waitSaved(page);
  let p = (await storedProject(page))!;
  expect(p.clips).toHaveLength(2);
  const full = p.sourceDurationMs;
  expect(editedMs(p)).toBe(full);

  // Delete the first half.
  await page.getByTestId("clip-0").click({ position: { x: 20, y: 30 } });
  await page.getByRole("button", { name: "Delete clip" }).first().click();
  await expect(page.getByTestId("clip-1")).toHaveCount(0);
  await waitSaved(page);
  p = (await storedProject(page))!;
  expect(p.clips).toHaveLength(1);
  expect(p.clips[0].start).toBeGreaterThan(full * 0.3);

  // Undo / redo.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("clip-1")).toBeVisible();
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.getByTestId("clip-1")).toHaveCount(0);

  // Trim the end of the remaining clip by dragging its handle left.
  const handle = page.getByTestId("trim-end-0");
  await page.getByTestId("clip-0").click({ position: { x: 30, y: 30 } });
  const hb = (await handle.boundingBox())!;
  const clipBox = (await page.getByTestId("clip-0").boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x - clipBox.width * 0.3, hb.y + hb.height / 2, { steps: 8 });
  await page.mouse.up();
  await waitSaved(page);
  const beforeTrim = p;
  p = (await storedProject(page))!;
  expect(p.clips[0].end).toBeLessThan(beforeTrim.clips[0].end - 200);
  const finalMs = editedMs(p);

  // Aspect 1:1 + crop.
  await page.getByRole("button", { name: "Crop & size" }).click();
  await page.getByRole("radio", { name: "Aspect ratio: 1:1" }).click();
  const crop = page.getByTestId("crop-rect");
  await expect(crop).toBeVisible();
  const se = crop.locator("[data-handle=se]");
  const sb = (await se.boundingBox())!;
  const cb = (await crop.boundingBox())!;
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.mouse.down();
  await page.mouse.move(sb.x - cb.width * 0.4, sb.y - cb.height * 0.4, { steps: 8 });
  await page.mouse.up();
  await waitSaved(page);
  p = (await storedProject(page))!;
  expect(p.aspect).toBe("1:1");
  expect(p.crop.w).toBeLessThan(0.8);
  expect(p.crop.h).toBeLessThan(0.8);

  // Persistence across reload.
  await page.reload();
  await expect(page.getByTestId("clip-0")).toBeVisible();
  await expect(page.getByTestId("clip-1")).toHaveCount(0);

  // Exports (720p, 1:1 → 720×720).
  await exportAndCheck(page, "WebM", { w: 720, h: 720, durationMs: finalMs });
  const hasMp4 = await page.evaluate(() => MediaRecorder.isTypeSupported("video/mp4;codecs=avc1,mp4a.40.2") || MediaRecorder.isTypeSupported("video/mp4"));
  if (hasMp4) await exportAndCheck(page, "MP4", { w: 720, h: 720, durationMs: finalMs });
  test.info().annotations.push({ type: "mp4", description: hasMp4 ? "MP4 export tested" : "MP4 not supported in this browser" });
});

test("export can be cancelled", async ({ page }) => {
  await record(page, { source: "Entire screen", mic: false, camera: false, systemAudio: false });
  await page.getByRole("link", { name: /Edit & export/ }).click();
  await expect(page.getByTestId("clip-0")).toBeVisible();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /^Export (WebM|MP4)$/ }).click();
  await expect(dialog.getByRole("progressbar")).toBeVisible();
  await page.waitForTimeout(800);
  await dialog.getByRole("button", { name: "Cancel export" }).click();
  // Back to settings, no result.
  await expect(dialog.getByRole("button", { name: /^Export (WebM|MP4)$/ })).toBeVisible();
  await expect(dialog.getByTestId("export-result")).toHaveCount(0);
});
