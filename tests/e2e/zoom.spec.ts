import { expect, test, type Page } from "@playwright/test";
import { FAKE_MEDIA, record } from "./helpers";

test.use({ launchOptions: { args: [...FAKE_MEDIA, "--auto-select-desktop-capture-source=Entire screen"] } });
test.setTimeout(150_000);

interface StoredZoom {
  segments: Array<{ id: string; start: number; end: number; level: number; mode: string; x: number; y: number; auto: boolean }>;
  auto: boolean;
}

async function storedZoom(page: Page): Promise<StoredZoom | null> {
  const id = new URL(page.url()).searchParams.get("id");
  return page.evaluate(
    (rid) =>
      new Promise<StoredZoom | null>((resolve, reject) => {
        const req = indexedDB.open("capturekit");
        req.onsuccess = () => {
          const g = req.result.transaction("projects").objectStore("projects").get(rid!);
          g.onsuccess = () => resolve(g.result?.zoom ?? null);
          g.onerror = () => reject(g.error);
        };
        req.onerror = () => reject(req.error);
      }),
    id,
  );
}

async function waitSaved(page: Page) {
  await page.waitForTimeout(700);
  await expect(page.getByText("All changes saved on this device")).toBeVisible();
}

const frame = (page: Page) => page.getByTestId("editor-canvas").evaluate((c: HTMLCanvasElement) => c.toDataURL("image/png"));

async function seekFraction(page: Page, f: number) {
  const ruler = (await page.getByTestId("timeline-ruler").boundingBox())!;
  await page.mouse.click(ruler.x + ruler.width * f, ruler.y + ruler.height / 2);
  await page.waitForTimeout(600);
}

test("manual zoom without cursor data: add, render, pick focus, resize, undo, export", async ({ page }) => {
  await record(page, { source: "Entire screen", mic: false, camera: false, systemAudio: false });
  await page.getByRole("link", { name: /Edit & export/ }).click();
  await expect(page.getByTestId("clip-0")).toBeVisible();

  // No telemetry: the Zoom panel explains auto zoom isn't available.
  await page.getByRole("button", { name: "Zoom", exact: true }).click();
  await expect(page.getByText(/Automatic zoom needs cursor data/)).toBeVisible();
  await expect(page.getByRole("switch", { name: "Auto zoom" })).toHaveCount(0);

  // Frame at a moment that will be inside the zoom, before adding it.
  await seekFraction(page, 0.4);
  const before = await frame(page);
  await seekFraction(page, 0.1);
  await page.keyboard.press("z");
  await expect(page.getByTestId("zoom-0")).toBeVisible();
  await waitSaved(page);
  let z = (await storedZoom(page))!;
  expect(z.segments).toHaveLength(1);
  expect(z.segments[0]).toMatchObject({ level: 2, mode: "fixed", auto: false });
  const seg = z.segments[0];
  expect(seg.end - seg.start).toBeGreaterThan(1000);

  // Same moment, now inside the zoom: the rendered frame must differ.
  await seekFraction(page, 0.4);
  const zoomed = await frame(page);
  expect(zoomed).not.toBe(before);

  // Pick a focus point in the top-left of the preview.
  const canvas = (await page.getByTestId("editor-canvas").boundingBox())!;
  await expect(page.getByText(/Click the preview to choose where to zoom/)).toBeVisible();
  await page.mouse.click(canvas.x + canvas.width * 0.2, canvas.y + canvas.height * 0.25);
  await waitSaved(page);
  z = (await storedZoom(page))!;
  expect(z.segments[0].x).toBeCloseTo(0.2, 1);
  expect(z.segments[0].y).toBeCloseTo(0.25, 1);

  // Change level and drag the end handle to make it longer.
  await page.getByRole("radio", { name: "Zoom level: 3×", exact: true }).click();
  const end = page.getByTestId("zoom-end-0");
  const eb = (await end.boundingBox())!;
  await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2);
  await page.mouse.down();
  await page.mouse.move(eb.x + 120, eb.y + eb.height / 2, { steps: 8 });
  await page.mouse.up();
  await waitSaved(page);
  const z2 = (await storedZoom(page))!;
  expect(z2.segments[0].level).toBe(3);
  expect(z2.segments[0].end).toBeGreaterThan(seg.end + 300);

  // Delete (Delete key with the Zoom tool) and undo.
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("zoom-0")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("zoom-0")).toBeVisible();

  // Export with the zoom.
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /^720p/ }).click();
  await dialog.getByRole("button", { name: /^Export (WebM|MP4)$/ }).click();
  await expect(dialog.getByTestId("export-result")).toBeVisible({ timeout: 60_000 });
});
