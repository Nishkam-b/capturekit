import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { landOnRecording } from "../e2e/helpers";

/**
 * Cursor tracking end-to-end with the real unpacked extension.
 * Branded Chrome ignores --load-extension, so this runs in Edge.
 *
 * Automation limit: with --use-fake-ui-for-media-stream, Chromium shares the requesting tab
 * itself (it can't auto-pick another tab with the real picker). So the recorded tab here is the
 * CaptureKit tab, and the mouse moves over its recording screen. Everything else (capture-handle
 * identification, tracking, timeline mapping, storage, rendering, export) is the real path.
 * Routing events from a *different* tab is the same code with another tab id; check it by hand.
 */
const BASE = "http://localhost:3100";
const EXT = path.resolve("extension");
test.setTimeout(180_000);

let ctx: BrowserContext;
let dir: string;

test.beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ck-ext-"));
  ctx = await chromium.launchPersistentContext(dir, {
    channel: "msedge",
    headless: false,
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  });
});

test.afterAll(async () => {
  await ctx?.close();
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
});

async function storedCursor(page: Page): Promise<number[] | null> {
  const id = new URL(page.url()).searchParams.get("id");
  return page.evaluate(
    (rid) =>
      new Promise<number[] | null>((resolve, reject) => {
        const req = indexedDB.open("capturekit");
        req.onsuccess = () => {
          const g = req.result.transaction("cursor").objectStore("cursor").get(rid!);
          g.onsuccess = () => resolve(g.result?.events ?? null);
          g.onerror = () => reject(g.error);
        };
        req.onerror = () => reject(req.error);
      }),
    id,
  );
}

test("records cursor moves and clicks in a shared tab and renders them in the editor", async () => {
  const app = await ctx.newPage();
  const target = app; // see note at the top
  await app.goto(`${BASE}/record`);
  await app.getByRole("radio", { name: /Browser tab/ }).click();
  await expect(app.getByTestId("cursor-extension-status")).toHaveText("Extension connected");
  await app.getByRole("switch", { name: "Countdown" }).click();
  await app.getByRole("button", { name: "Start recording" }).click();
  await expect(app.getByTestId("cursor-status")).toHaveText("Cursor tracking on", { timeout: 15_000 });

  // Move and click inside the recorded tab (CDP input reaches it even in the background).
  await target.mouse.move(100, 100);
  await target.mouse.move(640, 400, { steps: 25 });
  await app.waitForTimeout(400);
  await target.mouse.move(400, 300, { steps: 15 });
  await target.mouse.down();
  await target.mouse.up();
  await app.waitForTimeout(1200);
  await target.mouse.move(900, 600, { steps: 20 });
  await app.waitForTimeout(800);

  await app.getByRole("button", { name: "Stop recording" }).first().click();
  await landOnRecording(app);
  await expect(app.getByText("Cursor data")).toBeVisible();

  const flat = (await storedCursor(app))!;
  expect(flat.length).toBeGreaterThan(4 * 20);
  const events: Array<{ t: number; x: number; y: number; kind: number }> = [];
  for (let i = 0; i < flat.length; i += 4) events.push({ t: flat[i], x: flat[i + 1], y: flat[i + 2], kind: flat[i + 3] });
  const down = events.find((e) => e.kind === 1)!;
  expect(down).toBeTruthy();
  const vp = await target.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  expect(down.x).toBeCloseTo(400 / vp.w, 2);
  expect(down.y).toBeCloseTo(300 / vp.h, 2);
  expect(events.some((e) => e.kind === 2)).toBe(true);
  // Times are on the recording timeline, increasing.
  expect(events.every((e, i) => i === 0 || e.t >= events[i - 1].t)).toBe(true);
  expect(down.t).toBeGreaterThan(0);

  // Editor: cursor panel, click marker, rendered cursor.
  await app.getByRole("link", { name: /Edit & export/ }).click();
  await expect(app.getByTestId("clip-0")).toBeVisible();
  await expect(app.getByTestId("click-marker")).toHaveCount(1);
  await app.getByRole("button", { name: "Cursor", exact: true }).click();
  await expect(app.getByText(/cursor events recorded/)).toBeVisible();

  // Seek to just after the click, then compare frames with the cursor on and off.
  const marker = (await app.getByTestId("click-marker").boundingBox())!;
  const ruler = (await app.getByTestId("timeline-ruler").boundingBox())!;
  await app.mouse.click(marker.x + marker.width / 2 + 3, ruler.y + ruler.height / 2);
  await app.waitForTimeout(700);
  const frame = () => app.getByTestId("editor-canvas").evaluate((c: HTMLCanvasElement) => c.toDataURL("image/png"));
  const withCursor = await frame();
  await app.getByRole("switch", { name: "Show cursor" }).click();
  await app.getByRole("radio", { name: "Click effect: None" }).click();
  await app.waitForTimeout(400);
  const without = await frame();
  expect(withCursor).not.toBe(without);

  // Export with cursor effects (re-enable them first).
  await app.getByRole("switch", { name: "Show cursor" }).click();
  await app.getByRole("radio", { name: "Click effect: Ripple" }).click();
  await app.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = app.getByRole("dialog");
  await dialog.getByRole("radio", { name: /^720p/ }).click();
  await dialog.getByRole("button", { name: /^Export (WebM|MP4)$/ }).click();
  await expect(dialog.getByTestId("export-result")).toBeVisible({ timeout: 60_000 });
});

test("screen recordings explain the cursor is in the video and auto zoom comes from the editor", async () => {
  const app = await ctx.newPage();
  await app.goto(`${BASE}/record`);
  await app.getByRole("radio", { name: /Entire screen/ }).click();
  await expect(app.getByTestId("cursor-extension-status")).toHaveText("Follows clicks");
  await expect(app.getByText(/Your cursor is part of the video/)).toBeVisible();
});

async function storedZoomSegments(page: Page): Promise<Array<{ auto: boolean; mode: string; start: number; end: number }>> {
  const id = new URL(page.url()).searchParams.get("id");
  return page.evaluate(
    (rid) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open("capturekit");
        req.onsuccess = () => {
          const g = req.result.transaction("projects").objectStore("projects").get(rid!);
          g.onsuccess = () => resolve(g.result?.zoom?.segments ?? []);
          g.onerror = () => reject(g.error);
        };
        req.onerror = () => reject(req.error);
      }),
    id,
  );
}

test("auto zoom: clicks create steady zooms; toggling, deleting and regenerating behave", async () => {
  // Own browser profile: fake-UI capture can pick a leftover tab from earlier tests.
  const own = await mkdtemp(path.join(os.tmpdir(), "ck-ext-zoom-"));
  const zctx = await chromium.launchPersistentContext(own, {
    channel: "msedge",
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });
  const app = zctx.pages()[0] ?? (await zctx.newPage());
  try {
  await app.goto(`${BASE}/record`);
  await app.getByRole("radio", { name: /Browser tab/ }).click();
  await expect(app.getByTestId("cursor-extension-status")).toHaveText("Extension connected");
  await app.getByRole("switch", { name: "Countdown" }).click();
  await app.getByRole("button", { name: "Start recording" }).click();
  await expect(app.getByTestId("cursor-status")).toHaveText("Cursor tracking on", { timeout: 15_000 });

  // Wander (no zoom expected from this), then two clicks close together → one zoom.
  for (let i = 0; i <= 30; i++) await app.mouse.move(300 + i * 15, 300 + Math.sin(i / 4) * 80);
  await app.waitForTimeout(1500);
  await app.mouse.move(500, 350, { steps: 5 });
  await app.mouse.down();
  await app.mouse.up();
  await app.waitForTimeout(700);
  await app.mouse.move(700, 420, { steps: 5 });
  await app.mouse.down();
  await app.mouse.up();
  await app.waitForTimeout(2500);
  await app.getByRole("button", { name: "Stop recording" }).first().click();
  await landOnRecording(app);

  await app.getByRole("link", { name: /Edit & export/ }).click();
  await expect(app.getByTestId("clip-0")).toBeVisible();
  // New project with cursor data: auto zoom is on, one zoom for the click cluster.
  await expect(app.getByTestId("zoom-0")).toBeVisible();
  await expect(app.getByTestId("zoom-1")).toHaveCount(0);

  await app.getByRole("button", { name: "Zoom", exact: true }).click();
  const auto = app.getByRole("switch", { name: "Auto zoom" });
  await expect(auto).toHaveAttribute("aria-checked", "true");
  await auto.click();
  await expect(app.getByTestId("zoom-0")).toHaveCount(0);
  await auto.click();
  await expect(app.getByTestId("zoom-0")).toBeVisible();
  await app.waitForTimeout(700);
  const segs = await storedZoomSegments(app);
  expect(segs).toHaveLength(1);
  expect(segs[0]).toMatchObject({ auto: true, mode: "fixed" });

  // Deleting an auto zoom keeps it deleted when settings change (regeneration).
  await app.getByTestId("zoom-0").click();
  await app.keyboard.press("Delete");
  await expect(app.getByTestId("zoom-0")).toHaveCount(0);
  await app.getByRole("radio", { name: "Default zoom level: 2.5×" }).click();
  await expect(app.getByTestId("zoom-0")).toHaveCount(0);
  } finally {
    await zctx.close();
    await rm(own, { recursive: true, force: true }).catch(() => undefined);
  }
});
