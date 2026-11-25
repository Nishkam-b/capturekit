import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { FAKE_MEDIA } from "./helpers";

test.use({ launchOptions: { args: [...FAKE_MEDIA, "--auto-select-desktop-capture-source=Entire screen"] } });
test.setTimeout(150_000);

/** A real PNG made in the browser: 800×500 with coloured blocks. */
async function makePng(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 800;
    c.height = 500;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, 800, 500);
    ctx.fillStyle = "#3b82f6";
    ctx.fillRect(40, 40, 300, 120);
    ctx.fillStyle = "#111827";
    ctx.font = "32px sans-serif";
    ctx.fillText("user@example.com", 60, 300);
    return c.toDataURL("image/png").split(",")[1];
  });
  return Buffer.from(b64, "base64");
}

async function storedShot(page: Page): Promise<Record<string, unknown>> {
  const id = new URL(page.url()).searchParams.get("id");
  return page.evaluate(
    (sid) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open("capturekit");
        req.onsuccess = () => {
          const g = req.result.transaction("screenshots").objectStore("screenshots").get(sid!);
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
  await expect(page.getByText(/All changes saved on this device/)).toBeVisible();
}

const frame = (page: Page) => page.getByTestId("shot-canvas").evaluate((c: HTMLCanvasElement) => c.toDataURL());

async function dragBy(page: Page, x: number, y: number, dx: number, dy: number) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}

const MAGIC: Record<string, (b: Buffer) => boolean> = {
  PNG: (b) => b.subarray(0, 4).toString("hex") === "89504e47",
  JPG: (b) => b.subarray(0, 3).toString("hex") === "ffd8ff",
  WEBP: (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP",
};

test("import → annotate, crop, style, frame → export PNG/JPG/WebP, copy, library, delete", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:3100" });
  await page.goto("/screenshots");
  await expect(page.getByRole("heading", { name: "Screenshots" })).toBeVisible();

  // A non-image is rejected with a clear message.
  await page.getByTestId("import-input").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.getByText(/isn't a supported image/)).toBeVisible();
  // A fake "PNG" that doesn't decode is rejected too.
  await page.getByTestId("import-input").setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("not really a png") });
  await expect(page.getByText(/couldn't be read/)).toBeVisible();

  const png = await makePng(page);
  await page.getByTestId("import-input").setInputFiles({ name: "Login page.png", mimeType: "image/png", buffer: png });
  await page.waitForURL(/\/screenshots\/edit\?id=/);
  await expect(page.getByTestId("shot-canvas")).toBeVisible();
  await expect(page.getByLabel("Screenshot name")).toHaveValue("Login page");
  let s = await storedShot(page);
  expect(s).toMatchObject({ imageW: 800, imageH: 500, frame: "none" });

  // Annotate: text + blur over the email + arrow.
  const plain = await frame(page);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByLabel("Annotation text").fill("Sign in here");
  await page.getByLabel("Annotation text").blur();
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Blur", exact: true }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Arrow", exact: true }).click();
  await settle(page);
  s = await storedShot(page);
  expect((s.annotations as unknown[]).length).toBe(3);
  expect(await frame(page)).not.toBe(plain);

  // Move the arrow head on the image.
  const to = (await page.locator("[data-handle=to]").boundingBox())!;
  await dragBy(page, to.x + to.width / 2, to.y + to.height / 2, 60, 30);
  await settle(page);

  // Crop from the bottom-right corner.
  await page.getByRole("button", { name: "Crop", exact: true }).click();
  const se = (await page.locator("[data-handle=se]").boundingBox())!;
  await dragBy(page, se.x + se.width / 2, se.y + se.height / 2, -80, -40);
  await settle(page);
  s = await storedShot(page);
  expect((s.crop as { w: number }).w).toBeLessThan(0.95);

  // Style + frame + square canvas.
  await page.getByRole("button", { name: "Background", exact: true }).click();
  await page.getByRole("radio", { name: "Background: Sky" }).click();
  await page.getByLabel("Padding").fill("0.1");
  await page.getByRole("radio", { name: "Canvas aspect: 1:1" }).click();
  await page.getByRole("button", { name: "Frame", exact: true }).click();
  await page.getByRole("radio", { name: "Frame: Browser", exact: true }).click();
  await settle(page);
  s = await storedShot(page);
  expect(s).toMatchObject({ background: "sky", frame: "browser", aspect: "1:1" });

  // Undo / redo
  await page.getByRole("button", { name: "Undo" }).click();
  await settle(page);
  expect((await storedShot(page)).frame).toBe("none");
  await page.getByRole("button", { name: "Redo" }).click();
  await settle(page);

  // Export in three formats.
  await page.getByRole("button", { name: "Export" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("shot-export-preview")).toBeVisible();
  const dims = await dialog.getByTestId("shot-export-preview").evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    return { w: img.naturalWidth, h: img.naturalHeight };
  });
  expect(dims.w).toBe(dims.h); // 1:1 canvas
  for (const [label, check] of Object.entries(MAGIC)) {
    const radio = dialog.getByRole("radio", { name: label === "WEBP" ? "WEBP" : label, exact: true });
    if ((await radio.count()) === 0) continue; // browser can't encode it
    await radio.click();
    await expect(dialog.getByText("updating…")).toHaveCount(0);
    await page.waitForTimeout(300);
    const [dl] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("link", { name: /^Download/ }).click()]);
    const bytes = await readFile(await dl.path());
    expect(check(bytes), `${label} signature`).toBe(true);
  }
  // 2× doubles the size.
  await dialog.getByRole("radio", { name: "PNG", exact: true }).click();
  await dialog.getByRole("radio", { name: /^2×/ }).click();
  await expect(dialog.getByTestId("shot-export-info")).toContainText(`${dims.w * 2}×${dims.h * 2}`);

  await dialog.getByRole("button", { name: "Copy" }).click();
  await expect(dialog.getByText("Copied to clipboard as PNG")).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();

  // Library lists it; delete.
  await page.goto("/screenshots");
  await expect(page.getByText("Login page")).toBeVisible();
  await expect(page.getByText("3 annotations")).toBeVisible();
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Delete Login page" }).click();
  await expect(page.getByText("No screenshots yet.")).toBeVisible();
});

test("open a screenshot taken during a recording in the editor", async ({ page }) => {
  await page.goto("/record");
  await page.getByRole("switch", { name: "Countdown" }).click();
  await page.getByRole("button", { name: "Start recording" }).click();
  await expect(page.getByTestId("timer").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Take screenshot" }).first().click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Stop recording" }).first().click();
  await page.waitForURL(/\/recordings\/view\?id=/);
  await page.getByRole("button", { name: "Edit screenshot 1" }).click();
  await page.waitForURL(/\/screenshots\/edit\?id=/);
  const s = await storedShot(page);
  expect(s.imageW as number).toBeGreaterThan(0);
  expect(s).toMatchObject({ source: { kind: "recording" } });
});

test("capture a screenshot directly", async ({ page }) => {
  await page.goto("/screenshots");
  await page.getByRole("button", { name: "Capture screen" }).click();
  await page.waitForURL(/\/screenshots\/edit\?id=/, { timeout: 15_000 });
  const s = await storedShot(page);
  expect(s.imageW as number).toBeGreaterThan(100);
  expect(s).toMatchObject({ source: { kind: "capture" } });
});
