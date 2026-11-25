import { expect, test, type Page } from "@playwright/test";
import { FAKE_MEDIA, timerMs } from "./helpers";

test.use({ launchOptions: { args: [...FAKE_MEDIA, "--auto-select-desktop-capture-source=Entire screen"] } });
test.setTimeout(120_000);

/** Counts records in an IndexedDB store of the app's database. */
async function count(page: Page, store: string): Promise<number> {
  return page.evaluate(
    (s) =>
      new Promise<number>((resolve, reject) => {
        const req = indexedDB.open("capturekit");
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(s)) {
            db.close();
            return resolve(0);
          }
          const c = db.transaction(s).objectStore(s).count();
          c.onsuccess = () => {
            resolve(c.result);
            db.close();
          };
          c.onerror = () => reject(c.error);
        };
        req.onerror = () => reject(req.error);
      }),
    store,
  );
}

/** Mocked storage quota (bytes). Change it at runtime with setQuota (survives reloads via sessionStorage). */
async function mockQuota(page: Page, initial: number) {
  await page.addInitScript((q) => {
    navigator.storage.estimate = async () => ({ usage: 0, quota: Number(sessionStorage.getItem("ckQuota") ?? q) });
  }, initial);
}
const setQuota = (page: Page, bytes: number) => page.evaluate((b) => sessionStorage.setItem("ckQuota", String(b)), bytes);

/** Warnings stored with the only saved recording. */
async function storedWarnings(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const req = indexedDB.open("capturekit");
        req.onsuccess = () => {
          const all = req.result.transaction("recordings").objectStore("recordings").getAll();
          all.onsuccess = () => resolve((all.result[0]?.warnings as string[]) ?? []);
          all.onerror = () => reject(all.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );
}

async function startRecording(page: Page) {
  await page.goto("/record");
  await page.getByRole("switch", { name: "Countdown" }).click();
  await page.getByRole("button", { name: "Start recording" }).click();
  await expect(page.getByTestId("timer").first()).toBeVisible({ timeout: 15_000 });
}

test("chunks are saved while recording and finalised on stop", async ({ page }) => {
  await startRecording(page);
  await page.waitForTimeout(3500);
  expect(await count(page, "pending")).toBe(1);
  expect(await count(page, "chunks")).toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Stop recording" }).first().click();
  await page.waitForURL(/\/recordings\/view\?id=/);
  expect(await count(page, "pending")).toBe(0);
  expect(await count(page, "chunks")).toBeGreaterThanOrEqual(3);
  expect(await count(page, "recordings")).toBe(1);
});

test("a recording interrupted by closing the tab can be recovered", async ({ page, context }) => {
  await startRecording(page);
  await page.waitForTimeout(4500);
  await page.close({ runBeforeUnload: false }); // simulates a crash / closed tab

  const next = await context.newPage();
  await next.goto("/");
  const banner = next.getByTestId("recovery-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("A recording was interrupted");
  await banner.getByRole("button", { name: "Recover" }).click();
  await next.waitForURL(/\/recordings\/view\?id=/);
  await expect(next.getByText(/\(recovered\)/)).toBeVisible();
  await expect(next.getByText(/Recovered after the recording was interrupted/)).toBeVisible();

  const video = next.getByTestId("preview-video");
  await next.waitForFunction(() => {
    const v = document.querySelector<HTMLVideoElement>("[data-testid=preview-video]");
    return !!v && v.readyState >= 1;
  });
  const d = await video.evaluate((v: HTMLVideoElement) => v.duration);
  expect(Number.isFinite(d)).toBe(true);
  expect(d).toBeGreaterThan(2.5);
  await video.evaluate(async (v: HTMLVideoElement) => {
    v.currentTime = 1.5;
    await new Promise((r) => v.addEventListener("seeked", r, { once: true }));
  });
  expect(await count(next, "pending")).toBe(0);

  // The banner is gone afterwards.
  await next.goto("/");
  await expect(next.getByTestId("recovery-banner")).toHaveCount(0);
});

test("an interrupted recording can be discarded, and live recordings aren't offered for recovery", async ({ page, context }) => {
  await startRecording(page);
  await page.waitForTimeout(2500);

  // While it's still recording in the first tab, a second tab must not offer recovery (Web Lock held).
  const other = await context.newPage();
  await other.goto("/");
  await other.waitForTimeout(800);
  await expect(other.getByTestId("recovery-banner")).toHaveCount(0);

  await page.close({ runBeforeUnload: false });
  await other.reload();
  await expect(other.getByTestId("recovery-banner")).toBeVisible();
  other.once("dialog", (d) => void d.accept());
  await other.getByRole("button", { name: "Discard" }).click();
  await expect(other.getByTestId("recovery-banner")).toHaveCount(0);
  expect(await count(other, "pending")).toBe(0);
  expect(await count(other, "chunks")).toBe(0);
});

test("keyboard shortcuts pause, screenshot and stop", async ({ page }) => {
  await startRecording(page);
  await page.waitForTimeout(1500);
  await page.keyboard.press("Alt+Shift+P");
  await expect(page.getByRole("button", { name: "Resume recording" }).first()).toBeVisible();
  const paused = await timerMs(page);
  await page.waitForTimeout(1500);
  expect(await timerMs(page)).toBe(paused);
  await page.keyboard.press("Alt+Shift+P");
  await expect(page.getByRole("button", { name: "Pause recording" }).first()).toBeVisible();
  await page.keyboard.press("Alt+Shift+C");
  await expect(page.getByRole("button", { name: "Take screenshot" }).first()).toContainText("1");
  await page.waitForTimeout(1000);
  await page.keyboard.press("Alt+Shift+S");
  await page.waitForURL(/\/recordings\/view\?id=/);
  await expect(page.getByText("Screenshots (1)")).toBeVisible();
});

test("setup blocks recording when storage is nearly full and warns when low", async ({ page }) => {
  await mockQuota(page, 5 * 1024 * 1024);
  await page.goto("/record");
  await expect(page.getByText("Not enough storage space")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start recording" })).toBeDisabled();

  await setQuota(page, 150 * 1024 * 1024);
  await page.reload();
  await expect(page.getByText("Storage is running low")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start recording" })).toBeEnabled();
});

test("recording stops itself and saves when storage runs out", async ({ page }) => {
  await mockQuota(page, 50 * 1024 * 1024 * 1024);
  await startRecording(page);
  await setQuota(page, 1024 * 1024);
  await page.waitForURL(/\/recordings\/view\?id=/, { timeout: 20_000 });
  await expect(page.getByText(/stopped automatically because browser storage was almost full/).first()).toBeVisible();
  const warnings = await storedWarnings(page);
  expect(warnings.filter((w) => w.includes("stopped automatically"))).toHaveLength(1);
  const d = await page.getByTestId("preview-video").evaluate(
    (v: HTMLVideoElement) =>
      new Promise<number>((r) => (v.readyState >= 1 ? r(v.duration) : v.addEventListener("loadedmetadata", () => r(v.duration), { once: true }))),
  );
  expect(Number.isFinite(d)).toBe(true);
});

test("recordings saved by older versions (DB v2, single-blob media) still load after the upgrade", async ({ page }) => {
  // /help never opens the database, so we can create the old schema first.
  await page.goto("/help");
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("capturekit", 2);
        req.onupgradeneeded = () => {
          const db = req.result;
          db.createObjectStore("recordings", { keyPath: "id" }).createIndex("createdAt", "createdAt");
          db.createObjectStore("projects", { keyPath: "recordingId" });
          db.createObjectStore("media", { keyPath: "key" }).createIndex("recordingId", "recordingId");
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(["recordings", "media"], "readwrite");
          tx.objectStore("recordings").put({
            schemaVersion: 1,
            id: "legacy-1",
            name: "Legacy recording",
            createdAt: Date.now() - 86_400_000,
            durationMs: 3000,
            size: 4,
            screen: { mimeType: "video/webm", width: 640, height: 360, size: 4, displaySurface: "monitor" },
            camera: null,
            audio: { mic: false, system: false },
            screenshots: [],
            warnings: [],
          });
          tx.objectStore("media").put({ key: "legacy-1/screen", recordingId: "legacy-1", blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: "video/webm" }) });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );

  await page.goto("/recordings");
  await expect(page.getByText("Legacy recording")).toBeVisible();
  // Upgraded to v3 with the new stores, old media still readable.
  const result = await page.evaluate(
    () =>
      new Promise<{ version: number; stores: string[]; size: number }>((resolve, reject) => {
        const req = indexedDB.open("capturekit");
        req.onsuccess = () => {
          const db = req.result;
          const get = db.transaction("media").objectStore("media").get("legacy-1/screen");
          get.onsuccess = () => resolve({ version: db.version, stores: Array.from(db.objectStoreNames), size: get.result.blob.size });
          get.onerror = () => reject(get.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );
  expect(result.version).toBe(5);
  expect(result.stores).toEqual(expect.arrayContaining(["chunks", "pending", "cursor", "screenshots", "recordings", "media", "projects"]));
  expect(result.size).toBe(4);
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Delete Legacy recording" }).click();
  await expect(page.getByText("No recordings yet")).toBeVisible();
});
