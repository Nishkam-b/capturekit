import { expect, test, type Page } from "@playwright/test";
import { FAKE_MEDIA, record } from "./helpers";

test.use({ launchOptions: { args: [...FAKE_MEDIA, "--auto-select-desktop-capture-source=Entire screen"] } });
test.setTimeout(150_000);

async function storedProject<T = Record<string, unknown>>(page: Page): Promise<T> {
  const id = new URL(page.url()).searchParams.get("id");
  return page.evaluate(
    (rid) =>
      new Promise<T>((resolve, reject) => {
        const req = indexedDB.open("capturekit");
        req.onsuccess = () => {
          const g = req.result.transaction("projects").objectStore("projects").get(rid!);
          g.onsuccess = () => resolve(g.result);
          g.onerror = () => reject(g.error);
        };
        req.onerror = () => reject(req.error);
      }),
    id,
  );
}

async function settle(page: Page) {
  await page.waitForTimeout(700);
  await expect(page.getByText("All changes saved on this device")).toBeVisible();
}

const frame = (page: Page) => page.getByTestId("editor-canvas").evaluate((c: HTMLCanvasElement) => c.toDataURL("image/png"));

async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 10 });
  await page.mouse.up();
}

const center = async (page: Page, testId: string) => {
  const b = (await page.getByTestId(testId).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, b };
};

async function exportQuick(page: Page) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /^720p/ }).click();
  await dialog.getByRole("button", { name: /^Export (WebM|MP4)$/ }).click();
  await expect(dialog.getByTestId("export-result")).toBeVisible({ timeout: 60_000 });
  await dialog.getByRole("button", { name: "Close" }).click();
}

interface Webcam {
  x: number;
  y: number;
  size: number;
  shape: string;
  border: number;
  mirror: boolean;
}

test("webcam: drag to move, drag to resize, shape, border, mirror, export", async ({ page }) => {
  await record(page, { source: "Entire screen", mic: false, camera: true, systemAudio: false });
  await page.getByRole("link", { name: /Edit & export/ }).click();
  await expect(page.getByTestId("clip-0")).toBeVisible();
  await page.getByRole("button", { name: "Webcam", exact: true }).click();
  await expect(page.getByTestId("webcam-handle")).toBeVisible();
  const before = await frame(page);

  // Drag from bottom-right towards the top-left.
  const h = await center(page, "webcam-handle");
  const canvas = (await page.getByTestId("editor-canvas").boundingBox())!;
  await drag(page, h, canvas.x + canvas.width * 0.25 - h.x, canvas.y + canvas.height * 0.3 - h.y);
  await settle(page);
  let w = (await storedProject<{ webcam: Webcam }>(page)).webcam;
  expect(w.x).toBeLessThan(0.4);
  expect(w.y).toBeLessThan(0.45);
  expect(await frame(page)).not.toBe(before);

  // Resize by dragging the corner handle.
  const r = await center(page, "webcam-resize");
  const sizeBefore = w.size;
  await drag(page, r, 60, 60);
  await settle(page);
  w = (await storedProject<{ webcam: Webcam }>(page)).webcam;
  expect(w.size).toBeGreaterThan(sizeBefore + 0.03);

  // Style controls.
  await page.getByRole("radio", { name: "Webcam shape: Rectangle" }).click();
  await page.getByRole("switch", { name: "Mirror webcam" }).click();
  await page.getByRole("slider", { name: "Border", exact: true }).fill("0");
  await page.getByRole("button", { name: "Webcam corner ↗" }).click();
  await settle(page);
  w = (await storedProject<{ webcam: Webcam }>(page)).webcam;
  expect(w).toMatchObject({ shape: "rect", mirror: true, border: 0, x: 1, y: 0 });

  // Undo returns to the previous corner.
  await page.getByRole("button", { name: "Undo" }).click();
  await settle(page);
  w = (await storedProject<{ webcam: Webcam }>(page)).webcam;
  expect(w.x).not.toBe(1);

  await exportQuick(page);
});

interface Note {
  id: string;
  kind: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  start: number;
  end: number;
}

test("annotations: text, blur and arrow — add, edit on preview, timing, delete, undo, export", async ({ page }) => {
  await record(page, { source: "Entire screen", mic: false, camera: false, systemAudio: false });
  await page.getByRole("link", { name: /Edit & export/ }).click();
  await expect(page.getByTestId("clip-0")).toBeVisible();

  const ruler = (await page.getByTestId("timeline-ruler").boundingBox())!;
  await page.mouse.click(ruler.x + ruler.width * 0.2, ruler.y + ruler.height / 2);
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Annotations", exact: true }).click();
  const plain = await frame(page);

  // Text
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await expect(page.getByTestId("annotation-0")).toBeVisible();
  await page.getByLabel("Annotation text").fill("Hello CaptureKit");
  await page.getByLabel("Annotation text").blur();
  await settle(page);
  let notes = (await storedProject<{ annotations: Note[] }>(page)).annotations;
  expect(notes).toHaveLength(1);
  expect(notes[0]).toMatchObject({ kind: "text", text: "Hello CaptureKit" });
  const withText = await frame(page);
  expect(withText).not.toBe(plain);

  // Move the text on the preview.
  const textHit = await center(page, `annotation-hit-${notes[0].id}`);
  await drag(page, textHit, 80, 40);
  await settle(page);
  notes = (await storedProject<{ annotations: Note[] }>(page)).annotations;
  expect(notes[0].x).toBeGreaterThan(0.31);

  // Blur: add, resize from its corner, check it changes the frame.
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Blur", exact: true }).click();
  await settle(page);
  notes = (await storedProject<{ annotations: Note[] }>(page)).annotations;
  const blur = notes.find((n) => n.kind === "blur")!;
  const hit = page.getByTestId(`annotation-hit-${blur.id}`);
  const se = hit.locator("[data-handle=se]");
  const seBox = (await se.boundingBox())!;
  await drag(page, { x: seBox.x + seBox.width / 2, y: seBox.y + seBox.height / 2 }, 60, 40);
  await settle(page);
  notes = (await storedProject<{ annotations: Note[] }>(page)).annotations;
  expect(notes.find((n) => n.id === blur.id)!.w).toBeGreaterThan(blur.w + 0.02);
  const withBlur = await frame(page);
  expect(withBlur).not.toBe(withText);

  // Delete the blur with the Delete key, then undo.
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("annotation-1")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("annotation-1")).toBeVisible();

  // Arrow: drag its head. (Nothing is selected after delete + undo, so the Add buttons are right there.)
  await page.getByRole("button", { name: "Arrow", exact: true }).click();
  await settle(page);
  notes = (await storedProject<{ annotations: Note[] }>(page)).annotations;
  const arrow = notes.find((n) => n.kind === "arrow")!;
  const to = page.locator("[data-handle=to]");
  const toBox = (await to.boundingBox())!;
  await drag(page, { x: toBox.x + toBox.width / 2, y: toBox.y + toBox.height / 2 }, 70, -30);
  await settle(page);
  notes = (await storedProject<{ annotations: Note[] }>(page)).annotations;
  const moved = notes.find((n) => n.id === arrow.id)!;
  expect(moved.x).toBeCloseTo(arrow.x, 3); // tail stays
  expect(moved.w).toBeGreaterThan(arrow.w + 0.03);

  // Timing: drag the text's end later on the timeline.
  const textEnd = notes.find((n) => n.kind === "text")!.end;
  const endHandle = page.getByTestId("annotation-end-0");
  await page.getByTestId("annotation-0").click();
  const eb = (await endHandle.boundingBox())!;
  await drag(page, { x: eb.x + eb.width / 2, y: eb.y + eb.height / 2 }, 80, 0);
  await settle(page);
  notes = (await storedProject<{ annotations: Note[] }>(page)).annotations;
  expect(notes.find((n) => n.kind === "text")!.end).toBeGreaterThan(textEnd + 200);

  // Persist across reload, then export.
  await page.reload();
  await expect(page.getByTestId("annotation-2")).toBeVisible();
  await exportQuick(page);
});
